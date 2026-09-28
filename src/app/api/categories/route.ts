import { randomUUID } from "node:crypto";
import { recategorize } from "@/lib/jev";
import { quotaMessage, reserveJev } from "@/lib/quota";
import { body, HttpError, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { deleteCategory, insertCategory, readAnalysis, readCategories, readEmails, updateCategory, upsertAnalysis, type Ctx } from "@/lib/store";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16"];
const MAX_CATEGORIES = 40;

function text(v: unknown, max: number, what: string) {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new HttpError(400, `${what} must be text.`);
  const t = v.trim();
  if (t.length > max) throw new HttpError(400, `${what} is too long (max ${max} characters).`);
  return t;
}

/** Any change to the category set re-asks Jev's category question for every loaded email. */
async function reclassify(ctx: Ctx, categories: Category[]) {
  const [emails, analysis] = await Promise.all([readEmails(ctx), readAnalysis(ctx)]);
  const ids = new Set(categories.map((c) => c.id));
  // Emails the user filed by hand keep their category unless it was deleted.
  const auto = Object.values(emails).filter((e) => analysis[e.id] && (!analysis[e.id].manualCategory || !ids.has(analysis[e.id].category ?? "")));
  const granted = await reserveJev(ctx.userId, auto.length);
  const updates = await recategorize(auto.slice(0, granted), categories);
  const next = Object.fromEntries(
    Object.entries(updates).map(([id, r]) => [id, { ...analysis[id], ...r, manualCategory: false }]),
  );
  await upsertAnalysis(ctx, next);
  const state = await clientState(ctx);
  return Response.json(granted < auto.length ? { ...state, notice: quotaMessage() } : state);
}

export const POST = withUser(async (ctx, req) => {
  const b = await body<{ name?: unknown; description?: unknown }>(req);
  const name = text(b.name, 80, "Name");
  if (!name) throw new HttpError(400, "Name is required");
  const cats = await readCategories(ctx);
  if (cats.length >= MAX_CATEGORIES) throw new HttpError(400, `You can have up to ${MAX_CATEGORIES} categories.`);
  const category: Category = {
    id: `c_${randomUUID().slice(0, 8)}`,
    name,
    description: text(b.description, 500, "Description") ?? "",
    color: PALETTE[cats.length % PALETTE.length],
    createdAt: new Date().toISOString(),
  };
  await insertCategory(ctx, category);
  return reclassify(ctx, [...cats, category]);
});

export const PATCH = withUser(async (ctx, req) => {
  const b = await body<{ id?: unknown; name?: unknown; description?: unknown }>(req);
  const cats = await readCategories(ctx);
  const cat = cats.find((c) => c.id === b.id);
  if (!cat) throw new HttpError(404, "Unknown category");
  const name = text(b.name, 80, "Name") || cat.name;
  const description = text(b.description, 500, "Description") ?? cat.description;
  await updateCategory(ctx, cat.id, { name, description });
  return reclassify(ctx, cats.map((c) => (c.id === cat.id ? { ...c, name, description } : c)));
});

export const DELETE = withUser(async (ctx, req) => {
  const id = new URL(req.url).searchParams.get("id");
  const cats = await readCategories(ctx);
  if (!cats.some((c) => c.id === id)) throw new HttpError(404, "Unknown category");
  await deleteCategory(ctx, id!);
  return reclassify(ctx, cats.filter((c) => c.id !== id));
});
