"use client";

import { useState } from "react";
import { ExternalLink, KeyRound, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ClientState } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ComposioStep = "key" | "accounts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: ComposioStep;
  onStep: (step: ComposioStep) => void;
  state: ClientState;
  busy: string | null;
  onSaveKey: (key: string) => Promise<unknown>;
  onRemoveKey: () => Promise<unknown>;
  onSaveAccounts: (ids: string[]) => Promise<unknown>;
  onConnect: () => void;
};

export function ComposioDialog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="scroll-thin max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {p.step === "key" || !p.state.composio.configured ? <KeyStep {...p} /> : <AccountsStep {...p} />}
      </DialogContent>
    </Dialog>
  );
}

function KeyStep({ state, busy, onSaveKey, onStep, onOpenChange }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saving = busy === "composio";
  const replacing = state.composio.configured;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{replacing ? "Replace Composio API key" : "Connect Composio"}</DialogTitle>
        <DialogDescription>
          Sorta reaches Gmail through Composio. Paste an API key from your Composio project; it&apos;s encrypted before it&apos;s saved and never
          leaves this server.
        </DialogDescription>
      </DialogHeader>

      <form
        id="composio-key-form"
        className="space-y-1.5"
        onSubmit={async (ev) => {
          ev.preventDefault();
          setError(null);
          try {
            await onSaveKey(key);
            setKey("");
            onStep("accounts");
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        <ComposioKeyField value={key} onChange={setKey} error={error} replacing={replacing} />
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={() => (replacing ? onStep("accounts") : onOpenChange(false))}>
          {replacing ? "Back" : "Later"}
        </Button>
        <Button type="submit" form="composio-key-form" disabled={saving || !key.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Checking key…" : "Save key"}
        </Button>
      </DialogFooter>
    </>
  );
}

function AccountsStep({ state, busy, onSaveAccounts, onRemoveKey, onConnect, onStep, onOpenChange }: Props) {
  // Mounted fresh each time the step shows, so the current picks seed the checkboxes.
  const [picked, setPicked] = useState(() => new Set(state.accounts.filter((a) => a.enabled).map((a) => a.id)));
  const saving = busy === "accounts";
  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gmail accounts</DialogTitle>
        <DialogDescription>
          These are the Gmail accounts connected to your Composio project. Pick the ones Sorta should read. New mail in picked accounts shows up
          here on its own.
        </DialogDescription>
      </DialogHeader>

      <AccountPicker state={state} picked={picked} onToggle={toggle} onConnect={onConnect} connecting={busy === "account"} />

      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <KeyRound className="size-3.5 shrink-0" />
        <span className="flex-1">
          API key ending <span className="font-mono text-foreground">{state.composio.hint}</span>
        </span>
        <Button variant="ghost" size="xs" onClick={() => onStep("key")}>
          Replace
        </Button>
        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" disabled={busy === "composio"} onClick={onRemoveKey}>
          Remove
        </Button>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={saving}
          onClick={async () => {
            const r = await onSaveAccounts([...picked]);
            if (r) onOpenChange(false);
          }}
        >
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Setting up…" : `Use ${picked.size} ${picked.size === 1 ? "account" : "accounts"}`}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The API key input and its help line. The caller supplies the form, the heading and the buttons. */
export function ComposioKeyField({
  value,
  onChange,
  error,
  replacing,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  replacing?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor="composio-key" className="text-sm font-medium">
        API key
      </label>
      <Input
        id="composio-key"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ak_…"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        aria-invalid={Boolean(error)}
        aria-describedby="composio-key-help"
      />
      <p id="composio-key-help" className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
        {error ?? (
          <>
            Find it at{" "}
            <a href="https://platform.composio.dev" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
              platform.composio.dev <ExternalLink className="size-3" />
            </a>{" "}
            → Settings → API keys.
            {replacing && " A key from another project replaces your accounts here."}
          </>
        )}
      </p>
    </div>
  );
}

/** The Gmail accounts in the user's Composio project as checkboxes, plus "Connect a Gmail account". */
export function AccountPicker({
  state,
  picked,
  onToggle,
  onConnect,
  connecting,
  className,
}: {
  state: ClientState;
  picked: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  onConnect: () => void;
  connecting: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {state.accounts.map((a) => {
        const ok = a.status === "ACTIVE";
        return (
          <label
            key={a.id}
            className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", ok ? "cursor-pointer hover:bg-muted/40" : "opacity-60")}
          >
            <Checkbox checked={picked.has(a.id)} disabled={!ok} onCheckedChange={(v) => onToggle(a.id, Boolean(v))} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{a.email}</span>
              <span className="block text-xs text-muted-foreground">
                {ok ? (a.enabled && a.triggerId ? "live: new mail arrives automatically" : "connected") : `${a.status.toLowerCase()}, reconnect it in Composio`}
              </span>
            </span>
          </label>
        );
      })}
      {!state.accounts.length && (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          No Gmail account is connected to this Composio project yet.
        </p>
      )}
      <Button variant="outline" className="w-full" onClick={onConnect} disabled={connecting}>
        {connecting ? <Loader2 className="animate-spin" /> : <Plus />} Connect a Gmail account
      </Button>
    </div>
  );
}
