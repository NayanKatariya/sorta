import { refreshAccounts } from "@/lib/accounts";
import { attachmentIds, fetchFolder } from "@/lib/gmail";
import { analyzeEmails, categoryVersion, jevConfigured, recategorize } from "@/lib/jev";
import { quotaMessage, reserveJev } from "@/lib/quota";
import { errorMessage, requireUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import {
  deleteEmailsSyncedBefore,
  readAnalysis,
  readCategories,
  readComposio,
  acquireSyncLock,
  readSettings,
  releaseSyncLock,
  upsertAnalysis,
  upsertEmails,
  writeSettings,
  type Ctx,
} from "@/lib/store";
import type { Email } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Streams NDJSON progress events: fetch → analyze → done (with full state). */
export async function POST() {
  let ctx: Ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 401 });
  }
  // One sync per user at a time, across tabs and server instances. The client treats 409 as "join the running one".
  let lock: string | null;
  try {
    lock = await acquireSyncLock(ctx);
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
  if (!lock) return Response.json({ error: "A sync is already running.", syncing: true }, { status: 409 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
      try {
        if (!jevConfigured()) throw new Error("Jev isn't configured on this server. Set JEV_API_KEY (or CMD_API_KEY) and restart.");
        if (!(await readComposio(ctx))) throw new Error("Add your Composio API key first.");
        const settings = await readSettings(ctx);
        const inboxLimit = Math.min(settings.fetchLimit, 1000);
        const spamLimit = Math.ceil(inboxLimit / 2);

        const accounts = (await refreshAccounts(ctx)).filter((a) => a.enabled && a.status === "ACTIVE");
        if (!accounts.length) throw new Error("No Gmail account is picked. Choose one under accounts in the sidebar.");
        send({ stage: "fetch", message: `Fetching mail from ${accounts.length} account${accounts.length > 1 ? "s" : ""}…` });
        const syncedAt = new Date().toISOString();
        const folders = await Promise.all(
          accounts.flatMap((a) => [fetchFolder(ctx, a, "INBOX", inboxLimit), fetchFolder(ctx, a, "SPAM", spamLimit)]),
        );
        // The same message can show up in two folders' pages; keep one.
        const fetched: Email[] = [...new Map(folders.flat().map((e) => [e.id, e])).values()];
        const withFiles = await Promise.all(accounts.map((a) => attachmentIds(ctx, a, inboxLimit).catch(() => new Set<string>())));
        for (const e of fetched) e.hasAttachment = withFiles.some((ids) => ids.has(e.id));

        const [known, categories] = await Promise.all([readAnalysis(ctx), readCategories(ctx)]);
        const version = categoryVersion(categories);
        // Only new emails need the full analysis; known ones may just need a category refresh.
        const fresh = fetched.filter((e) => !known[e.id]);
        const stale = fetched.filter((e) => known[e.id] && !known[e.id].manualCategory && known[e.id].categoryVersion !== version);

        const granted = await reserveJev(ctx.userId, fresh.length + stale.length);
        const readNow = fresh.slice(0, granted);
        const recatNow = stale.slice(0, Math.max(0, granted - readNow.length));
        if (granted < fresh.length + stale.length) send({ stage: "notice", message: quotaMessage() });

        send({ stage: "analyze", done: 0, total: readNow.length, message: `Jev is reading ${readNow.length} new emails…` });
        const analysis = await analyzeEmails(readNow, categories, (done) => {
          if (done % 5 === 0 || done === readNow.length) send({ stage: "analyze", done, total: readNow.length });
        });
        const recat = recatNow.length ? await recategorize(recatNow, categories) : {};
        for (const [id, r] of Object.entries(recat)) analysis[id] = { ...known[id], ...r };

        // Replace the mailbox snapshot so trashed/moved mail disappears; keep the analysis cache.
        await upsertEmails(ctx, fetched, syncedAt);
        await deleteEmailsSyncedBefore(ctx, syncedAt);
        await upsertAnalysis(ctx, analysis);
        await writeSettings(ctx, { last_sync_at: new Date().toISOString() });
        send({ stage: "done", state: await clientState(ctx) });
      } catch (err) {
        console.error("[sync] failed", err);
        send({ stage: "error", message: errorMessage(err) });
      } finally {
        await releaseSyncLock(ctx, lock).catch((err) => console.error("[sync] releasing lock failed", err));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
