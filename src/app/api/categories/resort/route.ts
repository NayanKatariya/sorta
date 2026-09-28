import { recategorize } from "@/lib/jev";
import { quotaMessage, reserveJev } from "@/lib/quota";
import { withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { readAnalysis, readCategories, readEmails, upsertAnalysis } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Re-asks Jev's category question for every loaded email against the categories as they are now.
 * Called in the background after a category is created, edited or deleted. It reads the current set itself,
 * so back-to-back edits just need one more run.
 */
export const POST = withUser(async (ctx) => {
  const [categories, emails, analysis] = await Promise.all([readCategories(ctx), readEmails(ctx), readAnalysis(ctx)]);
  const ids = new Set(categories.map((c) => c.id));
  // Emails the user filed by hand keep their category unless it was deleted.
  const auto = Object.values(emails).filter((e) => analysis[e.id] && (!analysis[e.id].manualCategory || !ids.has(analysis[e.id].category ?? "")));
  const granted = await reserveJev(ctx.userId, auto.length);
  const updates = await recategorize(auto.slice(0, granted), categories);
  await upsertAnalysis(ctx, Object.fromEntries(Object.entries(updates).map(([id, r]) => [id, { ...analysis[id], ...r, manualCategory: false }])));
  const state = await clientState(ctx);
  return Response.json(granted < auto.length ? { ...state, notice: quotaMessage() } : state);
});
