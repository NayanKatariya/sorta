"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SplitShell, Wordmark } from "@/components/brand";
import { AccountPicker, ComposioKeyField } from "@/components/sift/composio-dialog";
import { RulesForm } from "@/components/sift/rules-dialog";
import { useSift, type Sift } from "@/components/sift/use-sift";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClientState } from "@/lib/types";
import { cn } from "@/lib/utils";

type StepId = "key" | "accounts" | "rules";

const STEPS: { id: StepId; title: string; body: string }[] = [
  { id: "key", title: "Connect Composio", body: "Sorta reaches Gmail through your own Composio project." },
  { id: "accounts", title: "Pick Gmail accounts", body: "Choose which mailboxes Sorta reads." },
  { id: "rules", title: "Set sweep rules", body: "Decide what counts as junk, then Sorta syncs." },
];

/**
 * First sign-in, one step at a time: Composio key → Gmail accounts → sweep rules → sync.
 * Shown until the last step is done; after that / opens the app straight away.
 */
export function Setup() {
  const sift = useSift();
  const { state } = sift;
  const [chosen, setChosen] = useState<StepId | null>(null);

  // Back from Composio's Google sign-in (the callback lands on / and is sent on here).
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("account");
    if (!result) return;
    if (result === "connected") toast.success("Gmail account connected.");
    else toast.error("Connecting the Gmail account didn't finish. Try again.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Without a key only the first step makes sense; with one, pick up at the accounts.
  const step: StepId = !state ? "key" : !state.composio.configured ? "key" : (chosen ?? "accounts");
  const index = STEPS.findIndex((s) => s.id === step);

  return (
    <SplitShell width="max-w-lg" aside={<Aside index={index} />}>
      <div>
        <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground lg:hidden">
          {STEPS.map((s, i) => (
            <span key={s.id} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-foreground" : "bg-muted")} />
          ))}
        </p>
        {!state ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : step === "key" ? (
          <KeyStep key="key" state={state} sift={sift} onDone={() => setChosen("accounts")} />
        ) : step === "accounts" ? (
          <AccountsStep key="accounts" state={state} sift={sift} onBack={() => setChosen("key")} onDone={() => setChosen("rules")} />
        ) : (
          <RulesStep key="rules" state={state} sift={sift} onBack={() => setChosen("accounts")} />
        )}
      </div>
    </SplitShell>
  );
}

function Aside({ index }: { index: number }) {
  return (
    <>
      <Wordmark />
      <div className="mt-auto space-y-8">
        <div className="space-y-2">
          <p className="text-4xl leading-tight font-semibold tracking-tight">Set up Sorta</p>
          <p className="text-base text-muted-foreground">Three steps, about two minutes.</p>
        </div>
        <ol className="space-y-5">
          {STEPS.map((s, i) => {
            const done = i < index;
            const current = i === index;
            return (
              <li key={s.id} className="flex gap-4" aria-current={current ? "step" : undefined}>
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold tabular-nums transition-colors",
                    done && "border-foreground bg-foreground text-background",
                    current && "border-foreground text-foreground",
                    !done && !current && "text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" aria-label="done" /> : i + 1}
                </span>
                <span className="pt-1">
                  <span className={cn("block text-base font-medium", !done && !current && "text-muted-foreground")}>{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.body}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-12 text-sm text-pretty text-muted-foreground">
        Nothing is deleted for good: swept mail goes to Gmail&apos;s Trash, and every sweep can be undone.
      </p>
    </>
  );
}

/** Step heading: "Step 2 of 3", the title, one line of context. */
function StepHeader({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rise-in mb-8 space-y-2">
      <p className="text-sm text-muted-foreground">
        Step {n} of {STEPS.length}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="text-base text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}

function StepFooter({ onBack, children }: { onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      {onBack && (
        <Button type="button" variant="ghost" size="lg" className="h-10" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" /> Back
        </Button>
      )}
      <div className="ml-auto flex items-center gap-3">{children}</div>
    </div>
  );
}

type StepProps = { state: ClientState; sift: Sift };

function KeyStep({ state, sift, onDone }: StepProps & { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saving = sift.busy === "composio";
  const saved = state.composio.configured;

  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError(null);
        if (!key.trim() && saved) return onDone();
        try {
          await sift.saveComposioKey(key);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }}
    >
      <StepHeader n={1} title="Connect Composio">
        Sorta reaches Gmail through Composio. Paste an API key from your Composio project. It&apos;s encrypted before it&apos;s saved and is
        never shown again.
      </StepHeader>
      <ComposioKeyField value={key} onChange={setKey} error={error} replacing={saved} className="[&_input]:h-10 [&_input]:text-base" />
      {saved && !key && (
        <p className="mt-3 text-sm text-muted-foreground">
          A key ending <span className="font-mono text-foreground">{state.composio.hint}</span> is already saved. Continue to keep it.
        </p>
      )}
      <StepFooter>
        <Button type="submit" size="lg" className="h-10 px-4 text-base" disabled={saving || (!key.trim() && !saved)}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Checking key…" : "Continue"}
          {!saving && <ArrowRight data-icon="inline-end" />}
        </Button>
      </StepFooter>
    </form>
  );
}

function AccountsStep({ state, sift, onBack, onDone }: StepProps & { onBack: () => void; onDone: () => void }) {
  // Until the user ticks something: the accounts already picked, or else every working one.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const enabled = state.accounts.filter((a) => a.enabled).map((a) => a.id);
  const current = picked ?? new Set(enabled.length ? enabled : state.accounts.filter((a) => a.status === "ACTIVE").map((a) => a.id));
  const saving = sift.busy === "accounts";
  const toggle = (id: string, on: boolean) => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  return (
    <div>
      <StepHeader n={2} title="Pick Gmail accounts">
        These are the Gmail accounts in your Composio project. Tick the ones Sorta should read, or connect another.
      </StepHeader>
      <AccountPicker state={state} picked={current} onToggle={toggle} onConnect={sift.connectAccount} connecting={sift.busy === "account"} />
      <StepFooter onBack={onBack}>
        <Button
          size="lg"
          className="h-10 px-4 text-base"
          disabled={saving || current.size === 0}
          onClick={async () => {
            if (await sift.setAccounts([...current], { syncAfter: false })) onDone();
          }}
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          {saving ? "Setting up…" : `Use ${current.size} ${current.size === 1 ? "account" : "accounts"}`}
          {!saving && <ArrowRight data-icon="inline-end" />}
        </Button>
      </StepFooter>
    </div>
  );
}

function RulesStep({ state, sift, onBack }: StepProps & { onBack: () => void }) {
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    try {
      const res = await fetch("/api/settings", { method: "POST", body: JSON.stringify({ onboarded: true }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load so the app starts fresh, then syncs
      window.location.assign("/?sync=1");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setFinishing(false);
    }
  };

  return (
    <div>
      <StepHeader n={3} title="Set sweep rules">
        Choose what counts as junk. The defaults are a safe start. Change them later with the <Kbd>,</Kbd> key.
      </StepHeader>
      <RulesForm state={state} onSettings={sift.updateSettings} onProtect={sift.protect} />
      <StepFooter onBack={onBack}>
        <Button size="lg" className="h-10 px-4 text-base" onClick={finish} disabled={finishing}>
          {finishing ? <Loader2 className="animate-spin" /> : null}
          Continue &amp; sync
          {!finishing && <ArrowRight data-icon="inline-end" />}
        </Button>
      </StepFooter>
    </div>
  );
}
