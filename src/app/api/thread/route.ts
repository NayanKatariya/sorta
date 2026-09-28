import { fetchThread } from "@/lib/gmail";
import { HttpError, withUser } from "@/lib/session";
import { readEmail } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The whole conversation an email belongs to, with full text and attachments. */
export const GET = withUser(async (ctx, req) => {
  const email = await readEmail(ctx, new URL(req.url).searchParams.get("id") ?? "");
  if (!email) throw new HttpError(404, "Email not found. Try syncing.");
  return Response.json({ messages: await fetchThread(ctx, email.accountId, email.threadId) });
});
