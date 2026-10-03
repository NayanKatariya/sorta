import "server-only";
import { composio, executeTool } from "./composio";
import { bareAddress, fetchReplyContext, splitAddresses } from "./gmail";
import { HttpError } from "./session";
import { readAccounts, readEmail, readSettings, type Ctx } from "./store";
import type { Account, Settings } from "./types";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_RECIPIENTS } from "./send-limits";

/**
 * Sending and replying, independent of how the request arrived. The web routes hand in multipart uploads,
 * the MCP server hands in base64; both end up as plain objects with {name, mimeType, bytes} attachments.
 */

export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_RECIPIENTS };
const MAX_BODY_CHARS = 200_000;
const MAX_SUBJECT_CHARS = 500;

export type OutAttachment = { name: string; mimeType: string; bytes: Uint8Array };

export type SendInput = {
  /** Mailbox to send from, by Composio account id or address. Falls back to the user's default, then the first enabled one. */
  accountId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain text. */
  body: string;
  /** An HTML version; when set it is what gets sent. */
  html?: string;
  attachments?: OutAttachment[];
  /** Add the default CC/BCC from settings (default true). A composer that already pre-filled them sets false. */
  defaults?: boolean;
  /** Append the signature from settings (default true). */
  signature?: boolean;
};

export type ReplyInput = {
  /** A stored email of the conversation; names both the thread and the mailbox. */
  emailId?: string;
  /** Or the thread directly, together with the mailbox it lives in. */
  threadId?: string;
  accountId?: string;
  body: string;
  html?: string;
  /** Extra recipients on top of the reply's own. */
  cc?: string[];
  bcc?: string[];
  /** Also address everyone else on the newest message. */
  replyAll?: boolean;
  attachments?: OutAttachment[];
  defaults?: boolean;
  signature?: boolean;
};

export type SendResult = {
  /** Gmail's id for the sent message, when Composio reports one. */
  id: string | null;
  threadId: string | null;
  accountId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  attachments: number;
};

// ---- validation ----

const ADDRESS = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/;

/** A bare, lower-cased address from "a@x.com" or "Name <a@x.com>"; throws a 400 naming the bad value. */
export function parseAddress(raw: string): string {
  const email = bareAddress(raw);
  if (!email || email.length > 254 || !ADDRESS.test(email)) throw new HttpError(400, `"${raw.slice(0, 80)}" isn't a valid email address.`);
  return email;
}

/** Validates a recipient list: strings only, each an address, no duplicates, at most `max`. */
export function parseAddresses(v: unknown, what: string, max = MAX_RECIPIENTS, maxChars?: number): string[] {
  if (v === undefined || v === null || v === "") return [];
  // Accept "a@x.com, B <b@y.com>" as well as a real list.
  const items = typeof v === "string" ? splitAddresses(v) : v;
  if (!Array.isArray(items) || items.some((x) => typeof x !== "string")) throw new HttpError(400, `${what} must be a list of email addresses.`);
  if (items.length > max) throw new HttpError(400, `Too many ${what} addresses (max ${max}).`);
  const list = [...new Set((items as string[]).flatMap((s) => splitAddresses(s)).map(parseAddress))];
  // Checked after splitting, since one entry can hold several addresses.
  if (list.length > max) throw new HttpError(400, `Too many ${what} addresses (max ${max}).`);
  if (maxChars !== undefined && list.join(",").length > maxChars) throw new HttpError(400, `The ${what} addresses are too long in total (max ${maxChars} characters).`);
  return list;
}

function cleanAttachments(list: OutAttachment[] | undefined): OutAttachment[] {
  const out = list ?? [];
  if (out.length > MAX_ATTACHMENTS) throw new HttpError(400, `Too many attachments (max ${MAX_ATTACHMENTS}).`);
  let total = 0;
  const cleaned = out.map((a) => {
    // Only a bare file name ever reaches Gmail: no paths, no control characters.
    const name = a.name.replace(/[\\/]+/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "attachment";
    if (!a.bytes.byteLength) throw new HttpError(400, `"${name}" is empty.`);
    total += a.bytes.byteLength;
    const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(a.mimeType) ? a.mimeType : "application/octet-stream";
    return { name, mimeType, bytes: a.bytes };
  });
  if (total > MAX_ATTACHMENT_BYTES) {
    throw new HttpError(413, `Attachments total ${(total / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB per message.`);
  }
  return cleaned;
}

function cleanBody(body: string, html: string | undefined, hasFiles: boolean) {
  if (typeof body !== "string" || (html !== undefined && typeof html !== "string")) throw new HttpError(400, "The message body must be text.");
  if (body.length > MAX_BODY_CHARS || (html?.length ?? 0) > MAX_BODY_CHARS * 2) throw new HttpError(413, "The message is too long.");
  const text = body.replace(/\r\n/g, "\n");
  if (!text.trim() && !html?.trim() && !hasFiles) throw new HttpError(400, "Write a message or attach a file.");
  return { text, html: html?.trim() ? html : undefined };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text, or HTML when the caller supplied it, with the signature (if any) in the same format. */
function compose(text: string, html: string | undefined, signature: string) {
  const sig = signature.trim();
  if (html !== undefined) {
    return { body: sig ? `${html}<br><br>-- <br>${escapeHtml(sig).replace(/\n/g, "<br>")}` : html, isHtml: true };
  }
  return { body: sig ? `${text.replace(/\s+$/, "")}\n\n-- \n${sig}` : text, isHtml: false };
}

// ---- accounts and defaults ----

const usable = (a: Account) => a.status === "ACTIVE";

/** The mailbox a message goes out from. Explicit choices must be the user's own and connected. */
function pickAccount(accounts: Account[], requested: string | undefined, settings: Settings): Account {
  if (requested) {
    const want = requested.trim().toLowerCase();
    const found = accounts.find((a) => a.id === requested || a.email.toLowerCase() === want);
    if (!found) throw new HttpError(400, "That Gmail account isn't connected to Sorta.");
    if (!usable(found)) throw new HttpError(409, `${found.email} needs to be reconnected before it can send.`);
    return found;
  }
  const fallback =
    accounts.find((a) => a.id === settings.defaultFromAccount && usable(a)) ??
    accounts.find((a) => a.enabled && usable(a)) ??
    accounts.find(usable);
  if (!fallback) throw new HttpError(409, "Connect a Gmail account before sending.");
  return fallback;
}

/** To first, then CC, then BCC: an address already in an earlier field is dropped from later ones. */
function dedupe(to: string[], cc: string[], bcc: string[]) {
  const seen = new Set(to);
  const take = (list: string[]) => list.filter((a) => !seen.has(a) && seen.add(a));
  return { to, cc: take(cc), bcc: take(bcc) };
}

// ---- Gmail ----

type Staged = { name: string; mimetype: string; s3key: string };

/** Uploads each file to Composio's storage; the Gmail tools take the returned descriptors in place of paths. */
async function stage(ctx: Ctx, slug: string, files: OutAttachment[]): Promise<Staged[]> {
  if (!files.length) return [];
  const client = await composio(ctx);
  return Promise.all(
    files.map((f) =>
      client.files.upload({
        file: new File([f.bytes as Uint8Array<ArrayBuffer>], f.name, { type: f.mimeType }),
        toolSlug: slug,
        toolkitSlug: "gmail",
      }),
    ),
  );
}

/** Composio returns the Gmail message resource, sometimes wrapped in `response_data`. */
function sentIds(data: unknown) {
  const d = (data ?? {}) as { id?: string; threadId?: string; response_data?: { id?: string; threadId?: string } };
  return { id: d.id ?? d.response_data?.id ?? null, threadId: d.threadId ?? d.response_data?.threadId ?? null };
}

export async function sendEmail(ctx: Ctx, input: SendInput): Promise<SendResult> {
  const files = cleanAttachments(input.attachments);
  const to = parseAddresses(input.to, "To");
  if (!to.length) throw new HttpError(400, "Add at least one recipient.");
  const subject = String(input.subject ?? "").replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, " ").trim();
  if (subject.length > MAX_SUBJECT_CHARS) throw new HttpError(400, `The subject is too long (max ${MAX_SUBJECT_CHARS} characters).`);
  const { text, html } = cleanBody(input.body, input.html, files.length > 0);
  if (!subject && !text.trim() && !html) throw new HttpError(400, "Add a subject or a message.");

  const [accounts, settings] = await Promise.all([readAccounts(ctx), readSettings(ctx)]);
  const account = pickAccount(accounts, input.accountId, settings);
  const useDefaults = input.defaults !== false;
  const lists = dedupe(
    to,
    [...parseAddresses(input.cc, "CC"), ...(useDefaults ? settings.defaultCc : [])],
    [...parseAddresses(input.bcc, "BCC"), ...(useDefaults ? settings.defaultBcc : [])],
  );
  if (lists.to.length + lists.cc.length + lists.bcc.length > MAX_RECIPIENTS) throw new HttpError(400, `Too many recipients (max ${MAX_RECIPIENTS}).`);

  const { body, isHtml } = compose(text, html, input.signature === false ? "" : settings.signature);
  const staged = await stage(ctx, "GMAIL_SEND_EMAIL", files);
  const data = await executeTool(
    ctx,
    "GMAIL_SEND_EMAIL",
    {
      recipient_email: lists.to[0],
      extra_recipients: lists.to.slice(1),
      cc: lists.cc,
      bcc: lists.bcc,
      subject,
      body,
      is_html: isHtml,
      ...(account.email.includes("@") ? { from_email: account.email } : {}),
      ...(staged.length ? { attachment: staged } : {}),
    },
    account.id,
    account.userId,
  );
  return { ...sentIds(data), accountId: account.id, from: account.email, ...lists, subject, attachments: files.length };
}

export async function replyToThread(ctx: Ctx, input: ReplyInput): Promise<SendResult> {
  const files = cleanAttachments(input.attachments);
  const { text, html } = cleanBody(input.body, input.html, files.length > 0);

  let threadId = input.threadId?.trim();
  let accountId = input.accountId;
  if (input.emailId) {
    const email = await readEmail(ctx, input.emailId);
    if (!email) throw new HttpError(404, "Email not found. Try syncing.");
    threadId = email.threadId;
    accountId = email.accountId;
  }
  if (!threadId || !accountId) throw new HttpError(400, "Say which email or conversation to reply to.");
  if (!/^[\w-]{6,64}$/.test(threadId)) throw new HttpError(400, "That isn't a valid thread id.");

  const [accounts, settings] = await Promise.all([readAccounts(ctx), readSettings(ctx)]);
  // A reply leaves from the mailbox the conversation is in, never from the default.
  const account = pickAccount(accounts, accountId, settings);
  const target = await fetchReplyContext(ctx, account, threadId);

  const me = account.email.toLowerCase();
  const mine = (a: string) => a === me;
  // Headers come from whoever wrote to the user: keep only addresses that pass the same check as typed ones.
  const parse = (list: string[]) => list.map(bareAddress).filter((a): a is string => a !== null && a.length <= 254 && ADDRESS.test(a));
  const toAll = [...new Set([...parse(target.to), ...(input.replyAll ? parse(target.others) : [])])].filter((a) => !mine(a));
  // Replying to yourself (a note-to-self thread) would otherwise leave no one to send to.
  const to = toAll.length ? toAll : parse(target.to);
  if (!to.length) throw new HttpError(409, "Couldn't work out who to reply to. Start a new message instead.");

  const useDefaults = input.defaults !== false;
  const lists = dedupe(
    to,
    [...(input.replyAll ? parse(target.cc).filter((a) => !mine(a)) : []), ...parseAddresses(input.cc, "CC"), ...(useDefaults ? settings.defaultCc : [])],
    [...parseAddresses(input.bcc, "BCC"), ...(useDefaults ? settings.defaultBcc : [])],
  );
  if (lists.to.length + lists.cc.length + lists.bcc.length > MAX_RECIPIENTS) throw new HttpError(400, `Too many recipients (max ${MAX_RECIPIENTS}).`);

  const { body, isHtml } = compose(text, html, input.signature === false ? "" : settings.signature);
  const staged = await stage(ctx, "GMAIL_REPLY_TO_THREAD", files);
  // The tool threads the reply (thread id, In-Reply-To, "Re:" subject) itself; it has no From field,
  // so it sends as the mailbox the connection belongs to.
  const data = await executeTool(
    ctx,
    "GMAIL_REPLY_TO_THREAD",
    {
      thread_id: threadId,
      recipient_email: lists.to[0],
      extra_recipients: lists.to.slice(1),
      cc: lists.cc,
      bcc: lists.bcc,
      message_body: body,
      is_html: isHtml,
      ...(staged.length ? { attachment: staged } : {}),
    },
    account.id,
    account.userId,
  );
  const subject = /^\s*re:/i.test(target.subject) ? target.subject.trim() : `Re: ${target.subject.trim() || "(no subject)"}`;
  return { ...sentIds(data), threadId: sentIds(data).threadId ?? threadId, accountId: account.id, from: account.email, ...lists, subject, attachments: files.length };
}
