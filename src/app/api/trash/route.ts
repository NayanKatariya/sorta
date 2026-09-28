import { body, stringList, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { readEmails } from "@/lib/store";
import { trashAndRecord } from "@/lib/sweep";

export const dynamic = "force-dynamic";

/** Trash an explicit list of messages (e.g. everything from one sender). Undoable like a sweep. */
export const POST = withUser(async (ctx, req) => {
  const ids = stringList((await body<{ ids?: unknown }>(req)).ids, 5000, "ids");
  // Only the user's own stored mail can be targeted; unknown ids are ignored.
  const targets = Object.values(await readEmails(ctx, ids));
  if (!targets.length) return Response.json({ trashed: 0, state: await clientState(ctx) });
  const { count, notice } = await trashAndRecord(ctx, targets);
  return Response.json({ trashed: count, notice, state: await clientState(ctx) });
});
