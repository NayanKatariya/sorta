import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./session";
import type { Account, Analysis, Category, ComposioConfig, Email, JunkKind, Settings, Store, SweepRecord } from "./types";

/**
 * Who a piece of work is for, and the client to do it with. In request handlers `db` is the
 * user's own session client, so RLS confines every query to their rows. Background work passes the
 * service-role client instead, which is why every query here also filters on `userId`.
 */
export type Ctx = { db: SupabaseClient; userId: string };

const PAGE = 1000;
const CHUNK = 500;

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Database: ${what} failed (${res.error.message})`);
  return res.data;
}

/** PostgREST caps a response at 1000 rows, so large tables are read a page at a time. */
async function selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(await page(from, from + PAGE - 1), what) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function inChunks<T>(items: T[], fn: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>, what: string) {
  for (let i = 0; i < items.length; i += CHUNK) {
    const { error } = await fn(items.slice(i, i + CHUNK));
    if (error) throw new Error(`Database: ${what} failed (${error.message})`);
  }
}

// ---- row shapes ----

type StateRow = {
  sweep_kinds: JunkKind[];
  threshold: number;
  include_spam_folder: boolean;
  fetch_limit: number;
  protected_senders: string[];
  last_sweep: SweepRecord | null;
  last_sync_at: string | null;
  sync_started_at: string | null;
  total_swept: number;
  onboarded_at: string | null;
};
type AccountRow = { id: string; composio_user_id: string; email: string; status: string; enabled: boolean; trigger_id: string | null };
type CategoryRow = { id: string; name: string; description: string; color: string; gmail_labels: Record<string, string>; created_at: string };
type EmailRow = {
  id: string;
  account_id: string;
  thread_id: string;
  sender: string;
  subject: string;
  preview: string;
  date: string;
  label_ids: string[];
  url: string;
  folder: Email["folder"];
  has_attachment: boolean;
};
type AnalysisRow = {
  email_id: string;
  junk_kind: JunkKind;
  junk_probabilities: Analysis["junkProbabilities"];
  priority: number;
  needs_reply: number;
  category: string | null;
  category_confidence: number;
  category_version: string;
  manual_category: boolean;
  keep: boolean;
};

/** Timestamps sort as strings on the client, so they go out in one fixed ISO shape. */
const iso = (v: string) => new Date(v).toISOString().replace(/\.\d{3}Z$/, "Z");

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  userId: r.composio_user_id,
  email: r.email,
  status: r.status,
  enabled: r.enabled,
  triggerId: r.trigger_id ?? undefined,
});
const fromAccount = (userId: string, a: Account) => ({
  user_id: userId,
  id: a.id,
  composio_user_id: a.userId,
  email: a.email,
  status: a.status,
  enabled: a.enabled,
  trigger_id: a.triggerId ?? null,
});

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  description: r.description,
  color: r.color,
  gmailLabels: Object.keys(r.gmail_labels ?? {}).length ? r.gmail_labels : undefined,
  createdAt: r.created_at,
});

const toEmail = (r: EmailRow): Email => ({
  id: r.id,
  threadId: r.thread_id,
  from: r.sender,
  subject: r.subject,
  preview: r.preview,
  date: iso(r.date),
  labelIds: r.label_ids,
  url: r.url,
  folder: r.folder,
  accountId: r.account_id,
  hasAttachment: r.has_attachment,
});
const fromEmail = (userId: string, e: Email, syncedAt: string) => ({
  user_id: userId,
  id: e.id,
  account_id: e.accountId,
  thread_id: e.threadId,
  sender: e.from,
  subject: e.subject,
  preview: e.preview,
  date: e.date,
  label_ids: e.labelIds,
  url: e.url,
  folder: e.folder,
  has_attachment: Boolean(e.hasAttachment),
  synced_at: syncedAt,
});

const toAnalysis = (r: AnalysisRow): Analysis => ({
  junkKind: r.junk_kind,
  junkProbabilities: r.junk_probabilities,
  priority: r.priority,
  needsReply: r.needs_reply,
  category: r.category,
  categoryConfidence: r.category_confidence,
  categoryVersion: r.category_version,
  manualCategory: r.manual_category || undefined,
  keep: r.keep || undefined,
});
const fromAnalysis = (userId: string, emailId: string, a: Analysis) => ({
  user_id: userId,
  email_id: emailId,
  junk_kind: a.junkKind,
  junk_probabilities: a.junkProbabilities,
  priority: a.priority,
  needs_reply: a.needsReply,
  category: a.category,
  category_confidence: a.categoryConfidence,
  category_version: a.categoryVersion,
  manual_category: Boolean(a.manualCategory),
  keep: Boolean(a.keep),
});

// ---- reads ----

/** The user's settings row, created with defaults on first use. */
async function stateRow({ db, userId }: Ctx): Promise<StateRow> {
  const cols = "sweep_kinds, threshold, include_spam_folder, fetch_limit, protected_senders, last_sweep, last_sync_at, sync_started_at, total_swept, onboarded_at";
  const found = check(await db.from("user_state").select(cols).eq("user_id", userId).maybeSingle(), "reading settings");
  if (found) return found as StateRow;
  const created = await db.from("user_state").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  // 23503 = foreign key violation: the session is validly signed but its user has been deleted.
  if (created.error?.code === "23503") throw new HttpError(401, "This account no longer exists. Sign in again.");
  check(created, "creating settings");
  return check(await db.from("user_state").select(cols).eq("user_id", userId).single(), "reading settings") as StateRow;
}

const settingsOf = (r: StateRow): Settings => ({
  sweepKinds: r.sweep_kinds,
  threshold: r.threshold,
  includeSpamFolder: r.include_spam_folder,
  fetchLimit: r.fetch_limit,
});

export async function readSettings(ctx: Ctx) {
  return settingsOf(await stateRow(ctx));
}

/** When the user finished the welcome page, or null if they haven't yet. */
export async function readOnboardedAt(ctx: Ctx) {
  return (await stateRow(ctx)).onboarded_at;
}

export async function readComposio({ db, userId }: Ctx): Promise<ComposioConfig | null> {
  const row = check(
    await db.from("composio_credentials").select("api_key_sealed, hint, saved_at").eq("user_id", userId).maybeSingle(),
    "reading Composio key",
  );
  return row ? { apiKey: row.api_key_sealed, hint: row.hint, savedAt: row.saved_at } : null;
}

export async function readAccounts({ db, userId }: Ctx) {
  const rows = check(await db.from("accounts").select("*").eq("user_id", userId).order("email"), "reading accounts");
  return (rows as AccountRow[]).map(toAccount);
}

export async function readCategories({ db, userId }: Ctx) {
  const rows = check(await db.from("categories").select("*").eq("user_id", userId).order("created_at"), "reading categories");
  return (rows as CategoryRow[]).map(toCategory);
}

export async function readEmails({ db, userId }: Ctx, ids?: string[]): Promise<Record<string, Email>> {
  let rows: EmailRow[];
  if (ids) {
    rows = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = check(await db.from("emails").select("*").eq("user_id", userId).in("id", ids.slice(i, i + CHUNK)), "reading emails");
      rows.push(...(part as EmailRow[]));
    }
  } else {
    rows = await selectAll<EmailRow>(
      (from, to) => db.from("emails").select("*").eq("user_id", userId).order("date", { ascending: false }).order("id").range(from, to),
      "reading emails",
    );
  }
  return Object.fromEntries(rows.map((r) => [r.id, toEmail(r)]));
}

export async function readEmail(ctx: Ctx, id: string): Promise<Email | null> {
  return (await readEmails(ctx, [id]))[id] ?? null;
}

export async function readAnalysis({ db, userId }: Ctx, ids?: string[]): Promise<Record<string, Analysis>> {
  let rows: AnalysisRow[];
  if (ids) {
    rows = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = check(
        await db.from("analysis").select("*").eq("user_id", userId).in("email_id", ids.slice(i, i + CHUNK)),
        "reading analysis",
      );
      rows.push(...(part as AnalysisRow[]));
    }
  } else {
    rows = await selectAll<AnalysisRow>(
      (from, to) => db.from("analysis").select("*").eq("user_id", userId).order("email_id").range(from, to),
      "reading analysis",
    );
  }
  return Object.fromEntries(rows.map((r) => [r.email_id, toAnalysis(r)]));
}

/** Everything the UI shows, for one user. */
export async function readStore(ctx: Ctx): Promise<Store> {
  const [row, composio, accounts, categories, emails, analysis] = await Promise.all([
    stateRow(ctx),
    readComposio(ctx),
    readAccounts(ctx),
    readCategories(ctx),
    readEmails(ctx),
    readAnalysis(ctx),
  ]);
  return {
    emails,
    analysis,
    categories,
    accounts,
    composio,
    protectedSenders: row.protected_senders,
    settings: settingsOf(row),
    lastSweep: row.last_sweep,
    lastSyncAt: row.last_sync_at,
    syncing: syncLockHeld(row.sync_started_at),
    stats: { totalSwept: row.total_swept },
    onboardedAt: row.onboarded_at,
  };
}

// ---- writes ----

export async function writeSettings({ db, userId }: Ctx, patch: Partial<{ [K in keyof StateRow]: StateRow[K] }>) {
  await stateRow({ db, userId });
  check(await db.from("user_state").update(patch).eq("user_id", userId), "saving settings");
}

/** A sync can't outlive the function's 300 s limit; a lock older than this was left by a run that got killed. */
const SYNC_LOCK_MS = 6 * 60_000;
const syncLockHeld = (startedAt: string | null) => Boolean(startedAt && Date.now() - Date.parse(startedAt) < SYNC_LOCK_MS);

/**
 * Takes the user's sync lock in one atomic UPDATE, so two tabs, two clicks or two server instances can't both
 * sync. Returns the lock token (its start time) or null when a live sync already holds it.
 */
export async function acquireSyncLock(ctx: Ctx): Promise<string | null> {
  await stateRow(ctx);
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - SYNC_LOCK_MS).toISOString();
  const rows = check(
    await ctx.db
      .from("user_state")
      .update({ sync_started_at: now })
      .eq("user_id", ctx.userId)
      .or(`sync_started_at.is.null,sync_started_at.lt."${staleBefore}"`)
      .select("user_id"),
    "starting sync",
  );
  return rows?.length ? now : null;
}

/** Clears the lock, but only if it's still ours (a stale-lock takeover may have replaced it). */
export async function releaseSyncLock(ctx: Ctx, token: string) {
  check(await ctx.db.from("user_state").update({ sync_started_at: null }).eq("user_id", ctx.userId).eq("sync_started_at", token), "finishing sync");
}

export async function readProtectedSenders(ctx: Ctx) {
  return (await stateRow(ctx)).protected_senders;
}

/** Sweeps, trashes and undos: remember what to restore and move the running total, in one statement. */
export async function recordSweep({ db }: Ctx, sweep: SweepRecord | null, delta: number) {
  check(await db.rpc("record_sweep", { p_sweep: sweep, p_delta: delta }), "recording sweep");
}

export async function writeComposio({ db, userId }: Ctx, c: ComposioConfig | null) {
  if (c) {
    check(
      await db.from("composio_credentials").upsert({ user_id: userId, api_key_sealed: c.apiKey, hint: c.hint, saved_at: c.savedAt }),
      "saving Composio key",
    );
  } else {
    check(await db.from("composio_credentials").delete().eq("user_id", userId), "removing Composio key");
  }
}

/** Makes the stored account list exactly `accounts`; mail of removed accounts goes with them (FK cascade). */
export async function replaceAccounts(ctx: Ctx, accounts: Account[]) {
  const { db, userId } = ctx;
  const keep = new Set(accounts.map((a) => a.id));
  const gone = (await readAccounts(ctx)).filter((a) => !keep.has(a.id)).map((a) => a.id);
  if (gone.length) check(await db.from("accounts").delete().eq("user_id", userId).in("id", gone), "removing accounts");
  if (accounts.length) {
    check(await db.from("accounts").upsert(accounts.map((a) => fromAccount(userId, a)), { onConflict: "user_id,id" }), "saving accounts");
  }
}

export async function updateAccount({ db, userId }: Ctx, id: string, patch: { enabled?: boolean; triggerId?: string | null }) {
  const row: Record<string, unknown> = {};
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.triggerId !== undefined) row.trigger_id = patch.triggerId;
  check(await db.from("accounts").update(row).eq("user_id", userId).eq("id", id), "saving account");
}

export async function deleteAllAccounts({ db, userId }: Ctx) {
  check(await db.from("accounts").delete().eq("user_id", userId), "removing accounts");
}

/** Mail from mailboxes that are switched off shouldn't linger. Jev's analysis stays cached; sync prunes it. */
export async function purgeDisabledMail(ctx: Ctx) {
  const off = (await readAccounts(ctx)).filter((a) => !a.enabled).map((a) => a.id);
  if (off.length) check(await ctx.db.from("emails").delete().eq("user_id", ctx.userId).in("account_id", off), "removing mail");
}

export async function upsertEmails({ db, userId }: Ctx, emails: Email[], syncedAt = new Date().toISOString()) {
  await inChunks(
    emails.map((e) => fromEmail(userId, e, syncedAt)),
    (rows) => db.from("emails").upsert(rows, { onConflict: "user_id,id" }),
    "saving emails",
  );
}

/** After a full sync: anything not seen in this sync was trashed or moved elsewhere in Gmail. */
export async function deleteEmailsSyncedBefore({ db, userId }: Ctx, syncedAt: string) {
  check(await db.from("emails").delete().eq("user_id", userId).lt("synced_at", syncedAt), "removing old mail");
  check(await db.rpc("prune_analysis"), "pruning analysis");
}

export async function deleteEmails({ db, userId }: Ctx, ids: string[]) {
  await inChunks(ids, (part) => db.from("emails").delete().eq("user_id", userId).in("id", part), "removing mail");
}

/** Adds and removes Gmail label ids on stored mail, in one statement per chunk. */
export async function modifyLabels({ db }: Ctx, ids: string[], add: string[], remove: string[]) {
  await inChunks(ids, (part) => db.rpc("modify_labels", { p_ids: part, p_add: add, p_remove: remove }), "saving labels");
}

export async function upsertAnalysis({ db, userId }: Ctx, analysis: Record<string, Analysis>) {
  await inChunks(
    Object.entries(analysis).map(([id, a]) => fromAnalysis(userId, id, a)),
    (rows) => db.from("analysis").upsert(rows, { onConflict: "user_id,email_id" }),
    "saving analysis",
  );
}

export async function insertCategory({ db, userId }: Ctx, c: Category) {
  check(
    await db.from("categories").insert({
      user_id: userId,
      id: c.id,
      name: c.name,
      description: c.description,
      color: c.color,
      gmail_labels: c.gmailLabels ?? {},
      created_at: c.createdAt,
    }),
    "adding category",
  );
}

export async function updateCategory(
  { db, userId }: Ctx,
  id: string,
  patch: { name?: string; description?: string; gmailLabels?: Record<string, string> },
) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.gmailLabels !== undefined) row.gmail_labels = patch.gmailLabels;
  check(await db.from("categories").update(row).eq("user_id", userId).eq("id", id), "saving category");
}

export async function deleteCategory({ db, userId }: Ctx, id: string) {
  check(await db.from("categories").delete().eq("user_id", userId).eq("id", id), "deleting category");
}
