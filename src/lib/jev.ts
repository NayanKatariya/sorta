import "server-only";
import { choice, noul, score, TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import type { Analysis, Category, Email, JunkKind } from "./types";

let client: TypeSafeClient | null = null;

const COMMAND_CODE_URL = "https://api.commandcode.ai/provider";

/**
 * The SDK appends `/v1/systemone` itself, so it needs the provider's API root. Accept whatever people paste:
 * the root, the root + `/v1`, or the full `/v1/systemone` endpoint. commandcode.ai's own pages
 * (e.g. commandcode.ai/models/jev) are docs, not an API, so they map to Command Code's provider API.
 */
export function normalizeBaseURL(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`JEV_BASE_URL isn't a valid URL: "${value}". Use the provider's API root, e.g. ${COMMAND_CODE_URL}`);
  }
  if (/^(www\.)?commandcode\.ai$/i.test(url.hostname)) {
    if (url.href.replace(/\/+$/, "") !== COMMAND_CODE_URL) console.warn(`[jev] JEV_BASE_URL ${value} is a web page; using ${COMMAND_CODE_URL}`);
    return COMMAND_CODE_URL;
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "").replace(/\/v1(\/systemone)?$/i, "");
}

/**
 * Jev speaks TypeSafe's /v1/systemone wire format wherever it's served, so any provider works:
 * JEV_API_KEY + JEV_BASE_URL (+ JEV_MODEL). With no base URL, CMD_API_KEY means Command Code's
 * provider API and TYPESAFE_API_KEY means TypeSafe directly. On Command Code the model defaults to `typesafe/jev`.
 */
function jevConfig() {
  const apiKey = (process.env.JEV_API_KEY || process.env.CMD_API_KEY || process.env.TYPESAFE_API_KEY)?.trim();
  const viaCommandCodeKey = !process.env.JEV_API_KEY && Boolean(process.env.CMD_API_KEY);
  const baseURL = normalizeBaseURL(process.env.JEV_BASE_URL || process.env.CMD_BASE_URL) ?? (viaCommandCodeKey ? COMMAND_CODE_URL : undefined);
  const onCommandCode = baseURL === COMMAND_CODE_URL || (baseURL ? new URL(baseURL).hostname === "api.commandcode.ai" : false);
  const model = process.env.JEV_MODEL?.trim() || (onCommandCode ? "typesafe/jev" : undefined);
  return { apiKey, baseURL, model };
}

function jev() {
  if (!client) {
    const { apiKey, baseURL, model } = jevConfig();
    client = new TypeSafeClient({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(model ? { defaultModel: model } : {}),
      timeout: 20_000,
      // Providers return 503 "temporarily unavailable" in bursts; the SDK backs off 0.5→5 s between tries.
      retry: { maxRetries: 4 },
    });
  }
  return client;
}

export const jevConfigured = () => Boolean(jevConfig().apiKey);

/** Where requests go, for error messages. Never includes the key. */
function jevTarget() {
  const { baseURL, model } = jevConfig();
  return `${baseURL ?? "https://api.typesafe.ai"}/v1/systemone (model ${model ?? "jev-latest"})`;
}

/**
 * Every email failing means Jev itself is unreachable or misconfigured (wrong URL, key or model), not a bad email.
 * Say so, instead of finishing a sync with nothing sorted.
 */
function failIfAllFailed(total: number, failed: number, firstError: unknown) {
  if (total === 0 || failed < total) return;
  const reason = firstError instanceof Error ? firstError.message : String(firstError);
  throw new Error(`Jev couldn't read any email (${reason}). Requests went to ${jevTarget()}. Check JEV_BASE_URL, JEV_API_KEY and JEV_MODEL.`);
}

/** Only what the questions need: sender, subject and the preview text. */
function emailState(e: Email) {
  return {
    email: {
      from: e.from,
      subject: e.subject,
      preview: e.preview.slice(0, 600),
      gmail_folder: e.folder === "spam" ? "Spam" : "Inbox",
    },
  };
}

const junkKindQuestion = choice(
  {
    question:
      "Which kind of email is `email`? Judge from the sender, subject and preview. Pick `not_junk` whenever the email is personal, transactional, or about the recipient's own accounts, orders, work or security.",
    note: "`email.gmail_folder` is Gmail's own guess and can be wrong.",
  },
  {
    scam_or_phishing:
      "Fraud: fake prizes, fake invoices, impersonating a bank or service, requests for credentials or payment to an unknown party, crypto or loan schemes.",
    spam: "Unsolicited bulk mail from a sender the recipient has no apparent relationship with, e.g. SEO offers, cold sales blasts, adult or pharma spam.",
    promotion:
      "Marketing from a company the recipient knows: sales, discounts, offers, product launches, 'come back' nudges, loan or credit card offers.",
    newsletter: "Editorial digests or content roundups the recipient subscribed to (blogs, Substack, Reddit/Quora digests, job alert digests).",
    social_notification: "Automated social-network pings: likes, follows, 'people you may know', 'you appeared in searches'.",
    not_junk:
      "Anything the recipient likely needs: personal or work messages, receipts, bills, bookings, deliveries, one-time codes, security alerts, account or subscription notices about their own account.",
  },
);

const priorityQuestion = score(
  "How much does `email` need the recipient's personal attention?",
  [
    "No attention needed: bulk, automated or promotional content.",
    "Worth a glance: informational updates about the recipient's own accounts or orders.",
    "Needs attention soon: a real person writing to them, a bill due, a decision or document to review.",
    "Urgent: time-critical security alert, payment failure, deadline today, or someone waiting on an immediate answer.",
  ],
);

const needsReplyQuestion = noul(
  "Does `email` ask the recipient a direct question or request a reply from them personally?",
  {
    true: "A person (not an automated system) expects the recipient to write back.",
    false: "Automated, broadcast, or informational; no personal reply is expected.",
  },
);

function categoryQuestion(categories: Category[]) {
  const criteria: Record<string, string> = {};
  for (const c of categories) criteria[c.id] = `${c.name}: ${c.description || c.name}`;
  criteria.none = "None of the other categories describes this email well.";
  return choice("Which category best describes what `email` is about?", criteria);
}

export function categoryVersion(categories: Category[]) {
  return categories.map((c) => `${c.id}:${c.name}:${c.description}`).join("|");
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Full analysis: junk kind, priority, reply-needed and category, asked together in one request per email. */
export async function analyzeEmails(
  emails: Email[],
  categories: Category[],
  onProgress?: (done: number) => void,
): Promise<Record<string, Analysis>> {
  const version = categoryVersion(categories);
  const results: Record<string, Analysis> = {};
  let done = 0;
  let failed = 0;
  let firstError: unknown;
  await pool(emails, 12, async (e) => {
    const questions: Questions = {
      junk: junkKindQuestion,
      priority: priorityQuestion,
      reply: needsReplyQuestion,
      ...(categories.length ? { category: categoryQuestion(categories) } : {}),
    };
    try {
      const { answers } = await jev().systemOne({ state: emailState(e), questions });
      const junk = answers.junk as { choice: string; probabilities: Record<string, number> };
      const cat = answers.category as { choice: string; confidence: number } | undefined;
      results[e.id] = {
        junkKind: junk.choice as JunkKind,
        junkProbabilities: junk.probabilities as Analysis["junkProbabilities"],
        priority: (answers.priority as { score: number }).score,
        needsReply: (answers.reply as { noul: number }).noul,
        category: cat && cat.choice !== "none" ? cat.choice : null,
        categoryConfidence: cat?.confidence ?? 0,
        categoryVersion: version,
      };
    } catch (err) {
      console.error(`[jev] analyze ${e.id} failed`, err);
      failed++;
      firstError ??= err;
    }
    onProgress?.(++done);
  });
  failIfAllFailed(emails.length, failed, firstError);
  return results;
}

/** Re-run only the category question (after categories were added or edited). */
export async function recategorize(emails: Email[], categories: Category[]) {
  const version = categoryVersion(categories);
  const out: Record<string, { category: string | null; categoryConfidence: number; categoryVersion: string }> = {};
  if (!categories.length) {
    for (const e of emails) out[e.id] = { category: null, categoryConfidence: 0, categoryVersion: version };
    return out;
  }
  const q = categoryQuestion(categories);
  let failed = 0;
  let firstError: unknown;
  await pool(emails, 12, async (e) => {
    try {
      const { answers } = await jev().systemOne({ state: emailState(e), questions: { category: q } });
      out[e.id] = {
        category: answers.category.choice !== "none" ? answers.category.choice : null,
        categoryConfidence: answers.category.confidence,
        categoryVersion: version,
      };
    } catch (err) {
      console.error(`[jev] recategorize ${e.id} failed`, err);
      failed++;
      firstError ??= err;
    }
  });
  failIfAllFailed(emails.length, failed, firstError);
  return out;
}

/** Natural-language search: probability each email matches a plain-English description. */
export async function smartSearch(emails: Email[], query: string) {
  const q = noul({ search: query, question: "Does `email` match the description in `search`?" });
  const out: Record<string, number> = {};
  let failed = 0;
  let firstError: unknown;
  await pool(emails, 12, async (e) => {
    try {
      const { answers } = await jev().systemOne({ state: emailState(e), questions: { match: q } });
      out[e.id] = answers.match.noul;
    } catch (err) {
      console.error(`[jev] search ${e.id} failed`, err);
      failed++;
      firstError ??= err;
    }
  });
  failIfAllFailed(emails.length, failed, firstError);
  return out;
}
