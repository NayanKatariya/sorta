#!/usr/bin/env node
/**
 * One-time move from the old single-user data/store.json into Supabase, under one Sorta account.
 * Sign up in the app first, then:
 *
 *   node --env-file=.env.local scripts/import-local-store.mjs you@example.com
 *
 * The Composio key in the old store was sealed with data/secret.key (or an old SIFT_SECRET, pass it
 * as OLD_SIFT_SECRET); it is re-sealed with the current SIFT_SECRET.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) throw new Error("Usage: node --env-file=.env.local scripts/import-local-store.mjs <account email>");
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SIFT_SECRET"]) {
  if (!process.env[v]) throw new Error(`${v} is not set`);
}

const dataDir = path.join(process.cwd(), "data");
const store = JSON.parse(await readFile(path.join(dataDir, "store.json"), "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// Find the account by email.
let userId;
for (let page = 1; !userId; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  if (data.users.length < 1000) break;
}
if (!userId) throw new Error(`No Sorta account for ${email}. Sign up in the app first.`);

const ok = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};
const chunks = (xs, n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// Settings.
ok(
  await db.from("user_state").upsert({
    user_id: userId,
    sweep_kinds: store.settings?.sweepKinds,
    threshold: store.settings?.threshold,
    include_spam_folder: store.settings?.includeSpamFolder,
    fetch_limit: store.settings?.fetchLimit,
    protected_senders: store.protectedSenders ?? [],
    last_sweep: store.lastSweep ?? null,
    last_sync_at: store.lastSyncAt ?? null,
    total_swept: store.stats?.totalSwept ?? 0,
  }),
  "settings",
);

// Composio key: open with the old key, seal with the new one.
if (store.composio?.apiKey) {
  const oldKey = process.env.OLD_SIFT_SECRET
    ? createHash("sha256").update(process.env.OLD_SIFT_SECRET).digest()
    : Buffer.from((await readFile(path.join(dataDir, "secret.key"), "utf8")).trim(), "base64");
  const [, iv, tag, data] = store.composio.apiKey.split(".");
  const d = createDecipheriv("aes-256-gcm", oldKey, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");

  const newKey = createHash("sha256").update(process.env.SIFT_SECRET).digest();
  const iv2 = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", newKey, iv2);
  const sealed = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const value = ["v1", iv2, c.getAuthTag(), sealed].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
  ok(
    await db.from("composio_credentials").upsert({ user_id: userId, api_key_sealed: value, hint: store.composio.hint, saved_at: store.composio.savedAt }),
    "Composio key",
  );
}

const accounts = store.accounts ?? [];
if (accounts.length) {
  ok(
    await db.from("accounts").upsert(
      accounts.map((a) => ({
        user_id: userId,
        id: a.id,
        composio_user_id: a.userId,
        email: a.email,
        status: a.status,
        enabled: a.enabled,
        trigger_id: a.triggerId ?? null,
      })),
    ),
    "accounts",
  );
}

const categories = store.categories ?? [];
if (categories.length) {
  ok(
    await db.from("categories").upsert(
      categories.map((c) => ({
        user_id: userId,
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        color: c.color,
        gmail_labels: c.gmailLabels ?? {},
        created_at: c.createdAt,
      })),
    ),
    "categories",
  );
}

const known = new Set(accounts.map((a) => a.id));
const emails = Object.values(store.emails ?? {}).filter((e) => known.has(e.accountId));
for (const part of chunks(emails)) {
  ok(
    await db.from("emails").upsert(
      part.map((e) => ({
        user_id: userId,
        id: e.id,
        account_id: e.accountId,
        thread_id: e.threadId ?? "",
        sender: e.from ?? "",
        subject: e.subject ?? "",
        preview: e.preview ?? "",
        date: e.date,
        label_ids: e.labelIds ?? [],
        url: e.url ?? "",
        folder: e.folder,
        has_attachment: Boolean(e.hasAttachment),
      })),
    ),
    "emails",
  );
}

const analysis = Object.entries(store.analysis ?? {});
for (const part of chunks(analysis)) {
  ok(
    await db.from("analysis").upsert(
      part.map(([id, a]) => ({
        user_id: userId,
        email_id: id,
        junk_kind: a.junkKind,
        junk_probabilities: a.junkProbabilities,
        priority: a.priority,
        needs_reply: a.needsReply,
        category: a.category,
        category_confidence: a.categoryConfidence ?? 0,
        category_version: a.categoryVersion ?? "",
        manual_category: Boolean(a.manualCategory),
        keep: Boolean(a.keep),
      })),
    ),
    "analysis",
  );
}

console.log(
  `Imported into ${email}: ${accounts.length} accounts, ${categories.length} categories, ${emails.length} emails, ${analysis.length} analyses` +
    (store.composio ? ", Composio key" : ""),
);
