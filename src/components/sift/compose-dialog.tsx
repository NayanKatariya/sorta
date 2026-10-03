"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ClientState } from "@/lib/types";
import { AddressField, AttachmentList, DropOverlay, addFiles, postForm, useAddresses, useFileDrop } from "./compose-parts";

/** Connected mailboxes mail can leave from: Gmail must be signed in (ACTIVE), picked for Sorta or not. */
export const sendableAccounts = (state: ClientState) => state.accounts.filter((a) => a.status === "ACTIVE");

/** The saved default From if it still works, else the first picked mailbox, else any working one. */
function defaultFrom(state: ClientState) {
  const ok = sendableAccounts(state);
  return (ok.find((a) => a.id === state.settings.defaultFromAccount) ?? ok.find((a) => a.enabled) ?? ok[0])?.id ?? "";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ClientState;
  /** Pre-fills the To field (e.g. "write to this sender"). */
  initialTo?: string[];
};

export function ComposeDialog({ open, onOpenChange, state, initialTo }: Props) {
  // Mounted fresh each time it opens, so the saved defaults seed the form.
  const { settings } = state;
  const accounts = sendableAccounts(state);
  const [from, setFrom] = useState(() => defaultFrom(state));
  const to = useAddresses(initialTo ?? []);
  const cc = useAddresses(settings.defaultCc);
  const bcc = useAddresses(settings.defaultBcc);
  const [showCc, setShowCc] = useState(settings.defaultCc.length > 0);
  const [showBcc, setShowBcc] = useState(settings.defaultBcc.length > 0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [signature, setSignature] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drop = useFileDrop((f) => setFiles((cur) => addFiles(cur, f)), sending);

  const hasSignature = settings.signature.trim().length > 0;
  const recipients = to.all.length;
  const badText = [...to.bad, ...cc.bad, ...bcc.bad][0];
  const canSend = !sending && Boolean(from) && recipients > 0 && !badText && Boolean(body.trim() || files.length);
  const fromAccount = accounts.find((a) => a.id === from);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const sent = await postForm("/api/send", [
        ["from", from],
        ["to", to.all.join(", ")],
        ["cc", cc.all.join(", ")],
        ["bcc", bcc.all.join(", ")],
        ["subject", subject.trim()],
        ["body", body],
        // The form already shows the default CC/BCC, so the server must not add them a second time.
        ["defaults", "0"],
        ["signature", signature && hasSignature ? "1" : "0"],
        ...files.map((f): [string, File] => ["files", f]),
      ]);
      toast.success(`Sent to ${sent.to[0]}${sent.to.length > 1 ? ` +${sent.to.length - 1}` : ""}`, { description: sent.subject || undefined });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    // Click-away would throw the draft away, so only Escape and the buttons close it.
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)} disablePointerDismissal>
      <DialogContent className="scroll-thin max-h-[92dvh] overflow-y-auto sm:max-w-2xl" {...drop.bind}>
        <DropOverlay show={drop.dragging} />
        <DialogHeader>
          <DialogTitle>New email</DialogTitle>
          <DialogDescription>Sent from your Gmail through Composio. Press ⌘↵ to send.</DialogDescription>
        </DialogHeader>

        <form
          id="compose-form"
          className="space-y-3"
          // Plain Enter in Subject or an empty address field must not send; only ⌘↵ and the button do.
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        >
          <Row label="From" htmlFor="compose-from">
            {accounts.length ? (
              <select
                id="compose-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={sending}
                className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            ) : (
              <p className="py-1.5 text-sm text-destructive" role="alert">
                No connected Gmail account can send right now. Reconnect one under Manage accounts.
              </p>
            )}
          </Row>
          <Row
            label="To"
            htmlFor="compose-to"
            extra={
              <>
                {!showCc && <ToggleLink onClick={() => setShowCc(true)}>Cc</ToggleLink>}
                {!showBcc && <ToggleLink onClick={() => setShowBcc(true)}>Bcc</ToggleLink>}
              </>
            }
          >
            <AddressField id="compose-to" field={to} label="To" placeholder="name@company.com" autoFocus disabled={sending} />
          </Row>
          {showCc && (
            <Row label="Cc" htmlFor="compose-cc">
              <AddressField id="compose-cc" field={cc} label="Cc" disabled={sending} />
            </Row>
          )}
          {showBcc && (
            <Row label="Bcc" htmlFor="compose-bcc">
              <AddressField id="compose-bcc" field={bcc} label="Bcc" disabled={sending} />
            </Row>
          )}
          <Row label="Subject" htmlFor="compose-subject">
            <Input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={500} autoComplete="off" disabled={sending} />
          </Row>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Message"
            placeholder="Write your message…"
            rows={9}
            disabled={sending}
            className="max-h-[40dvh] min-h-40 overflow-y-auto"
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
        </form>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <p className="mr-auto text-xs text-muted-foreground max-sm:hidden sm:self-center">
            {fromAccount ? `As ${fromAccount.email}` : ""}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Discard
          </Button>
          <Button type="button" onClick={() => void send()} disabled={!canSend}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, htmlFor, extra, children }: { label: string; htmlFor: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[4.5rem_1fr] sm:items-start sm:gap-2">
      <div className="flex items-center justify-between sm:block sm:pt-1.5">
        <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        {extra && <span className="flex gap-2 sm:hidden">{extra}</span>}
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {extra && <span className="flex gap-2 pt-1.5 max-sm:hidden">{extra}</span>}
      </div>
    </div>
  );
}

function ToggleLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs text-muted-foreground hover:text-foreground">
      {children}
    </button>
  );
}
