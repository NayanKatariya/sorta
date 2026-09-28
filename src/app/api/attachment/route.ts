import { getAttachment } from "@/lib/gmail";
import { HttpError, withUser } from "@/lib/session";
import { readEmail } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Types a browser can show without running anything. Everything else (HTML, SVG, …) is a download. */
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "application/pdf"]);
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Streams one attachment. `email` is any stored message of the conversation (it names the mailbox,
 * and must be the user's); `message` is the message holding the file, which may be one the user sent.
 */
export const GET = withUser(async (ctx, req) => {
  const q = new URL(req.url).searchParams;
  const [emailId, message, id, name] = [q.get("email"), q.get("message"), q.get("id"), q.get("name")];
  if (!emailId || !message || !id || !name) throw new HttpError(404, "Attachment not found");
  const email = await readEmail(ctx, emailId);
  if (!email) throw new HttpError(404, "Attachment not found");

  const file = await getAttachment(ctx, email.accountId, message, id, name);
  const res = await fetch(file.url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok || !res.body) throw new Error(`Couldn't fetch the attachment (${res.status})`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new HttpError(413, "Attachment is too large to preview.");

  const type = file.mimeType.split(";")[0].trim().toLowerCase();
  const inline = INLINE.has(type) && !q.get("download");
  return new Response(res.body, {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // Attachments come from strangers: nothing in them may run as this site.
      ...(type === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" }),
    },
  });
});
