import { senderAddress, senderName } from "@/lib/policy";
import type { ClientState } from "@/lib/types";

export type Row = ClientState["emails"][number] & {
  /** Messages in this conversation that pass the current filters (list and cards show one row per thread). */
  threadSize?: number;
};

export const threadKey = (e: { accountId: string; threadId: string }) => `${e.accountId}:${e.threadId}`;

/**
 * One row per conversation: its newest message, flagged unread or with files if any message is.
 * Expects rows newest first, as the store sorts them.
 */
export function collapseThreads(rows: Row[]): Row[] {
  const byThread = new Map<string, Row[]>();
  for (const r of rows) {
    const k = threadKey(r);
    byThread.set(k, [...(byThread.get(k) ?? []), r]);
  }
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const k = threadKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    const all = byThread.get(k)!;
    if (all.length === 1) {
      out.push(r);
      continue;
    }
    const unread = all.some((m) => m.labelIds.includes("UNREAD"));
    out.push({
      ...r,
      threadSize: all.length,
      hasAttachment: all.some((m) => m.hasAttachment),
      labelIds: unread && !r.labelIds.includes("UNREAD") ? [...r.labelIds, "UNREAD"] : r.labelIds,
    });
  }
  return out;
}

/** Every stored message in the same conversation as `id` (just `id` if it's alone). */
export function threadIdsOf(emails: Row[], id: string) {
  const e = emails.find((x) => x.id === id);
  if (!e) return [id];
  const k = threadKey(e);
  return emails.filter((x) => threadKey(x) === k).map((x) => x.id);
}

/** Filter 1 (left column): which category. */
export type Collection = "all" | "uncategorized" | (string & {});
/** Filter 2 (top tabs): which state. Combined with the collection as an AND. */
export const STATUSES = ["all", "inbox", "attention", "unread", "junk", "spam", "otp"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  all: "all",
  inbox: "inbox",
  attention: "needs you",
  unread: "unread",
  junk: "junk",
  spam: "spam",
  otp: "otps",
};
export type Layout = "list" | "cards" | "senders";

export const isAttention = (e: Row) =>
  e.folder === "inbox" && !e.sweepable && ((e.analysis?.priority ?? 0) >= 1.6 || (e.analysis?.needsReply ?? 0) >= 0.6);

const OTP =
  /\b(otp|one[- ]time (pass(word|code)|code|pin)|verification code|verify your (email|identity|account)|security code|(login|sign[- ]?in|authentication|confirmation|access) code|passcode|2fa|two[- ]factor|\d{4,8} is your)\b/i;

const text = (e: Row) => `${e.subject} ${e.preview.slice(0, 300)}`;
/** One-time codes and verification emails. */
export const isOtp = (e: Row) => OTP.test(text(e));

export function inStatus(e: Row, s: Status) {
  switch (s) {
    case "all":
      return true;
    case "inbox":
      return e.folder === "inbox";
    case "attention":
      return isAttention(e);
    case "unread":
      return e.labelIds.includes("UNREAD");
    case "junk":
      return e.sweepable;
    case "spam":
      return e.folder === "spam";
    case "otp":
      return isOtp(e);
  }
}

export function inCollection(e: Row, c: Collection) {
  if (c === "all") return true;
  if (c === "uncategorized") return !e.analysis?.category;
  return e.analysis?.category === c;
}

export type SenderGroup = { addr: string; name: string; emails: Row[]; junk: number; unread: number };

export function groupSenders(emails: Row[]): SenderGroup[] {
  const map = new Map<string, SenderGroup>();
  for (const e of emails) {
    const addr = senderAddress(e.from);
    const g = map.get(addr) ?? { addr, name: senderName(e.from), emails: [], junk: 0, unread: 0 };
    g.emails.push(e);
    if (e.sweepable) g.junk++;
    if (e.labelIds.includes("UNREAD")) g.unread++;
    map.set(addr, g);
  }
  return [...map.values()].sort((a, b) => b.emails.length - a.emails.length);
}

export function priorityLabel(p: number) {
  if (p >= 2.4) return { label: "urgent", tone: "text-sweep" };
  if (p >= 1.6) return { label: "needs you", tone: "text-amber-500" };
  if (p >= 0.8) return { label: "fyi", tone: "text-muted-foreground" };
  return { label: "low", tone: "text-muted-foreground" };
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function listDate(iso: string) {
  const d = new Date(iso);
  const hours = (Date.now() - d.getTime()) / 36e5;
  if (hours < 20) return timeFmt.format(d);
  return shortFmt.format(d);
}

export const fullDate = (iso: string) => fullFmt.format(new Date(iso));

export const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
export function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s > -60) return "just now";
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

/** Stable per-sender hue for the little sender tiles. */
export function avatarHue(addr: string) {
  let h = 0;
  for (const c of addr) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
