"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AgentsPanel, type FreshSecret } from "./agents-panel";
import { SendingForm } from "./sending-settings";
import { JUNK_KINDS, JUNK_KIND_LABELS, type ClientState, type JunkKind, type Settings } from "@/lib/types";

export type SettingsTab = "sweep" | "sending" | "agents";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ClientState;
  onSettings: (patch: Partial<Settings>) => void;
  onProtect: (sender: string, on: boolean) => void;
};

const FETCH_LIMITS = [100, 200, 500, 1000];

const HINTS: Partial<Record<JunkKind, string>> = {
  scam_or_phishing: "Fraud, fake invoices, credential grabs",
  spam: "Unsolicited bulk mail from strangers",
  promotion: "Sales and offers from brands you know",
  newsletter: "Digests you subscribed to",
  social_notification: "Likes, follows, 'people you may know'",
};

export function RulesDialog({
  open,
  onOpenChange,
  tab,
  onTab,
  ...form
}: Props & { tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
  // A new token's secret can't be fetched again, so it's kept here, outliving the tab and the dialog.
  const [fresh, setFresh] = useState<FreshSecret | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scroll-thin max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes apply right away.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => onTab(v as SettingsTab)} className="min-w-0">
          <TabsList className="w-full">
            <TabsTrigger value="sweep">Sweep rules</TabsTrigger>
            <TabsTrigger value="sending">Sending</TabsTrigger>
            <TabsTrigger value="agents">AI agents</TabsTrigger>
          </TabsList>
          <TabsContent value="sweep" className="min-w-0 pt-2">
            <p className="mb-4 text-xs text-muted-foreground">Choose what counts as junk. Changes don&apos;t need a re-scan.</p>
            <RulesForm {...form} />
          </TabsContent>
          <TabsContent value="sending" className="min-w-0 pt-2">
            <SendingForm state={form.state} onSettings={form.onSettings} />
          </TabsContent>
          <TabsContent value="agents" className="min-w-0 pt-2">
            <AgentsPanel fresh={fresh} onFresh={setFresh} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** The rules themselves: junk kinds, how sure Jev must be, fetch size, protected senders. Saves as it changes. */
export function RulesForm({ state, onSettings, onProtect }: Pick<Props, "state" | "onSettings" | "onProtect">) {
  const { settings } = state;
  const [threshold, setThreshold] = useState(settings.threshold);
  const [sender, setSender] = useState("");

  const toggleKind = (k: JunkKind, on: boolean) =>
    onSettings({ sweepKinds: on ? [...settings.sweepKinds, k] : settings.sweepKinds.filter((x) => x !== k) });

  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        {JUNK_KINDS.filter((k) => k !== "not_junk").map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-muted/40">
            <Checkbox checked={settings.sweepKinds.includes(k)} onCheckedChange={(v) => toggleKind(k, Boolean(v))} />
            <span className="flex-1">
              <span className="block text-sm font-medium">{JUNK_KIND_LABELS[k]}</span>
              <span className="block text-xs text-muted-foreground">{HINTS[k]}</span>
            </span>
          </label>
        ))}
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span>
            <span className="block text-sm font-medium">Everything in Gmail&apos;s Spam folder</span>
            <span className="block text-xs text-muted-foreground">Sweep it even if Jev isn&apos;t sure</span>
          </span>
          <Switch checked={settings.includeSpamFolder} onCheckedChange={(v) => onSettings({ includeSpamFolder: v })} />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">How sure Jev must be</span>
          <span className="tabular-nums text-muted-foreground">{Math.round(threshold * 100)}%</span>
        </div>
        <Slider
          min={50}
          max={95}
          step={5}
          value={[Math.round(threshold * 100)]}
          onValueChange={(v) => setThreshold((Array.isArray(v) ? v[0] : v) / 100)}
          onValueCommitted={(v) => onSettings({ threshold: (Array.isArray(v) ? v[0] : v) / 100 })}
        />
        <p className="text-xs text-muted-foreground">Higher removes less but makes fewer mistakes.</p>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-medium">Emails fetched per sync</p>
        <div role="radiogroup" aria-label="Emails fetched per sync" className="flex gap-1">
          {FETCH_LIMITS.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={settings.fetchLimit === n}
              onClick={() => onSettings({ fetchLimit: n })}
              className={cn(
                "flex-1 rounded-md border px-2 py-1 tabular-nums",
                settings.fetchLimit === n ? "border-foreground/40 bg-muted font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Newest inbox emails per account, plus half as many from Spam. Jev only reads emails it hasn&apos;t seen, so later syncs are quicker.
        </p>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-medium">Protected senders</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (sender.trim()) onProtect(sender, true);
            setSender("");
          }}
        >
          <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="name@company.com or company.com" />
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {state.protectedSenders.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {p}
              <button type="button" onClick={() => onProtect(p, false)} aria-label={`Remove ${p}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          {!state.protectedSenders.length && <span className="text-xs text-muted-foreground">None yet.</span>}
        </div>
      </div>
    </div>
  );
}
