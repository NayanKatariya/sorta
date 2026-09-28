import "server-only";
import { apiKey, clientFor, composio, USER_ID } from "./composio";
import { getProfileEmail } from "./gmail";
import { ensureTrigger, removeTrigger, startListener, stopListener } from "./live";
import { open, seal } from "./secrets";
import { HttpError } from "./session";
import {
  deleteAllAccounts,
  purgeDisabledMail,
  readAccounts,
  readComposio,
  recordSweep,
  replaceAccounts,
  updateAccount,
  writeComposio,
  writeSettings,
  type Ctx,
} from "./store";
import type { Account } from "./types";

const UNKNOWN = "unknown account";

/** Checks the key against Composio, then stores it sealed and lists the Gmail accounts it can reach. */
export async function saveApiKey(ctx: Ctx, raw: string) {
  const key = raw.trim();
  if (!key) throw new Error("Paste your Composio API key.");
  if (key.length > 500 || /\s/.test(key)) throw new Error("That doesn't look like a Composio API key.");
  try {
    await clientFor(key).connectedAccounts.list({ toolkitSlugs: ["gmail"], limit: 1 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(/\b401\b|invalid api key/i.test(msg) ? "Composio didn't accept that key. Check it and try again." : `Couldn't reach Composio: ${msg}`);
  }

  const prev = await readComposio(ctx);
  const sameKey = prev ? (await open(prev.apiKey).catch(() => null)) === key : false;
  // A new key can mean a new Composio project: the old triggers and mailboxes don't carry over.
  if (prev && !sameKey) {
    await dropTriggers(ctx);
    await forgetAccounts(ctx);
  }

  await writeComposio(ctx, { apiKey: await seal(key), hint: key.slice(-4), savedAt: new Date().toISOString() });
  await refreshAccounts(ctx);
  await startListener(ctx.userId);
}

export async function removeApiKey(ctx: Ctx) {
  await dropTriggers(ctx);
  await stopListener(ctx.userId);
  await forgetAccounts(ctx);
  await writeComposio(ctx, null);
}

/** Best effort: a revoked key or a trigger deleted in the dashboard shouldn't block the change. */
async function dropTriggers(ctx: Ctx) {
  const key = await apiKey(ctx).catch(() => null);
  if (!key) return;
  const client = clientFor(key);
  const accounts = await readAccounts(ctx);
  await Promise.all(accounts.filter((a) => a.triggerId).map((a) => removeTrigger(ctx, a.triggerId!, client).catch(() => {})));
}

/** Mailboxes (and their mail, by cascade) and the undo record all belong to the old key. */
async function forgetAccounts(ctx: Ctx) {
  await deleteAllAccounts(ctx);
  await recordSweep(ctx, null, 0);
  await writeSettings(ctx, { last_sync_at: null });
}

/** The Gmail auth config new accounts connect through: env override, an existing one, or a new Composio-managed one. */
async function gmailAuthConfigId(ctx: Ctx) {
  if (process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID) return process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  const c = await composio(ctx);
  const existing = await c.authConfigs.list({ toolkit: "gmail" });
  const found = existing.items.find((a) => a.status === "ENABLED") ?? existing.items[0];
  if (found) return found.id;
  const created = await c.authConfigs.create("gmail", { type: "use_composio_managed_auth", name: "Sorta Gmail" });
  return created.id;
}

type RawConnection = { id: string; user_id?: string; status: string };

/**
 * Every Gmail connection in the user's Composio project, whichever Composio user it was made under.
 * Straight REST rather than the SDK: the SDK's parser drops `user_id`, and tool calls fail without the real owner.
 */
async function listRemote(ctx: Ctx) {
  const key = await apiKey(ctx);
  if (!key) return [];
  const base = process.env.COMPOSIO_BASE_URL || "https://backend.composio.dev";
  const out: { id: string; userId: string; status: string }[] = [];
  let cursor: string | undefined;
  for (let pages = 0; pages < 50; pages++) {
    const url = new URL("/api/v3/connected_accounts", base);
    url.searchParams.set("toolkit_slugs", "gmail");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { "x-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Composio: listing Gmail accounts failed (${res.status})`);
    const page = (await res.json()) as { items: RawConnection[]; next_cursor?: string | null };
    for (const a of page.items) {
      if (a.status === "INITIATED" || a.status === "INITIALIZING") continue;
      out.push({ id: a.id, userId: a.user_id ?? USER_ID, status: a.status });
    }
    cursor = page.next_cursor ?? undefined;
    if (!cursor) break;
  }
  return out;
}

/**
 * Asks Composio which Gmail accounts exist and stores them (with their addresses).
 * Accounts seen for the first time start unpicked, unless `enableNew` (just connected from Sorta).
 */
export async function refreshAccounts(ctx: Ctx, { enableNew = false } = {}): Promise<Account[]> {
  if (!(await readComposio(ctx))) return [];
  const remote = await listRemote(ctx);
  const prev = new Map((await readAccounts(ctx)).map((a) => [a.id, a]));

  const emails = await Promise.all(
    remote.map(async (a) => {
      const cached = prev.get(a.id)?.email;
      if (cached && cached !== UNKNOWN) return cached;
      return a.status === "ACTIVE" ? getProfileEmail(ctx, a.id, a.userId).catch(() => UNKNOWN) : UNKNOWN;
    }),
  );

  const next: Account[] = remote.map((a, i) => ({
    id: a.id,
    userId: a.userId,
    status: a.status,
    email: emails[i],
    enabled: prev.get(a.id)?.enabled ?? enableNew,
    triggerId: prev.get(a.id)?.triggerId,
  }));
  await replaceAccounts(ctx, next);
  await purgeDisabledMail(ctx);

  if (enableNew) await reconcileTriggers(ctx);
  return next;
}

/** Which mailboxes Sorta reads. Picked ones get a new-mail trigger; unpicked ones lose theirs. */
export async function setEnabled(ctx: Ctx, ids: string[]) {
  const on = new Set(ids);
  for (const a of await readAccounts(ctx)) {
    if (a.enabled !== on.has(a.id)) await updateAccount(ctx, a.id, { enabled: on.has(a.id) });
  }
  await purgeDisabledMail(ctx);
  return reconcileTriggers(ctx);
}

/** Brings Composio's triggers in line with the picked accounts. Returns the addresses that failed. */
async function reconcileTriggers(ctx: Ctx) {
  const accounts = await readAccounts(ctx);
  const failed: string[] = [];
  await Promise.all(
    accounts.map(async (a) => {
      try {
        if (a.enabled && a.status === "ACTIVE") {
          const id = await ensureTrigger(ctx, a);
          if (id !== a.triggerId) await updateAccount(ctx, a.id, { triggerId: id });
        } else if (!a.enabled && a.triggerId) {
          await removeTrigger(ctx, a.triggerId);
          await updateAccount(ctx, a.id, { triggerId: null });
        }
      } catch (err) {
        console.error(`[accounts] trigger for ${a.email} failed`, err);
        if (a.enabled) failed.push(a.email);
      }
    }),
  );
  if (accounts.some((a) => a.enabled)) startListener(ctx.userId).catch(() => {});
  else await stopListener(ctx.userId);
  return failed;
}

/** Starts Composio's hosted OAuth flow for another Gmail account. */
export async function connectAccount(ctx: Ctx, callbackUrl: string) {
  const req = await (await composio(ctx)).connectedAccounts.link(USER_ID, await gmailAuthConfigId(ctx), { callbackUrl, allowMultiple: true });
  if (!req.redirectUrl) throw new Error("Composio did not return a sign-in link.");
  return req.redirectUrl;
}

/** Removes the connection from Composio itself (and its trigger), not just from Sorta. */
export async function disconnectAccount(ctx: Ctx, id: string) {
  const account = (await readAccounts(ctx)).find((a) => a.id === id);
  if (!account) throw new HttpError(404, "That Gmail account isn't connected to Sorta.");
  if (account.triggerId) await removeTrigger(ctx, account.triggerId).catch(() => {});
  await (await composio(ctx)).connectedAccounts.delete(id);
  await replaceAccounts(ctx, (await readAccounts(ctx)).filter((a) => a.id !== id));
}
