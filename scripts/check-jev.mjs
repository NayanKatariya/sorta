#!/usr/bin/env node
/**
 * Makes one real Jev call with your .env.local settings, resolved exactly as src/lib/jev.ts does.
 * Prints where the request went and whether it worked; never the key.
 *
 *   npm run check:jev
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { loadEnv } from "./lib/env.mjs";

loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const env = process.env;
const COMMAND_CODE_URL = "https://api.commandcode.ai/provider";

// Keep in step with jevConfig() / normalizeBaseURL() in src/lib/jev.ts.
const normalize = (raw) => {
  const v = raw?.trim();
  if (!v) return undefined;
  const u = new URL(v);
  if (/^(www\.)?commandcode\.ai$/i.test(u.hostname)) return COMMAND_CODE_URL;
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "").replace(/\/v1(\/systemone)?$/i, "");
};
const apiKey = (env.JEV_API_KEY || env.CMD_API_KEY || env.TYPESAFE_API_KEY)?.trim();
if (!apiKey) {
  console.error("No Jev key set (JEV_API_KEY, CMD_API_KEY or TYPESAFE_API_KEY).");
  process.exit(1);
}
const viaCommandCodeKey = !env.JEV_API_KEY && Boolean(env.CMD_API_KEY);
const baseURL = normalize(env.JEV_BASE_URL || env.CMD_BASE_URL) ?? (viaCommandCodeKey ? COMMAND_CODE_URL : undefined);
const model = env.JEV_MODEL?.trim() || (baseURL && new URL(baseURL).hostname === "api.commandcode.ai" ? "typesafe/jev" : undefined);
const target = `${baseURL ?? "https://api.typesafe.ai"}/v1/systemone, model ${model ?? "jev-latest"}`;

const client = new TypeSafeClient({ apiKey, ...(baseURL ? { baseURL } : {}), ...(model ? { defaultModel: model } : {}), timeout: 20_000 });
try {
  const { answers } = await client.systemOne({
    state: { email: { from: "Mom", subject: "Diwali plans?", preview: "Are you coming home on the 18th?" } },
    questions: { reply: noul("Does `email` ask the recipient for a personal reply?") },
  });
  console.log(`Jev works (${target}): reply expected p=${answers.reply.noul.toFixed(2)}`);
} catch (err) {
  console.error(`Jev failed at ${target}: ${err?.message ?? err}`);
  process.exit(1);
}
