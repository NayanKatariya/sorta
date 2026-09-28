import "server-only";
import type { Composio, IncomingTriggerPayload } from "@composio/core";
import { apiKey, clientFor, composio } from "./composio";
import { fromTrigger } from "./gmail";
import { analyzeEmails, jevConfigured } from "./jev";
import { reserveJev } from "./quota";
import { readAccounts, readAnalysis, readCategories, readEmail, upsertAnalysis, upsertEmails, type Ctx } from "./store";
import { adminClient, adminConfigured } from "./supabase/admin";
import type { Account } from "./types";

/** Composio polls each enabled mailbox's inbox and pushes every new message to us. */
export const NEW_MAIL_TRIGGER = "GMAIL_NEW_GMAIL_MESSAGE";
const POLL_MINUTES = 1;

export type LiveEvent =
  | { type: "mail"; id: string; accountId: string; from: string; subject: string }
  | { type: "status"; live: boolean };

/** One Composio event stream per Sorta user (each user has their own Composio key). */
type Listener = { key: string; client: Composio; connected: boolean; starting?: Promise<void>; queue: Promise<unknown> };
type Live = { bus: EventTarget; users: Map<string, Listener> };

// On globalThis so route handlers and instrumentation, which Next may bundle separately, share one registry.
const g = globalThis as { __sortaLive?: Live };
const live = (g.__sortaLive ??= { bus: new EventTarget(), users: new Map() });

function emit(userId: string, event: LiveEvent) {
  live.bus.dispatchEvent(new CustomEvent("sorta", { detail: { userId, event } }));
}

/** Subscribes to one user's events only. */
export function onLiveEvent(userId: string, fn: (e: LiveEvent) => void) {
  const handler = (ev: Event) => {
    const { detail } = ev as CustomEvent<{ userId: string; event: LiveEvent }>;
    if (detail.userId === userId) fn(detail.event);
  };
  live.bus.addEventListener("sorta", handler);
  return () => live.bus.removeEventListener("sorta", handler);
}

export const isLive = (userId: string) => live.users.get(userId)?.connected ?? false;

/** Background work has no session, so it runs as the service role, scoped to `userId` by every query. */
const serviceCtx = (userId: string): Ctx => ({ db: adminClient(), userId });

/** Finds or creates the new-mail trigger for a mailbox and makes sure it is switched on. */
export async function ensureTrigger(ctx: Ctx, account: Account): Promise<string> {
  const c = await composio(ctx);
  const { items } = await c.triggers.listActive({ connectedAccountIds: [account.id], triggerNames: [NEW_MAIL_TRIGGER], showDisabled: true });
  const found = items[0];
  if (found) {
    if (found.disabledAt) await c.triggers.enable(found.id);
    return found.id;
  }
  const { triggerId } = await c.triggers.create(account.userId, NEW_MAIL_TRIGGER, {
    connectedAccountId: account.id,
    triggerConfig: { labelIds: "INBOX", interval: POLL_MINUTES, userId: "me" },
  });
  return triggerId;
}

export async function removeTrigger(ctx: Ctx, triggerId: string, client?: Composio) {
  await (client ?? (await composio(ctx))).triggers.delete(triggerId);
}

/** Starts in progress, per user, so concurrent callers (tab open + account change) join one start. */
const pending = new Map<string, Promise<void>>();

/**
 * Opens Composio's event stream for one user's key. Safe to call often; it only reconnects when
 * their key changed. Needs SUPABASE_SECRET_KEY, since new mail arrives with no one signed in.
 */
export function startListener(userId: string): Promise<void> {
  if (!adminConfigured()) return Promise.resolve();
  let p = pending.get(userId);
  if (!p) {
    p = openListener(userId).finally(() => pending.delete(userId));
    pending.set(userId, p);
  }
  return p;
}

async function openListener(userId: string): Promise<void> {
  const ctx = serviceCtx(userId);
  const key = await apiKey(ctx).catch(() => null);
  // Checked after the await, so a start that raced with "switch everything off" doesn't win.
  const wanted = key !== null && (await readAccounts(ctx).catch(() => [])).some((a) => a.enabled);
  const current = live.users.get(userId);
  if (wanted && current && key === current.key && (current.connected || current.starting)) return current.starting;
  await stopNow(userId);
  if (!wanted) return;

  const client = clientFor(key!);
  const l: Listener = { key: key!, client, connected: false, queue: Promise.resolve() };
  live.users.set(userId, l);
  const mine = () => live.users.get(userId) === l;
  l.starting = client.triggers
    .subscribe(
      (data) => {
        l.queue = l.queue.then(() => ingest(userId, data)).catch((err) => console.error("[live] ingest failed", err));
      },
      { triggerSlug: [NEW_MAIL_TRIGGER] },
      (err) => {
        console.error("[live] subscription rejected", err);
        l.connected = false;
        if (mine()) emit(userId, { type: "status", live: false });
      },
    )
    .then(() => {
      if (!mine()) return;
      l.connected = true;
      emit(userId, { type: "status", live: true });
    })
    .catch((err) => {
      console.error("[live] could not subscribe to Composio triggers", err);
      if (mine()) live.users.delete(userId);
    })
    .finally(() => {
      l.starting = undefined;
    });
  return l.starting;
}

/** Stops a user's stream, after any start already in flight has settled (so it can't come back). */
export async function stopListener(userId: string) {
  await pending.get(userId)?.catch(() => {});
  await stopNow(userId);
}

async function stopNow(userId: string) {
  const l = live.users.get(userId);
  if (!l) return;
  live.users.delete(userId);
  if (l.connected) emit(userId, { type: "status", live: false });
  // Another user may share this key (same Composio project); only unsubscribe when no one does.
  if (![...live.users.values()].some((o) => o.client === l.client)) await l.client.triggers.unsubscribe().catch(() => {});
}

/** At server start: listen for every user who has a Composio key and at least one picked mailbox. */
export async function startAllListeners() {
  if (!adminConfigured()) {
    console.warn("[live] SUPABASE_SECRET_KEY is not set; new mail only arrives on sync.");
    return;
  }
  const { data, error } = await adminClient().from("accounts").select("user_id").eq("enabled", true);
  if (error) throw new Error(error.message);
  const users = [...new Set((data ?? []).map((r) => r.user_id as string))];
  await Promise.all(users.map((u) => startListener(u).catch((err) => console.error(`[live] start for ${u} failed`, err))));
}

/** One pushed message: file it, let Jev read it, tell that user's open tabs. Runs one at a time per user. */
async function ingest(userId: string, data: IncomingTriggerPayload) {
  const ctx = serviceCtx(userId);
  const accountId = data.metadata?.connectedAccount?.id;
  // The account must be one of this user's picked mailboxes; anything else on the stream is ignored.
  const account = (await readAccounts(ctx)).find((a) => a.id === accountId && a.enabled);
  if (!account || !data.payload) return;
  const email = fromTrigger(data.payload, account);
  if (!email || (await readEmail(ctx, email.id))) return;

  const cached = (await readAnalysis(ctx, [email.id]))[email.id];
  const canRead = !cached && jevConfigured() && (await reserveJev(userId, 1)) > 0;
  // If Jev is down, still file the email unsorted; the next sync reads it.
  const analysis = canRead
    ? await analyzeEmails([email], await readCategories(ctx)).catch((err) => {
        console.error("[live] Jev failed", err);
        return {};
      })
    : {};

  // The mailbox may have been switched off while Jev was reading.
  if (!(await readAccounts(ctx)).some((a) => a.id === account.id && a.enabled)) return;
  await upsertEmails(ctx, [email]);
  await upsertAnalysis(ctx, analysis);
  emit(userId, { type: "mail", id: email.id, accountId: account.id, from: email.from, subject: email.subject });
}
