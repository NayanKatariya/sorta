import type { Analysis, Email, Settings } from "./types";

export function senderAddress(from: string) {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

export function senderName(from: string) {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : senderAddress(from);
}

/** Personal mailboxes: the provider's logo says nothing about who sent the email. */
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.in",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "yandex.com", "rediffmail.com",
]);
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ltd", "plc", "gen", "firm", "ind", "bank"]);

/** mail.notifications.upwork.com → upwork.com; alerts.hdfcbank.co.in → hdfcbank.co.in. */
export function orgDomain(host: string) {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const take = parts.at(-1)!.length === 2 && SECOND_LEVEL.has(parts.at(-2)!) ? 3 : 2;
  return parts.slice(-take).join(".");
}

/** The logo key for an email address, or null when there's no brand to show. */
export function logoDomain(address: string) {
  const host = address.split("@")[1];
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;
  const org = orgDomain(host);
  return FREEMAIL.has(org) ? null : org;
}

/** Probability mass Jev put on the kinds the user chose to sweep. */
export function junkScore(a: Analysis | undefined, settings: Settings) {
  if (!a) return 0;
  return settings.sweepKinds.reduce((sum, k) => sum + (a.junkProbabilities[k] ?? 0), 0);
}

/**
 * The sweep rule, kept in code: protected senders and starred mail are never
 * swept; Gmail's Spam folder is swept if enabled; otherwise Jev's junk
 * probability must clear the threshold.
 */
export function isSweepable(e: Email, a: Analysis | undefined, settings: Settings, protectedSenders: string[]) {
  const addr = senderAddress(e.from);
  if (protectedSenders.some((p) => addr === p || addr.endsWith(`@${p}`) || addr.endsWith(`.${p}`))) return false;
  if (e.labelIds.includes("STARRED") || a?.keep) return false;
  if (e.folder === "spam" && settings.includeSpamFolder) return true;
  return junkScore(a, settings) >= settings.threshold;
}
