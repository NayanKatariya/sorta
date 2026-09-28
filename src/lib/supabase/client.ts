"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client, used only for sign-in, sign-up and sign-out. Mail data goes through /api. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
