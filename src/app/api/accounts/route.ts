import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connectAccount, disconnectAccount, refreshAccounts, setEnabled } from "@/lib/accounts";
import { CONNECT_COOKIE } from "@/lib/connect-state";
import { body, HttpError, stringList, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";

export const dynamic = "force-dynamic";

/** Re-reads the connected Gmail accounts from Composio. */
export const GET = withUser(async (ctx) => {
  await refreshAccounts(ctx);
  return Response.json(await clientState(ctx));
});

/** Starts connecting another Gmail account; the client sends the browser to `redirectUrl`. */
export const POST = withUser(async (ctx, req) => {
  // APP_URL pins the callback on deploys behind proxies; otherwise the request's own origin.
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(CONNECT_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/accounts/callback",
    maxAge: 15 * 60,
  });
  return Response.json({ redirectUrl: await connectAccount(ctx, `${origin}/api/accounts/callback/${state}`) });
});

/** Saves which accounts Sorta reads; `failed` lists mailboxes whose new-mail trigger couldn't be set up. */
export const PATCH = withUser(async (ctx, req) => {
  const enabled = stringList((await body<{ enabled?: unknown }>(req)).enabled, 100, "accounts");
  const failed = await setEnabled(ctx, enabled);
  return Response.json({ failed, state: await clientState(ctx) });
});

export const DELETE = withUser(async (ctx, req) => {
  const { id } = await body<{ id?: unknown }>(req);
  if (typeof id !== "string") throw new HttpError(400, "id is required.");
  await disconnectAccount(ctx, id);
  return Response.json(await clientState(ctx));
});
