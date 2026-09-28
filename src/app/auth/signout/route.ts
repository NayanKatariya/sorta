import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Clears this browser's session cookies, then goes home. Used when a session is validly signed but its
 * user no longer exists; `local` scope skips the server call, which would fail for a deleted user anyway.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return Response.redirect(new URL("/", req.url), 303);
}
