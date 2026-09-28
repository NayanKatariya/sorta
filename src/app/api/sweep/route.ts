import { isSweepable } from "@/lib/policy";
import { body, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { readStore } from "@/lib/store";
import { trashAndRecord } from "@/lib/sweep";

export const dynamic = "force-dynamic";

/** One-click junk removal. Moves everything the sweep rule matches to Gmail Trash (recoverable). */
export const POST = withUser(async (ctx, req) => {
  const { exclude } = await body<{ exclude?: unknown }>(req);
  const skip = new Set(Array.isArray(exclude) ? exclude.filter((x): x is string => typeof x === "string") : []);
  const s = await readStore(ctx);
  const picked = new Set(s.accounts.filter((a) => a.enabled).map((a) => a.id));
  const targets = Object.values(s.emails).filter(
    (e) => picked.has(e.accountId) && !skip.has(e.id) && isSweepable(e, s.analysis[e.id], s.settings, s.protectedSenders),
  );
  if (!targets.length) return Response.json({ swept: 0, state: await clientState(ctx) });

  const { count, notice } = await trashAndRecord(ctx, targets);
  return Response.json({ swept: count, notice, state: await clientState(ctx) });
});
