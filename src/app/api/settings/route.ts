import { body, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { writeSettings } from "@/lib/store";
import { JUNK_KINDS, type JunkKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export const POST = withUser(async (ctx, req) => {
  const patch = await body<Record<string, unknown>>(req);
  const row: Parameters<typeof writeSettings>[1] = {};
  if (Array.isArray(patch.sweepKinds)) {
    row.sweep_kinds = [...new Set(patch.sweepKinds)].filter((k): k is JunkKind => JUNK_KINDS.includes(k as JunkKind) && k !== "not_junk");
  }
  if (typeof patch.threshold === "number" && Number.isFinite(patch.threshold)) row.threshold = Math.min(0.99, Math.max(0.3, patch.threshold));
  if (typeof patch.includeSpamFolder === "boolean") row.include_spam_folder = patch.includeSpamFolder;
  if (typeof patch.fetchLimit === "number" && Number.isFinite(patch.fetchLimit)) {
    row.fetch_limit = Math.min(1000, Math.max(25, Math.round(patch.fetchLimit)));
  }
  // The first-run walkthrough was closed. Only ever set, so it can't reappear.
  if (patch.onboarded === true) row.onboarded_at = new Date().toISOString();
  if (Object.keys(row).length) await writeSettings(ctx, row);
  return Response.json(await clientState(ctx));
});
