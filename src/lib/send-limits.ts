/** Send limits shared by the server (lib/send.ts) and the composer, so the browser stops what the server would refuse. */

/** Vercel rejects request bodies over ~4.5 MB, so files (and their form/base64 overhead) have to fit under it. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const MAX_RECIPIENTS = 50;
export const MAX_SIGNATURE_CHARS = 2000;
/** Default Cc/Bcc lists in settings; the DB check constraint allows the same. */
export const MAX_DEFAULT_RECIPIENTS = 20;
