import "server-only";
import { MAX_ATTACHMENT_BYTES, type OutAttachment } from "./send";
import { HttpError } from "./session";

/** Room for the form fields and multipart framing on top of the files themselves. */
const MAX_FORM_BYTES = MAX_ATTACHMENT_BYTES + 512 * 1024;

/**
 * Parses a multipart body without ever holding more than the limit: the declared length is checked first,
 * and since that header can be missing or wrong, the stream is counted as it is read too.
 */
export async function readForm(req: Request): Promise<FormData> {
  if (!/^multipart\/form-data/i.test(req.headers.get("content-type") ?? "")) throw new HttpError(415, "Send the message as multipart/form-data.");
  const tooBig = () => new HttpError(413, `That's too much to send at once; attachments are limited to ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB per message.`);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FORM_BYTES) throw tooBig();
  if (!req.body) throw new HttpError(400, "Empty request.");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FORM_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw tooBig();
    }
    chunks.push(value);
  }
  try {
    return await new Response(new Blob(chunks as BlobPart[]), { headers: { "content-type": req.headers.get("content-type")! } }).formData();
  } catch {
    throw new HttpError(400, "Couldn't read the form.");
  }
}

export const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

/** A field sent once as "a@x.com, b@y.com" or repeated; returned as the raw strings for the address parser. */
export const fieldList = (form: FormData, name: string) => form.getAll(name).filter((v): v is string => typeof v === "string");

/** Opt-out flags travel as "0" / "false". */
export const flag = (form: FormData, name: string, fallback: boolean) => {
  const v = field(form, name)?.trim().toLowerCase();
  return v === undefined || v === "" ? fallback : !["0", "false", "no", "off"].includes(v);
};

export async function filesOf(form: FormData, name = "files"): Promise<OutAttachment[]> {
  const out: OutAttachment[] = [];
  for (const v of form.getAll(name)) {
    if (typeof v === "string") continue;
    // Browsers send an empty, nameless part for an untouched file input.
    if (!v.size && !v.name) continue;
    out.push({ name: v.name, mimeType: v.type || "application/octet-stream", bytes: new Uint8Array(await v.arrayBuffer()) });
  }
  return out;
}
