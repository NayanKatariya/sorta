import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Where Supabase's emails land: sign-up confirmation and password reset. Handles both the PKCE
 * `code` flow and the `token_hash` flow (which also works when the link is opened in another browser).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  if (error) return Response.redirect(new URL(`/login?error=${encodeURIComponent("That link is invalid or has expired.")}`, url.origin), 303);
  return Response.redirect(new URL(type === "recovery" ? "/auth/reset" : next, url.origin), 303);
}
