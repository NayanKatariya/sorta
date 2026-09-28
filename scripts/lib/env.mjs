import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Parses a dotenv file into { NAME: value }. Handles comments, blank lines, `export` and quoted values. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

/** Loads .env.local into process.env without overriding anything already set. Returns the parsed file. */
export function loadEnv(root, file = ".env.local") {
  const p = path.join(root, file);
  if (!existsSync(p)) return {};
  const env = parseEnv(readFileSync(p, "utf8"));
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  return env;
}
