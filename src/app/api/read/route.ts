import { batchModify, byAccount } from "@/lib/gmail";
import { body, stringList, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { modifyLabels, readEmails } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Mark messages read (or unread again) in Gmail, then mirror the UNREAD label locally. */
export const POST = withUser(async (ctx, req) => {
  const b = await body<{ ids?: unknown; read?: unknown }>(req);
  const ids = stringList(b.ids, 5000, "ids");
  const read = b.read !== false;
  const targets = Object.values(await readEmails(ctx, ids));
  for (const [accountId, msgs] of byAccount(targets)) {
    await batchModify(ctx, accountId, msgs, read ? [] : ["UNREAD"], read ? ["UNREAD"] : []);
  }
  await modifyLabels(ctx, targets.map((e) => e.id), read ? [] : ["UNREAD"], read ? ["UNREAD"] : []);
  return Response.json(await clientState(ctx));
});
