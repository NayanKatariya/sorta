"use client";

import { useState } from "react";
import {
  Inbox,
  KeyRound,
  Moon,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { ClientState } from "@/lib/types";
import { STATUSES, STATUS_LABEL, type Collection, type Layout, type Status } from "./model";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ClientState;
  junkCount: number;
  onCollection: (c: Collection) => void;
  onStatus: (s: Status) => void;
  onLayout: (l: Layout) => void;
  onSync: () => void;
  onSweep: () => void;
  onUndo: () => void;
  onNewCategory: () => void;
  onRules: () => void;
  onAskJev: (q: string) => void;
};

export function CommandMenu({
  open,
  onOpenChange,
  state,
  junkCount,
  ...on
}: Props) {
  const [q, setQ] = useState("");
  const { resolvedTheme, setTheme } = useTheme();
  const run = (fn: () => void) => () => {
    onOpenChange(false);
    setQ("");
    fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Commands"
      description="Search commands, views, or ask Jev"
    >
      <Command>
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder="Type a command, or describe mail to find…"
        />
        <CommandList>
          <CommandEmpty>No commands match.</CommandEmpty>
          {q.trim().length > 2 && (
            <CommandGroup heading="Jev">
              <CommandItem
                value={`ask jev ${q}`}
                onSelect={run(() => on.onAskJev(q.trim()))}
              >
                <Sparkles /> Find mail about “{q.trim()}”
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Actions">
            {junkCount > 0 && (
              <CommandItem onSelect={run(on.onSweep)}>
                <Trash2 className="text-sweep" /> Sweep {junkCount} junk emails
              </CommandItem>
            )}
            <CommandItem onSelect={run(on.onSync)}>
              <RefreshCw /> Sync Gmail
            </CommandItem>
            {state.lastSweep && (
              <CommandItem onSelect={run(on.onUndo)}>
                <Undo2 /> Undo last sweep
              </CommandItem>
            )}
            <CommandItem onSelect={run(on.onNewCategory)}>
              <Plus /> New category
              <CommandShortcut>C</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(on.onRules)}>
              <SlidersHorizontal /> Sweep rules
            </CommandItem>
            <CommandItem
              onSelect={run(() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark"),
              )}
            >
              <Moon /> Toggle dark mode
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Filter">
            {STATUSES.map((st, i) => (
              <CommandItem key={st} value={`filter ${STATUS_LABEL[st]}`} onSelect={run(() => on.onStatus(st))}>
                {st === "junk" ? <Trash2 /> : st === "attention" ? <Zap /> : st === "otp" ? <KeyRound /> : <Inbox />} {STATUS_LABEL[st]}
                <CommandShortcut>{i + 1}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Category">
            <CommandItem value="category everything" onSelect={run(() => on.onCollection("all"))}>
              <Inbox /> Everything
            </CommandItem>
            {state.categories.map((c) => (
              <CommandItem key={c.id} value={`category ${c.name}`} onSelect={run(() => on.onCollection(c.id))}>
                <span className="grid size-4 place-items-center">
                  <span className="size-2 rounded-full" style={{ background: c.color }} />
                </span>
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="View">
            {(["list", "cards", "senders"] as const).map((l) => (
              <CommandItem key={l} value={`view ${l}`} onSelect={run(() => on.onLayout(l))}>
                {l === "senders" ? <Users /> : <Inbox />} View as {l}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
