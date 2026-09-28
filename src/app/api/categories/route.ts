import { randomUUID } from "node:crypto";
import { body, HttpError, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { deleteCategory, insertCategory, readCategories, updateCategory, type Ctx } from "@/lib/store";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#84cc16"];
const MAX_CATEGORIES = 40;

function text(v: unknown, max: number, what: string) {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new HttpError(400, `${what} must be text.`);
  const t = v.trim();
  if (t.length > max) throw new HttpError(400, `${what} is too long (max ${max} characters).`);
  return t;
}

/**
 * Saving a category only saves it, so the dialog closes at once. The client then calls
 * /api/categories/resort in the background, and a sync re-sorts anything that run didn't reach.
 */
const saved = async (ctx: Ctx) => Response.json(await clientState(ctx));

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
  return saved(ctx);
});

export const PATCH = withUser(async (ctx, req) => {
  const b = await body<{ id?: unknown; name?: unknown; description?: unknown }>(req);
  const cats = await readCategories(ctx);
  const cat = cats.find((c) => c.id === b.id);
  if (!cat) throw new HttpError(404, "Unknown category");
  const name = text(b.name, 80, "Name") || cat.name;
  const description = text(b.description, 500, "Description") ?? cat.description;
  await updateCategory(ctx, cat.id, { name, description });
  return saved(ctx);
});

export const DELETE = withUser(async (ctx, req) => {
  const id = new URL(req.url).searchParams.get("id");
  const cats = await readCategories(ctx);
  if (!cats.some((c) => c.id === id)) throw new HttpError(404, "Unknown category");
  await deleteCategory(ctx, id!);
  return saved(ctx);
});
