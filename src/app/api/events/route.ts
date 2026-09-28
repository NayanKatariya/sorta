import { isLive, onLiveEvent, startListener } from "@/lib/live";
import { errorMessage, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Server-sent events for the signed-in user: their new mail, and whether their trigger stream is up. */
export async function GET(req: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 401 });
  }
  startListener(userId).catch(() => {});
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const off = onLiveEvent(userId, (e) => write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      // Keeps proxies from closing an idle connection.
      const ping = setInterval(() => write(": ping\n\n"), 25_000);
      cleanup = () => {
        off();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      write(`event: status\ndata: ${JSON.stringify({ type: "status", live: isLive(userId) })}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
