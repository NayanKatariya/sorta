import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

let admin: SupabaseClient | undefined;

/**
 * Service-role client. It bypasses RLS, so it is only for work with no signed-in user behind it
 * (Composio's live mail stream, the Jev quota, the shared logo cache) and every query must name
 * the user it acts for. Never use it to answer a user's request.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Set SUPABASE_SECRET_KEY (Supabase → Project Settings → API keys → secret key).");
  admin ??= createClient(supabaseEnv().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export const adminConfigured = () => Boolean(process.env.SUPABASE_SECRET_KEY);
