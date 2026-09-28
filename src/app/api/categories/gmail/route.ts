import { batchModify, byAccount, ensureLabel } from "@/lib/gmail";
import { body, HttpError, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { modifyLabels, readAnalysis, readCategories, readEmails, updateCategory } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Mirrors a category into Gmail as a label "Sorted/<name>" and applies it to matching emails. */
export const POST = withUser(async (ctx, req) => {
  const { id } = await body<{ id?: unknown }>(req);
  const cat = (await readCategories(ctx)).find((c) => c.id === id);
  if (!cat) throw new HttpError(404, "Unknown category");
  const [emails, analysis] = await Promise.all([readEmails(ctx), readAnalysis(ctx)]);
  const matching = Object.values(emails).filter((e) => analysis[e.id]?.category === cat.id);
  // Labels are per mailbox, so each account gets its own "Sorted/<name>" label.
  const labels: Record<string, string> = { ...cat.gmailLabels };
  for (const [accountId, ids] of byAccount(matching)) {
    labels[accountId] ??= await ensureLabel(ctx, accountId, `Sorted/${cat.name}`);
    await batchModify(ctx, accountId, ids, [labels[accountId]], []);
    await modifyLabels(ctx, ids, [labels[accountId]], []);
  }
  await updateCategory(ctx, cat.id, { gmailLabels: labels });
  return Response.json({ labeled: matching.length, state: await clientState(ctx) });
});
