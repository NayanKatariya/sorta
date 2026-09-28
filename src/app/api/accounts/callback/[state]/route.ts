import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { refreshAccounts } from "@/lib/accounts";
import { CONNECT_COOKIE } from "@/lib/connect-state";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Composio sends the browser here after Google sign-in, with ?status=success|failed.
 * `state` must match the one-time value set when this user started connecting, so another site
 * can't send a signed-in user here to switch on mailboxes they never chose.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/accounts/callback/[state]">) {
  const url = new URL(req.url);
  const home = process.env.APP_URL || url.origin;
  const { state } = await params;
  const jar = await cookies();
  const expected = jar.get(CONNECT_COOKIE)?.value ?? "";
  jar.delete(CONNECT_COOKIE);

  const matches = expected.length === state.length && expected.length > 0 && timingSafeEqual(Buffer.from(expected), Buffer.from(state));
  const ok = matches && url.searchParams.get("status") !== "failed";
  if (ok) {
    const ctx = await requireUser().catch(() => null);
    if (!ctx) return Response.redirect(new URL("/login", home), 303);
    // A mailbox connected from Sorta is one the user wants read, so it starts picked.
    await refreshAccounts(ctx, { enableNew: true }).catch((err) => console.error("[accounts] callback refresh failed", err));
  }
  return Response.redirect(new URL(`/?account=${ok ? "connected" : "failed"}`, home), 303);
}
