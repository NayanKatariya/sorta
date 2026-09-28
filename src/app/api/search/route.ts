import { smartSearch } from "@/lib/jev";
import { quotaMessage, reserveJev } from "@/lib/quota";
import { body, HttpError, withUser } from "@/lib/session";
import { readEmails } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = withUser(async (ctx, req) => {
  const { query } = await body<{ query?: unknown }>(req);
  if (typeof query !== "string" || !query.trim()) return Response.json({ scores: {} });
  if (query.length > 300) throw new HttpError(400, "Search is too long (max 300 characters).");
  const emails = Object.values(await readEmails(ctx));
  const granted = await reserveJev(ctx.userId, emails.length);
  if (!granted && emails.length) throw new HttpError(429, quotaMessage());
  const scores = await smartSearch(emails.slice(0, granted), query.trim());
  return Response.json({ scores });
});
