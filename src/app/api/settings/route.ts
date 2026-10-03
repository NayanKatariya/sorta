import { parseAddresses } from "@/lib/send";
import { MAX_DEFAULT_RECIPIENTS } from "@/lib/send-limits";
import { body, HttpError, withUser } from "@/lib/session";
import { clientState } from "@/lib/state";
import { readAccounts, writeSettings } from "@/lib/store";
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
  // Send defaults. null clears the default From mailbox; otherwise it must be one of the user's own accounts.
  if (patch.defaultFromAccount === null) row.default_from_account = null;
  else if (typeof patch.defaultFromAccount === "string") {
    if (!(await readAccounts(ctx)).some((a) => a.id === patch.defaultFromAccount)) throw new HttpError(400, "That Gmail account isn't connected to Sorta.");
    row.default_from_account = patch.defaultFromAccount;
  }
  if (patch.defaultCc !== undefined) row.default_cc = parseAddresses(patch.defaultCc, "CC", MAX_DEFAULT_RECIPIENTS, 2000);
  if (patch.defaultBcc !== undefined) row.default_bcc = parseAddresses(patch.defaultBcc, "BCC", MAX_DEFAULT_RECIPIENTS, 2000);
  if (patch.signature !== undefined) {
    if (typeof patch.signature !== "string") throw new HttpError(400, "The signature must be text.");
    const signature = patch.signature.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trimEnd();
    if (signature.length > 2000) throw new HttpError(400, "The signature is too long (max 2000 characters).");
    row.signature = signature;
  }
  // The first-run walkthrough was closed. Only ever set, so it can't reappear.
  if (patch.onboarded === true) row.onboarded_at = new Date().toISOString();
  if (Object.keys(row).length) await writeSettings(ctx, row);
  return Response.json(await clientState(ctx));
});
