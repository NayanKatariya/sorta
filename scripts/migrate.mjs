#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql to your Supabase Postgres, in filename order, each in its own transaction.
 *
 *   npm run db:migrate            apply what's missing
 *   npm run db:migrate -- --dry   list what would run
 *
 * Needs SUPABASE_DB_URL in .env.local (or the environment): Supabase dashboard → Connect → "Session pooler"
 * connection string, with your database password filled in.
 *
 * Applied migrations are recorded in supabase_migrations.schema_migrations, the same table the Supabase CLI
 * and dashboard use, so this, `supabase db push` and the SQL editor can be mixed. A migration counts as applied
 * when its version or its name (the part after the timestamp) is already recorded.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnv } from "./lib/env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "supabase", "migrations");
const dry = process.argv.includes("--dry");

loadEnv(root);
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "Set SUPABASE_DB_URL in .env.local first.\n" +
      "Supabase dashboard → your project → Connect → Session pooler, e.g.\n" +
      "  postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
  );
  process.exit(1);
}

const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
  `);
  const { rows } = await client.query("select version, name from supabase_migrations.schema_migrations");
  const versions = new Set(rows.map((r) => r.version));
  const names = new Set(rows.map((r) => r.name));

  let ran = 0;
  for (const file of files) {
    const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/);
    if (versions.has(version) || names.has(name)) {
      console.log(`  ✓ ${file}`);
      continue;
    }
    if (dry) {
      console.log(`  → ${file} (would apply)`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3)", [version, [sql], name]);
      await client.query("commit");
      console.log(`  + ${file}`);
      ran++;
    } catch (err) {
      await client.query("rollback");
      console.error(`  ✗ ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!dry && process.exitCode !== 1) console.log(ran ? `Applied ${ran} migration(s).` : "Database is up to date.");
} finally {
  await client.end();
}
