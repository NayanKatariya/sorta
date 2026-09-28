#!/usr/bin/env node
/**
 * One-time setup for a fresh clone. Safe to re-run: it never overwrites a value you've set.
 *
 *   npm run setup
 *
 * 1. Checks Node.
 * 2. Creates .env.local from .env.example if it's missing, and generates SIFT_SECRET if it's empty.
 * 3. Checks every required variable is present and well-formed (it prints names, never values).
 * 4. Pings Supabase and Jev with your keys.
 * 5. Applies database migrations when SUPABASE_DB_URL is set.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "./lib/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
let problems = 0;
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  problems++;
};

console.log("\nSorta setup\n");

// 1. Node
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  bad(`Node ${process.versions.node}: Sorta needs Node 20 or newer.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// 2. .env.local
if (!existsSync(envPath)) {
  copyFileSync(path.join(root, ".env.example"), envPath);
  ok("Created .env.local from .env.example");
}
let text = readFileSync(envPath, "utf8");
if (!parseEnv(text).SIFT_SECRET) {
  const secret = randomBytes(48).toString("base64");
  text = /^SIFT_SECRET=.*$/m.test(text) ? text.replace(/^SIFT_SECRET=.*$/m, `SIFT_SECRET=${secret}`) : `${text.trimEnd()}\nSIFT_SECRET=${secret}\n`;
  writeFileSync(envPath, text);
  ok("Generated SIFT_SECRET (keep it: changing it makes every user re-enter their Composio key)");
}
// Values still as shipped in .env.example (…, <project-ref>) count as unset.
const env = Object.fromEntries(Object.entries(parseEnv(text)).filter(([, v]) => v && !/\.\.\.|<[^>]*>/.test(v)));

// 3. Required variables
console.log("\nEnvironment (.env.local)");
const check = (name, test, hint) => {
  const v = env[name];
  if (!v) bad(`${name} is empty. ${hint}`);
  else if (test && !test(v)) bad(`${name} looks wrong. ${hint}`);
  else ok(name);
};
check("NEXT_PUBLIC_SUPABASE_URL", (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v), "Expected https://<project-ref>.supabase.co (Supabase → Project Settings → API).");
check("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", (v) => v.startsWith("sb_publishable_") || v.startsWith("eyJ"), "Use the publishable key (sb_publishable_…).");
check("SUPABASE_SECRET_KEY", (v) => v.startsWith("sb_secret_") || v.startsWith("eyJ"), "Use the secret key (sb_secret_…). Server only.");
check("SIFT_SECRET", (v) => v.length >= 32, "At least 32 characters: openssl rand -base64 48");
const jevKey = ["JEV_API_KEY", "CMD_API_KEY", "TYPESAFE_API_KEY"].find((k) => env[k]);
if (jevKey) ok(`Jev key (${jevKey})`);
else bad("No Jev key. Set JEV_API_KEY (with JEV_BASE_URL and JEV_MODEL), or CMD_API_KEY for Command Code.");
if (env.JEV_BASE_URL && /^https?:\/\/(www\.)?commandcode\.ai\//.test(env.JEV_BASE_URL))
  warn("JEV_BASE_URL is Command Code's web page; use https://api.commandcode.ai/provider");
if (!env.JEV_DAILY_LIMIT) warn("JEV_DAILY_LIMIT is unset: fine locally, but set it on a public deploy so sign-ups can't spend your Jev budget.");

// 4. Connectivity
console.log("\nConnectivity");
const supabaseReady = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "") && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseReady) console.log("  - Supabase: skipped until its URL and publishable key are filled in");
else {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    });
    if (res.ok) ok("Supabase reachable, publishable key accepted");
    else bad(`Supabase answered ${res.status}. Check the URL and publishable key.`);
  } catch (err) {
    bad(`Supabase unreachable: ${err.message}`);
  }
  if (env.SUPABASE_SECRET_KEY) {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/user_state?select=user_id&limit=1`, {
      headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    }).catch(() => null);
    if (res?.ok) ok("Database schema present (user_state table found)");
    else if (res?.status === 404) warn("Tables not found yet: run the migrations (step 5 below, or npm run db:migrate).");
    else if (res) bad(`Secret key rejected (${res.status}).`);
  }
}
if (!jevKey) console.log("  - Jev: skipped until a key is filled in");
else {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "check-jev.mjs")], { cwd: root, encoding: "utf8" });
  const line = (r.stdout || r.stderr).trim().split("\n").pop();
  if (r.status === 0) ok(line);
  else bad(line);
}

// 5. Migrations
console.log("\nDatabase");
if (env.SUPABASE_DB_URL) {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "migrate.mjs")], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) problems++; // migrate.mjs printed the reason
} else {
  warn("SUPABASE_DB_URL not set, so migrations weren't applied. Either set it and run npm run db:migrate,");
  warn("or paste supabase/migrations/*.sql into the Supabase SQL editor in filename order.");
}

console.log(
  problems
    ? `\n${problems} problem(s) above. Fix them in .env.local and run npm run setup again.\n`
    : "\nAll set. Start it with: npm run dev\nThen see README → Supabase Auth URLs before inviting anyone.\n",
);
process.exit(problems ? 1 : 0);
