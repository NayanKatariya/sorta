import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { fetchThread } from "./gmail";
import type { Scope } from "./mcp-tokens";
import { MAX_ATTACHMENTS, replyToThread, sendEmail, type OutAttachment } from "./send";
import { errorMessage, HttpError } from "./session";
import { readAccounts, readAnalysis, readCategories, readEmail, readEmails, readSettings, type Ctx } from "./store";
import type { Email } from "./types";

/**
 * The MCP tools. Everything runs as the token's owner through `ctx` (service-role client, so every store
 * call filters on ctx.userId), and mail goes through the same send/reply core as the web app. Nothing here
 * calls Jev: reading is plain database access and Gmail through Composio.
 */

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;
/** One message's text is cut here so a long thread can't flood an agent's context. */
const TEXT_MAX = 20_000;

const json = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (text: string): CallToolResult => ({ isError: true, content: [{ type: "text", text }] });

/** Tool errors go back to the agent as results it can read and act on, not as protocol errors. */
async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof HttpError)) console.error("[mcp] tool failed", err);
    return failure(errorMessage(err));
  }
}

// ---- mail listing (plain database reads) ----

type Filters = {
  category?: string;
  account?: string;
  folder?: "inbox" | "spam" | "any";
  unread?: boolean;
  query?: string;
  limit?: number;
  offset?: number;
};

async function listEmails(ctx: Ctx, f: Filters) {
  const [accounts, categories, emails, analysis] = await Promise.all([readAccounts(ctx), readCategories(ctx), readEmails(ctx), readAnalysis(ctx)]);
  // Like the app, only mailboxes switched on in Sorta count.
  const on = new Set(accounts.filter((a) => a.enabled).map((a) => a.id));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  let accountId: string | undefined;
  if (f.account) {
    const want = f.account.trim().toLowerCase();
    const found = accounts.find((a) => a.id === f.account || a.email.toLowerCase() === want);
    if (!found) throw new HttpError(400, "Unknown account. Call list_accounts for the ids and addresses.");
    accountId = found.id;
  }
  let categoryId: string | null | undefined;
  if (f.category) {
    const want = f.category.trim().toLowerCase();
    if (want === "uncategorized") categoryId = null;
    else {
      const found = categories.find((c) => c.id === f.category || c.name.toLowerCase() === want);
      if (!found) throw new HttpError(400, "Unknown category. Call list_categories for the ids and names.");
      categoryId = found.id;
    }
  }
  const terms = (f.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);

  const matches = Object.values(emails)
    .filter((e) => on.has(e.accountId))
    .filter((e) => (accountId ? e.accountId === accountId : true))
    .filter((e) => (f.folder && f.folder !== "any" ? e.folder === f.folder : true))
    .filter((e) => (f.unread === undefined ? true : e.labelIds.includes("UNREAD") === f.unread))
    .filter((e) => (categoryId === undefined ? true : (analysis[e.id]?.category ?? null) === categoryId))
    .filter((e) => {
      if (!terms.length) return true;
      const hay = `${e.from} ${e.subject} ${e.preview}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const limit = Math.min(LIMIT_MAX, Math.max(1, f.limit ?? LIMIT_DEFAULT));
  const offset = Math.max(0, f.offset ?? 0);
  const page = matches.slice(offset, offset + limit).map((e: Email) => {
    const a = analysis[e.id];
    return {
      id: e.id,
      threadId: e.threadId,
      accountId: e.accountId,
      from: e.from,
      subject: e.subject,
      preview: e.preview,
      date: e.date,
      unread: e.labelIds.includes("UNREAD"),
      folder: e.folder,
      hasAttachment: Boolean(e.hasAttachment),
      category: a?.category ? (categoryName.get(a.category) ?? null) : null,
      priority: a?.priority ?? null,
      needsReply: a ? a.needsReply >= 0.5 : null,
    };
  });
  return { total: matches.length, offset, nextOffset: offset + page.length < matches.length ? offset + page.length : null, emails: page };
}

// ---- attachments in ----

const attachmentSchema = z.object({
  filename: z.string().min(1).max(200).describe("File name with extension, e.g. report.pdf."),
  mimeType: z.string().max(100).optional().describe("MIME type, e.g. application/pdf. Defaults to application/octet-stream."),
  contentBase64: z.string().min(1).describe("The file's bytes, base64-encoded (standard alphabet)."),
});

/** Over MCP the files travel base64-inside-JSON (~4/3 the size) and Vercel refuses bodies over ~4.5 MB, so the cap is lower than for the web composer. */
const MCP_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** base64 is ~4/3 the size of the bytes; reject by length before decoding anything. */
function decodeAttachments(list: z.infer<typeof attachmentSchema>[] | undefined): OutAttachment[] {
  if (!list?.length) return [];
  if (list.length > MAX_ATTACHMENTS) throw new HttpError(400, `Too many attachments (max ${MAX_ATTACHMENTS}).`);
  let totalChars = 0;
  return list.map((a) => {
    // Tolerate a data: URL prefix and line breaks.
    const b64 = a.contentBase64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    totalChars += b64.length;
    if (totalChars > Math.ceil((MCP_ATTACHMENT_BYTES * 4) / 3) + 4 * list.length) {
      throw new HttpError(413, `Attachments are too large; over MCP they total at most ${MCP_ATTACHMENT_BYTES / 1024 / 1024} MB per message.`);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new HttpError(400, `"${a.filename}": contentBase64 isn't valid base64.`);
    return { name: a.filename, mimeType: a.mimeType ?? "application/octet-stream", bytes: new Uint8Array(Buffer.from(b64, "base64")) };
  });
}

// ---- the server ----

const emailFilters = {
  category: z.string().optional().describe('A category id or name from list_categories, or "uncategorized".'),
  account: z.string().optional().describe("Only this Gmail account: its id or address from list_accounts."),
  folder: z.enum(["inbox", "spam", "any"]).optional().describe("Default any."),
  unread: z.boolean().optional().describe("true for unread only, false for read only."),
  limit: z.number().int().min(1).max(LIMIT_MAX).optional().describe(`Page size, default ${LIMIT_DEFAULT}, max ${LIMIT_MAX}.`),
  offset: z.number().int().min(0).optional().describe("How many results to skip; use nextOffset from the previous page."),
};

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
// Sending can't be recalled, so it's flagged destructive for clients that ask before running such tools.
const SEND = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

const attachmentsField = z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional().describe(`Files to attach, at most ${MAX_ATTACHMENTS} and at most 3 MB in total.`);

export function createMcpServer(ctx: Ctx, scopes: Scope[]) {
  const server = new McpServer(
    { name: "sorta", version: "1.0.0" },
    {
      instructions:
        "Sorta is the user's Gmail triage app. Use list_emails / search_emails to find mail (it reflects the last sync, and search covers sender, subject and preview, not full bodies), get_thread to read a conversation" +
        (scopes.includes("send") ? ", and send_email / reply_to_thread to write. Sending is real and immediate: confirm recipients and content with the user first. The user's default CC/BCC and signature are applied automatically." : ". This token is read-only.") ,
    },
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List Gmail accounts",
      description: "The Gmail accounts connected to Sorta, with their ids (use as `account` or `from`), status and which one is the default sender.",
      annotations: { ...READ, openWorldHint: false },
    },
    () =>
      run(async () => {
        const [accounts, settings] = await Promise.all([readAccounts(ctx), readSettings(ctx)]);
        return json({
          accounts: accounts.map((a) => ({
            id: a.id,
            email: a.email,
            status: a.status,
            enabled: a.enabled,
            canSend: a.status === "ACTIVE",
            isDefaultFrom: a.id === settings.defaultFromAccount,
          })),
        });
      }),
  );

  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description: "The user's mail categories (names they chose, with a plain-words description) and how many emails each holds.",
      annotations: { ...READ, openWorldHint: false },
    },
    () =>
      run(async () => {
        const [categories, emails, analysis, accounts] = await Promise.all([readCategories(ctx), readEmails(ctx), readAnalysis(ctx), readAccounts(ctx)]);
        const on = new Set(accounts.filter((a) => a.enabled).map((a) => a.id));
        const counts = new Map<string | null, number>();
        for (const e of Object.values(emails)) {
          if (!on.has(e.accountId)) continue;
          const c = analysis[e.id]?.category ?? null;
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        return json({
          categories: categories.map((c) => ({ id: c.id, name: c.name, description: c.description, emails: counts.get(c.id) ?? 0 })),
          uncategorized: counts.get(null) ?? 0,
        });
      }),
  );

  server.registerTool(
    "list_emails",
    {
      title: "List emails",
      description:
        "Lists synced emails, newest first, with optional filters. Returns id, threadId, sender, subject, preview, date, unread, category and whether the sender expects a reply. Pass an email id to get_thread for the full text.",
      inputSchema: emailFilters,
      annotations: { ...READ, openWorldHint: false },
    },
    (args) => run(async () => json(await listEmails(ctx, args))),
  );

  server.registerTool(
    "search_emails",
    {
      title: "Search emails",
      description:
        "Finds synced emails whose sender, subject or preview contains every word of `query` (case-insensitive). Not a full-text or AI search; for broader meaning, browse by category. Same filters and result shape as list_emails.",
      inputSchema: { query: z.string().trim().min(1).max(300).describe('Words to look for, e.g. "invoice acme".'), ...emailFilters },
      annotations: { ...READ, openWorldHint: false },
    },
    (args) => run(async () => json(await listEmails(ctx, args))),
  );

  server.registerTool(
    "get_thread",
    {
      title: "Read a conversation",
      description:
        "Reads a whole conversation from Gmail, oldest message first: sender, recipients, date, plain-text body and attachment metadata (names and types only; file contents are not returned). Give either `emailId` from list_emails, or `threadId` together with `accountId`.",
      inputSchema: {
        emailId: z.string().optional().describe("An email id from list_emails or search_emails."),
        threadId: z.string().optional().describe("A Gmail thread id (needs accountId)."),
        accountId: z.string().optional().describe("The account the thread lives in."),
      },
      annotations: { ...READ, openWorldHint: true },
    },
    ({ emailId, threadId, accountId }) =>
      run(async () => {
        if (emailId) {
          const email = await readEmail(ctx, emailId);
          if (!email) throw new HttpError(404, "Email not found. It may have been trashed or not synced yet.");
          threadId = email.threadId;
          accountId = email.accountId;
        }
        if (!threadId || !accountId) throw new HttpError(400, "Give an emailId, or a threadId and accountId.");
        if (!/^[\w-]{6,64}$/.test(threadId)) throw new HttpError(400, "That isn't a valid thread id.");
        // Only the user's own mailboxes: the id has to be one of their accounts.
        const account = (await readAccounts(ctx)).find((a) => a.id === accountId || a.email.toLowerCase() === accountId!.trim().toLowerCase());
        if (!account) throw new HttpError(400, "That Gmail account isn't connected to Sorta.");
        const messages = await fetchThread(ctx, account.id, threadId);
        return json({
          threadId,
          accountId: account.id,
          messages: messages.map((m) => ({
            id: m.id,
            from: m.from,
            to: m.to,
            date: m.date,
            unread: m.labelIds.includes("UNREAD"),
            text: m.text.length > TEXT_MAX ? `${m.text.slice(0, TEXT_MAX)}\n[truncated]` : m.text,
            attachments: m.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType })),
          })),
        });
      }),
  );

  server.registerTool(
    "get_send_settings",
    {
      title: "Get send settings",
      description:
        "The user's sending defaults: which account sends by default, the CC and BCC addresses added to every message, and the signature appended. send_email and reply_to_thread apply these automatically; you don't need to repeat them.",
      annotations: { ...READ, openWorldHint: false },
    },
    () =>
      run(async () => {
        const [settings, accounts] = await Promise.all([readSettings(ctx), readAccounts(ctx)]);
        const from = accounts.find((a) => a.id === settings.defaultFromAccount);
        return json({
          defaultFrom: from ? { id: from.id, email: from.email } : null,
          defaultCc: settings.defaultCc,
          defaultBcc: settings.defaultBcc,
          signature: settings.signature,
          note: "With no default From set, the first enabled connected account sends. Replies always leave from the mailbox the conversation is in.",
        });
      }),
  );

  // Send tools exist only for tokens that were given the send scope.
  if (scopes.includes("send")) {
    server.registerTool(
      "send_email",
      {
        title: "Send an email",
        description:
          "Sends a new email from one of the user's Gmail accounts, immediately and for real. The user's default CC/BCC and signature are added automatically. Confirm recipients and wording with the user before calling. `from` is optional (an account id or address from list_accounts); omitted, the user's default account sends.",
        inputSchema: {
          to: z.array(z.string()).min(1).max(50).describe('Recipient addresses, e.g. ["ana@example.com"]. "Name <addr>" is accepted.'),
          cc: z.array(z.string()).max(50).optional(),
          bcc: z.array(z.string()).max(50).optional(),
          subject: z.string().max(500),
          body: z.string().describe("Plain-text body. Do not include the signature; it is appended for you."),
          html: z.string().optional().describe("Optional HTML version of the body; when given it is what is sent."),
          from: z.string().optional().describe("Sending account id or address."),
          attachments: attachmentsField,
        },
        annotations: SEND,
      },
      ({ to, cc, bcc, subject, body, html, from, attachments }) =>
        run(async () => {
          const sent = await sendEmail(ctx, { to, cc, bcc, subject, body, html, accountId: from, attachments: decodeAttachments(attachments) });
          return json({ sent });
        }),
    );

    server.registerTool(
      "reply_to_thread",
      {
        title: "Reply to a conversation",
        description:
          "Replies in an existing conversation, immediately and for real, from the mailbox the conversation is in. Recipients are worked out for you (the sender of the newest message; with replyAll, everyone else too). Default CC/BCC and the signature are added. Give either `emailId` from list_emails, or `threadId` with `accountId`. Read the thread with get_thread and confirm the reply with the user first.",
        inputSchema: {
          emailId: z.string().optional().describe("An email id from list_emails or search_emails."),
          threadId: z.string().optional().describe("A Gmail thread id (needs accountId)."),
          accountId: z.string().optional(),
          body: z.string().describe("Plain-text reply. Do not quote the earlier message or add a signature."),
          html: z.string().optional(),
          replyAll: z.boolean().optional().describe("Also address everyone else on the newest message. Default false."),
          cc: z.array(z.string()).max(50).optional(),
          bcc: z.array(z.string()).max(50).optional(),
          attachments: attachmentsField,
        },
        annotations: SEND,
      },
      ({ emailId, threadId, accountId, body, html, replyAll, cc, bcc, attachments }) =>
        run(async () => {
          const sent = await replyToThread(ctx, { emailId, threadId, accountId, body, html, replyAll, cc, bcc, attachments: decodeAttachments(attachments) });
          return json({ sent });
        }),
    );
  }

  return server;
}
