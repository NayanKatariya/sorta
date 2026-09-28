import { removeApiKey, saveApiKey } from "@/lib/accounts";
import { body, HttpError, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";

export const dynamic = "force-dynamic";

/** Saves (or replaces) the user's Composio API key. It's encrypted at rest and never sent back. */
export const POST = withUser(async (ctx, req) => {
  const { apiKey } = await body<{ apiKey?: unknown }>(req);
  try {
    await saveApiKey(ctx, typeof apiKey === "string" ? apiKey : "");
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  return Response.json(await clientState(ctx));
});

export const DELETE = withUser(async (ctx) => {
  await removeApiKey(ctx);
  return Response.json(await clientState(ctx));
});
