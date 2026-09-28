import "server-only";
import { trashMessages } from "./gmail";
import { deleteEmails, recordSweep, type Ctx } from "./store";
import type { Email } from "./types";

/** Undo restores at most this many messages (one Gmail call each). */
export const MAX_UNDO = 5000;

/**
 * Trashes `targets` in Gmail, then records exactly the ones that went (for undo) and drops them
 * locally. If Gmail failed part-way, the rest stay in view and `notice` says so.
 */
export async function trashAndRecord(ctx: Ctx, targets: Email[]) {
  const { done, error } = await trashMessages(ctx, targets);
  const moved = targets.filter((e) => done.has(e.id));
  if (!moved.length) throw error instanceof Error ? error : new Error(String(error ?? "Nothing was moved to Trash."));
  await recordSweep(
    ctx,
    {
      at: new Date().toISOString(),
      items: moved.slice(0, MAX_UNDO).map((e) => ({ id: e.id, accountId: e.accountId, restoreLabels: e.labelIds.filter((l) => l === "INBOX" || l === "SPAM") })),
    },
    moved.length,
  );
  await deleteEmails(ctx, moved.map((e) => e.id));
  const notice = error ? `Gmail stopped part-way: ${targets.length - moved.length} emails weren't moved. Try again.` : undefined;
  return { count: moved.length, notice };
}
