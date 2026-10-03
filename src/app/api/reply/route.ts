import { field, fieldList, filesOf, flag, readForm } from "@/lib/form-data";
import { replyToThread } from "@/lib/send";
import { withUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Replies to a conversation as multipart/form-data: email (a stored email id) or thread + account, body, html,
 * cc, bcc, replyAll, files (repeated). Same `defaults` / `signature` switches as /api/send.
 */
export const POST = withUser(async (ctx, req) => {
  const form = await readForm(req);
  const sent = await replyToThread(ctx, {
    emailId: field(form, "email") || undefined,
    threadId: field(form, "thread") || undefined,
    accountId: field(form, "account") || undefined,
    body: field(form, "body") ?? "",
    html: field(form, "html"),
    cc: fieldList(form, "cc"),
    bcc: fieldList(form, "bcc"),
    replyAll: flag(form, "replyAll", false),
    attachments: await filesOf(form),
    defaults: flag(form, "defaults", true),
    signature: flag(form, "signature", true),
  });
  return Response.json({ sent });
});
