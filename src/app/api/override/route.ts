import { body, stringList, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { readAnalysis, readCategories, upsertAnalysis } from "@/lib/store";

export const dynamic = "force-dynamic";

/** User corrections to Jev: file emails into a category by hand, or mark them as not junk. */
export const POST = withUser(async (ctx, req) => {
  const b = await body<{ ids?: unknown; category?: unknown; keep?: unknown }>(req);
  const ids = stringList(b.ids, 5000, "ids");
  const analysis = await readAnalysis(ctx, ids);
  const categories = new Set((await readCategories(ctx)).map((c) => c.id));
  for (const a of Object.values(analysis)) {
    if (b.category !== undefined) {
      a.category = typeof b.category === "string" && categories.has(b.category) ? b.category : null;
      a.manualCategory = true;
    }
    if (typeof b.keep === "boolean") a.keep = b.keep;
  }
  await upsertAnalysis(ctx, analysis);
  return Response.json(await clientState(ctx));
});
