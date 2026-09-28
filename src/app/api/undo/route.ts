import { batchModify, byAccount, untrashMessage } from "@/lib/gmail";
import { withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { readAccounts, readStore, recordSweep } from "@/lib/store";
import { MAX_UNDO } from "@/lib/sweep";

export const dynamic = "force-dynamic";

/** Restores the last sweep from Trash back to Inbox/Spam. Run a sync afterwards to see them again. */
export const POST = withUser(async (ctx) => {
  const sweep = (await readStore(ctx)).lastSweep;
  if (!sweep) return Response.json({ restored: 0, state: await clientState(ctx) });

  // last_sweep is the user's own row, but only act on mailboxes that are still theirs.
  const mine = new Set((await readAccounts(ctx)).map((a) => a.id));
  // It's also user-writable through the Data API, so it's capped rather than trusted to be small.
  const items = (Array.isArray(sweep.items) ? sweep.items : [])
    .filter((i) => i && typeof i.id === "string" && mine.has(i.accountId))
    .slice(0, MAX_UNDO);

  const failed = new Set<string>();
  const queue = [...items];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          await untrashMessage(ctx, item.accountId, item.id);
        } catch {
          failed.add(item.id);
        }
      }
    }),
  );
  // Untrash restores the message but not necessarily the folder it came from. If putting it back
  // in its folder fails, it counts as not restored (untrash again is harmless on a retry).
  for (const label of ["INBOX", "SPAM"]) {
    const back = items.filter((i) => !failed.has(i.id) && Array.isArray(i.restoreLabels) && i.restoreLabels.includes(label));
    for (const [accountId, ids] of byAccount(back)) {
      await batchModify(ctx, accountId, ids, [label], []).catch(() => ids.forEach((id) => failed.add(id)));
    }
  }
  const restored = items.filter((i) => !failed.has(i.id));

  // Whatever couldn't be restored stays recorded, so undo can be tried again.
  const left = items.filter((i) => failed.has(i.id));
  await recordSweep(ctx, left.length ? { ...sweep, items: left } : null, -restored.length);
  return Response.json({ restored: restored.length, failed: failed.size, state: await clientState(ctx) });
});
