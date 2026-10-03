"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Reply, ReplyAll, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { senderName } from "@/lib/policy";
import type { ClientState } from "@/lib/types";
import { AddressField, AttachmentList, DropOverlay, addFiles, postForm, useAddresses, useFileDrop } from "./compose-parts";
import type { Row } from "./model";

/** Whether an unsent reply has text or files, so moving away from the conversation can refuse to throw it out. */
let draftOpen = false;
export const hasReplyDraft = () => draftOpen;

/** Inline reply under the conversation. Mounted per open, so it starts from the saved CC/BCC defaults. */
export function ReplyBox({
  email,
  state,
  all,
  onAll,
  onClose,
  onSent,
}: {
  email: Row;
  state: ClientState;
  all: boolean;
  onAll: (all: boolean) => void;
  onClose: () => void;
  onSent: () => void;
}) {
  const { settings } = state;
  const cc = useAddresses(settings.defaultCc);
  const bcc = useAddresses(settings.defaultBcc);
  const [showCc, setShowCc] = useState(settings.defaultCc.length > 0);
  const [showBcc, setShowBcc] = useState(settings.defaultBcc.length > 0);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [signature, setSignature] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drop = useFileDrop((f) => setFiles((cur) => addFiles(cur, f)), sending);
  const root = useRef<HTMLDivElement>(null);

  const mailbox = state.accounts.find((a) => a.id === email.accountId);
  const hasSignature = settings.signature.trim().length > 0;
  const badText = [...cc.bad, ...bcc.bad][0];
  const canSend = !sending && !badText && Boolean(body.trim() || files.length);
  const dirty = Boolean(body.trim() || files.length);

  useEffect(() => {
    draftOpen = dirty;
    return () => {
      draftOpen = false;
    };
  }, [dirty]);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const sent = await postForm("/api/reply", [
        ["email", email.id],
        ["body", body],
        ["replyAll", all ? "1" : "0"],
        ["cc", cc.all.join(", ")],
        ["bcc", bcc.all.join(", ")],
        // CC/BCC are shown above, so the server must not add the defaults again.
        ["defaults", "0"],
        ["signature", signature && hasSignature ? "1" : "0"],
        ...files.map((f): [string, File] => ["files", f]),
      ]);
      toast.success(`Reply sent to ${sent.to[0] ?? "the thread"}${sent.to.length > 1 ? ` +${sent.to.length - 1}` : ""}`);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  };

  return (
    <section
      ref={root}
      // Keeps the app's single-key shortcuts (j, k, e, Esc…) away while focus is anywhere in the reply.
      data-compose
      aria-label={all ? "Reply to all" : "Reply"}
      {...drop.bind}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void send();
        } else if (e.key === "Escape") {
          // An empty reply closes; one with text stays put, and the Escape doesn't reach the sheet behind it.
          e.stopPropagation();
          if (!dirty) onClose();
        }
      }}
      className="relative mt-6 space-y-3 rounded-md border bg-background/40 p-3"
    >
      <DropOverlay show={drop.dragging} className="rounded-md" />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex gap-1" role="group" aria-label="Reply to">
          <Button type="button" variant={all ? "ghost" : "secondary"} size="xs" aria-pressed={!all} onClick={() => onAll(false)} disabled={sending}>
            <Reply /> Reply
          </Button>
          <Button type="button" variant={all ? "secondary" : "ghost"} size="xs" aria-pressed={all} onClick={() => onAll(true)} disabled={sending}>
            <ReplyAll /> Reply all
          </Button>
        </div>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          To {senderName(email.from)}
          {all && " and everyone on the thread"}
          {mailbox && <> · from {mailbox.email}</>}
        </p>
        <div className="flex gap-2">
          {!showCc && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCc(true)}>
              Cc
            </button>
          )}
          {!showBcc && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowBcc(true)}>
              Bcc
            </button>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} disabled={sending} aria-label="Discard reply">
          <X />
        </Button>
      </div>

      {showCc && (
        <div className="space-y-1">
          <label htmlFor="reply-cc" className="text-xs font-medium text-muted-foreground">
            Cc
          </label>
          <AddressField id="reply-cc" field={cc} label="Cc" disabled={sending} />
        </div>
      )}
      {showBcc && (
        <div className="space-y-1">
          <label htmlFor="reply-bcc" className="text-xs font-medium text-muted-foreground">
            Bcc
          </label>
          <AddressField id="reply-bcc" field={bcc} label="Bcc" disabled={sending} />
        </div>
      )}

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Your reply"
        placeholder="Write your reply…"
        rows={5}
        autoFocus
        disabled={sending}
        className="max-h-[40dvh] min-h-24 overflow-y-auto"
      />

      {hasSignature && (
        <div className="rounded-lg border border-dashed px-3 py-2">
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Add your signature</span>
            <Switch size="sm" checked={signature} onCheckedChange={setSignature} disabled={sending} />
          </label>
          {signature && <p className="mt-1.5 text-xs break-words whitespace-pre-wrap text-muted-foreground">-- {"\n"}{settings.signature}</p>}
        </div>
      )}

      <AttachmentList files={files} onFiles={setFiles} disabled={sending} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground max-sm:hidden">⌘↵ to send</span>
        <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
          Discard
        </Button>
        <Button type="button" onClick={() => void send()} disabled={!canSend}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          {sending ? "Sending…" : all ? "Send to all" : "Send"}
        </Button>
      </div>
    </section>
  );
}
