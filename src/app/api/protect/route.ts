import { body, HttpError, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { readProtectedSenders, writeSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Protected senders (address or domain) are never swept. */
export const POST = withUser(async (ctx, req) => {
  const b = await body<{ sender?: unknown; protect?: unknown }>(req);
  if (typeof b.sender !== "string") throw new HttpError(400, "sender must be text.");
  const value = b.sender.trim().toLowerCase();
  if (value.length > 320) throw new HttpError(400, "sender is too long.");
  const list = (await readProtectedSenders(ctx)).filter((p) => p !== value);
  if (b.protect === true && value) list.push(value);
  await writeSettings(ctx, { protected_senders: list });
  return Response.json(await clientState(ctx));
});
