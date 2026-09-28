#!/usr/bin/env node
/**
 * Copies the app's variables from .env.local to your linked Vercel project, overwriting ones already there.
 * Values go over stdin, so they never appear in the process list or in this script's output.
 *
 *   npx vercel link                                  once, to pick or create the project
 *   npm run vercel:env                               → Production
 *   npm run vercel:env -- --preview                  → Production and Preview
 *   npm run vercel:env -- --app-url https://x.app    also sets APP_URL
 *
 * Skipped: empty values, VERCEL_* (Vercel's own), SUPABASE_DB_URL (only migrations need it) and E2E_* (tests).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const targets = ["production", ...(args.includes("--preview") ? ["preview"] : [])];
const appUrlAt = args.indexOf("--app-url");

const env = { ...loadEnv(root) };
if (appUrlAt !== -1) env.APP_URL = args[appUrlAt + 1];
const skip = (k) => k.startsWith("VERCEL_") || k.startsWith("E2E_") || k === "SUPABASE_DB_URL";
const names = Object.keys(env).filter((k) => env[k] && !skip(k));
if (!names.length) {
  console.error("Nothing to upload: .env.local is missing or empty. Run npm run setup first.");
  process.exit(1);
}

let failed = 0;
for (const target of targets) {
  for (const name of names) {
    // NEXT_PUBLIC_* ends up in the browser bundle anyway; everything else is stored as a secret.
    const kind = name.startsWith("NEXT_PUBLIC_") ? "--no-sensitive" : "--sensitive";
    const r = spawnSync("npx", ["vercel", "env", "add", name, target, "--force", "--yes", kind], {
      cwd: root,
      input: env[name],
      encoding: "utf8",
    });
    if (r.status === 0) console.log(`  ✓ ${name} → ${target}`);
    else {
      failed++;
      const msg = (r.stderr || r.stdout).split("\n").find((l) => /error|Error/.test(l)) ?? "failed";
      console.error(`  ✗ ${name} → ${target}: ${msg.trim()}`);
    }
  }
}
console.log(failed ? `\n${failed} variable(s) failed.` : "\nDone. Redeploy for them to take effect: npx vercel --prod");
process.exit(failed ? 1 : 0);
