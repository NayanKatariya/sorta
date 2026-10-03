import { field, fieldList, filesOf, flag, readForm } from "@/lib/form-data";
import { sendEmail } from "@/lib/send";
import { withUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Sends a new email as multipart/form-data: to, cc, bcc (comma separated or repeated), subject, body, html,
 * from (account id), files (repeated). The composer pre-fills the default CC/BCC and signature itself, so it
 * sends `defaults=0` to stop them being added twice.
 */
export const POST = withUser(async (ctx, req) => {
  const form = await readForm(req);
  const sent = await sendEmail(ctx, {
    accountId: field(form, "from") || undefined,
    to: fieldList(form, "to"),
    cc: fieldList(form, "cc"),
    bcc: fieldList(form, "bcc"),
    subject: field(form, "subject") ?? "",
    body: field(form, "body") ?? "",
    html: field(form, "html"),
    attachments: await filesOf(form),
    defaults: flag(form, "defaults", true),
    signature: flag(form, "signature", true),
  });
  return Response.json({ sent });
});
