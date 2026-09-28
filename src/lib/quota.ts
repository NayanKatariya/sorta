import "server-only";
import { adminClient } from "./supabase/admin";

/**
 * JEV_DAILY_LIMIT caps how many emails Jev reads per user per day. Unset means no cap (fine when
 * you host for yourself). On a public deploy that pays for Jev with one server key, set it.
 */
export function dailyLimit() {
  const raw = process.env.JEV_DAILY_LIMIT?.trim();
  if (!raw) return null;
  const n = Number(raw);
  // A typo must not silently mean "unlimited" on a deploy that relies on the cap.
  if (!Number.isFinite(n) || n < 0) throw new Error(`JEV_DAILY_LIMIT must be a whole number ≥ 0, got "${raw}".`);
  return Math.floor(n);
}

/** Claims up to `wanted` Jev calls from today's allowance and returns how many were granted. */
export async function reserveJev(userId: string, wanted: number): Promise<number> {
  const limit = dailyLimit();
  if (limit === null || wanted <= 0) return Math.max(0, wanted);
  const { data, error } = await adminClient().rpc("consume_jev_quota", { p_user: userId, p_calls: wanted, p_limit: limit });
  if (error) throw new Error(`Couldn't check the Jev quota (${error.message})`);
  return data as number;
}

export const quotaMessage = () => `Daily Jev limit reached (${dailyLimit()} emails per day). The rest will be read tomorrow.`;
