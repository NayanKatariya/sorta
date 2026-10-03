import "server-only";
import { executeTool } from "./composio";
import type { Ctx } from "./store";
import type { Account, Attachment, Email, ThreadMessage } from "./types";

type RawMessage = {
  messageId?: string;
  id?: string;
  threadId: string;
  sender?: string;
  subject?: string;
  preview?: { body?: string; subject?: string };
  messageTimestamp?: string;
  labelIds?: string[];
  display_url?: string;
};

type FetchPage = { messages?: RawMessage[]; nextPageToken?: string };

const PAGE_SIZE = 100;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function normalize(m: RawMessage, folder: Email["folder"], account: Account): Email | null {
  const id = m.messageId ?? m.id;
  if (!id) return null;
  return {
    id,
    threadId: m.threadId,
    from: m.sender ?? "",
    subject: decodeEntities(m.subject ?? m.preview?.subject ?? "(no subject)"),
    // Strip zero-width padding that marketing mail uses to pad previews.
    preview: decodeEntities(m.preview?.body ?? "").replace(/[\u200B-\u200F\uFEFF\u034F\u00AD]/g, "").replace(/\s+/g, " ").trim(),
    date: m.messageTimestamp ?? new Date().toISOString(),
    labelIds: m.labelIds ?? [],
    // authuser picks the right mailbox when several Google accounts are signed in.
    url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email)}#all/${id}`,
    folder,
    accountId: account.id,
  };
}

/** Gmail's timestamps arrive as ISO strings or epoch milliseconds; the store sorts on ISO. */
function toIso(v: unknown) {
  const d = typeof v === "number" || /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(String(v ?? ""));
  // Same shape as GMAIL_FETCH_EMAILS (no milliseconds), so the store's string sort stays consistent.
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The GMAIL_NEW_GMAIL_MESSAGE trigger payload, in the shape `normalize` expects. */
export function fromTrigger(p: Record<string, unknown>, account: Account): Email | null {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const preview = (p.preview ?? {}) as { body?: string; subject?: string };
  const email = normalize(
    {
      messageId: str(p.message_id) ?? str(p.id),
      threadId: str(p.thread_id) ?? "",
      sender: str(p.sender),
      subject: str(p.subject),
      preview: { subject: preview.subject, body: preview.body ?? str(p.message_text)?.slice(0, 400) },
      messageTimestamp: toIso(p.message_timestamp),
      labelIds: Array.isArray(p.label_ids) ? (p.label_ids as string[]) : ["INBOX", "UNREAD"],
    },
    "inbox",
    account,
  );
  if (email) email.hasAttachment = Array.isArray(p.attachment_list) && p.attachment_list.length > 0;
  return email;
}

export async function getProfileEmail(ctx: Ctx, accountId: string, owner: string): Promise<string> {
  const p = await executeTool<{ emailAddress?: string }>(ctx, "GMAIL_GET_PROFILE", {}, accountId, owner);
  return p.emailAddress ?? "unknown";
}

export async function fetchFolder(ctx: Ctx, account: Account, label: "INBOX" | "SPAM", limit: number): Promise<Email[]> {
  const out: Email[] = [];
  let pageToken: string | undefined;
  while (out.length < limit) {
    const page = await executeTool<FetchPage>(ctx, "GMAIL_FETCH_EMAILS", {
      label_ids: [label],
      max_results: Math.min(PAGE_SIZE, limit - out.length),
      verbose: false,
      include_payload: false,
      include_spam_trash: label === "SPAM",
      ...(pageToken ? { page_token: pageToken } : {}),
    }, account.id, account.userId);
    for (const m of page.messages ?? []) {
      const e = normalize(m, label === "SPAM" ? "spam" : "inbox", account);
      if (e) out.push(e);
    }
    pageToken = page.nextPageToken || undefined;
    if (!pageToken || !page.messages?.length) break;
  }
  return out;
}

export async function batchModify(ctx: Ctx, accountId: string, ids: string[], add: string[], remove: string[]) {
  for (let i = 0; i < ids.length; i += 1000) {
    await executeTool(ctx, "GMAIL_BATCH_MODIFY_MESSAGES", {
      messageIds: ids.slice(i, i + 1000),
      addLabelIds: add,
      removeLabelIds: remove.filter((l) => !add.includes(l)),
    }, accountId);
  }
}

/** Groups messages by the account they live in, since every Gmail call is per mailbox. */
export function byAccount<T extends { id: string; accountId: string }>(items: T[]) {
  const out = new Map<string, string[]>();
  for (const it of items) out.set(it.accountId, [...(out.get(it.accountId) ?? []), it.id]);
  return out;
}

/**
 * Moves messages to Trash in batches. Keeps going past a failed batch and reports which ids made
 * it, so callers can still record those for undo instead of losing track of them.
 */
export async function trashMessages(ctx: Ctx, emails: { id: string; accountId: string }[]) {
  const done = new Set<string>();
  let error: unknown = null;
  for (const [accountId, ids] of byAccount(emails)) {
    for (let i = 0; i < ids.length; i += 1000) {
      const part = ids.slice(i, i + 1000);
      try {
        await batchModify(ctx, accountId, part, ["TRASH"], ["INBOX", "SPAM", "UNREAD"]);
        for (const id of part) done.add(id);
      } catch (err) {
        error ??= err;
      }
    }
  }
  return { done, error };
}

export async function untrashMessage(ctx: Ctx, accountId: string, id: string) {
  await executeTool(ctx, "GMAIL_UNTRASH_MESSAGE", { message_id: id }, accountId);
}

type Label = { id: string; name: string };

export async function ensureLabel(ctx: Ctx, accountId: string, name: string): Promise<string> {
  const data = await executeTool<{ labels?: Label[] }>(ctx, "GMAIL_LIST_LABELS", {}, accountId);
  const found = data.labels?.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const created = await executeTool<{ id?: string; response_data?: { id: string } }>(
    ctx,
    "GMAIL_CREATE_LABEL",
    { label_name: name },
    accountId,
  );
  const id = created.id ?? created.response_data?.id;
  if (!id) throw new Error(`Could not create Gmail label "${name}"`);
  return id;
}

/** IDs of the newest inbox messages that carry files; one cheap ids-only call, since sync skips payloads. */
export async function attachmentIds(ctx: Ctx, account: Account, limit: number): Promise<Set<string>> {
  const page = await executeTool<{ messages?: { messageId?: string; id?: string }[] }>(ctx, "GMAIL_FETCH_EMAILS", {
    query: "in:inbox has:attachment",
    max_results: Math.min(limit, 500),
    ids_only: true,
  }, account.id, account.userId);
  return new Set((page.messages ?? []).map((m) => m.messageId ?? m.id ?? "").filter(Boolean));
}

type MimePart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string };
  parts?: MimePart[];
};

type RawThreadMessage = RawMessage & {
  to?: string;
  messageText?: string;
  attachmentList?: { attachmentId: string; filename: string; mimeType: string }[];
  payload?: MimePart;
};

const header = (p: MimePart, name: string) => p.headers?.find((h) => h.name.toLowerCase() === name)?.value;

function* walkParts(p: MimePart): Generator<MimePart> {
  yield p;
  for (const c of p.parts ?? []) yield* walkParts(c);
}

/** Decodes a base64url MIME body in its declared charset (UTF-8 when unknown or unsupported). */
function decodeBody(part: MimePart) {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const charset = /charset="?([\w-]+)/i.exec(header(part, "content-type") ?? "")?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

/** The HTML body, plus the inline images it points at with `cid:` URLs. */
function htmlOf(payload: MimePart | undefined) {
  if (!payload) return {};
  const parts = [...walkParts(payload)];
  const htmlPart = parts.find((p) => p.mimeType === "text/html" && p.body?.data && !/attachment/i.test(header(p, "content-disposition") ?? ""));
  if (!htmlPart) return {};
  const inline: Record<string, Attachment> = {};
  for (const p of parts) {
    const cid = header(p, "content-id")?.replace(/^<|>$/g, "");
    if (cid && p.body?.attachmentId) {
      inline[cid] = { id: p.body.attachmentId, filename: p.filename || cid, mimeType: p.mimeType ?? "application/octet-stream" };
    }
  }
  return { html: decodeBody(htmlPart), inline };
}

/** Every message in a conversation, oldest first, including ones the user sent. */
export async function fetchThread(ctx: Ctx, accountId: string, threadId: string): Promise<ThreadMessage[]> {
  const data = await executeTool<{ messages?: RawThreadMessage[] }>(ctx, "GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { thread_id: threadId }, accountId);
  return (data.messages ?? [])
    .map((m) => {
      const { html, inline = {} } = htmlOf(m.payload);
      // Images drawn inside the HTML aren't files the user sent, so they stay out of the attachment chips.
      const embedded = new Set(Object.entries(inline).filter(([cid]) => html?.includes(`cid:${cid}`)).map(([, a]) => a.filename));
      return {
        id: m.messageId ?? m.id ?? "",
        from: m.sender ?? "",
        to: m.to ?? "",
        date: m.messageTimestamp ?? "",
        text: (m.messageText?.trim() || decodeEntities(m.preview?.body ?? "")).replace(/\r\n/g, "\n"),
        labelIds: m.labelIds ?? [],
        attachments: (m.attachmentList ?? [])
          .filter((a) => a.attachmentId && a.filename)
          .filter((a) => !embedded.has(a.filename))
          .map((a) => ({ id: a.attachmentId, filename: a.filename, mimeType: a.mimeType })),
        html,
        inline,
      };
    })
    .filter((m) => m.id)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Composio hands attachments back as a short-lived download link. */
export async function getAttachment(ctx: Ctx, accountId: string, messageId: string, attachmentId: string, filename: string) {
  const data = await executeTool<{ file?: { s3url?: string; mimetype?: string; name?: string } }>(
    ctx,
    "GMAIL_GET_ATTACHMENT",
    { message_id: messageId, attachment_id: attachmentId, file_name: filename },
    accountId,
  );
  if (!data.file?.s3url) throw new Error("Gmail returned no file for this attachment.");
  return { url: data.file.s3url, mimeType: data.file.mimetype ?? "application/octet-stream", name: data.file.name ?? filename };
}

/** Who a reply to a conversation goes to, read from the headers of its newest message. */
export type ReplyContext = {
  /** Where a plain reply goes: the sender's Reply-To (or From), or the recipients when the user wrote last. */
  to: string[];
  /** Everyone else on the last message, for reply-all. */
  others: string[];
  cc: string[];
  subject: string;
};

/** Splits an address header ("A <a@x.com>, b@y.com") into its parts, ignoring commas inside quotes or <>. */
export function splitAddresses(list: string | undefined): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = false;
  for (const ch of list ?? "") {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle = true;
    else if (!quoted && ch === ">") angle = false;
    if (ch === "," && !quoted && !angle) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((a) => a.trim()).filter(Boolean);
}

/** The bare lower-cased address inside "Name <a@x.com>", or null when there isn't one. */
export function bareAddress(raw: string): string | null {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(raw) ?? /^\s*([^<>\s,;"]+@[^<>\s,;"]+)\s*$/.exec(raw);
  return m ? m[1].toLowerCase() : null;
}

export async function fetchReplyContext(ctx: Ctx, account: Account, threadId: string): Promise<ReplyContext> {
  const data = await executeTool<{ messages?: RawThreadMessage[] }>(ctx, "GMAIL_FETCH_MESSAGE_BY_THREAD_ID", { thread_id: threadId }, account.id, account.userId);
  const msgs = (data.messages ?? []).sort((a, b) => (a.messageTimestamp ?? "").localeCompare(b.messageTimestamp ?? ""));
  if (!msgs.length) throw new Error("That conversation wasn't found in Gmail.");
  const mine = (m: RawThreadMessage) =>
    Boolean(m.labelIds?.includes("SENT")) || bareAddress(header(m.payload ?? {}, "from") ?? m.sender ?? "") === account.email.toLowerCase();
  // Like Gmail: follow the newest message. When the user wrote it, address its recipients; when it has none
  // (a note to self), fall back to the newest message from someone else.
  const newest = msgs[msgs.length - 1];
  const lastForeign = [...msgs].reverse().find((m) => !mine(m));
  const recipients = (m: RawThreadMessage) => splitAddresses((m.payload ? header(m.payload, "to") : undefined) ?? m.to);
  const last = mine(newest) && (recipients(newest).length || !lastForeign) ? newest : (lastForeign ?? newest);
  const h = (name: string) => (last.payload ? header(last.payload, name) : undefined);
  const from = splitAddresses(h("from") ?? last.sender);
  const replyTo = splitAddresses(h("reply-to"));
  const to = splitAddresses(h("to") ?? last.to);
  const cc = splitAddresses(h("cc"));
  const wroteLast = mine(last);
  return {
    to: wroteLast ? to : replyTo.length ? replyTo : from,
    others: wroteLast ? [] : to,
    cc,
    subject: decodeEntities(h("subject") ?? last.subject ?? ""),
  };
}
