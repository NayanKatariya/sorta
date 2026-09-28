"use client";

import { Loader2, Moon, PanelLeft, RefreshCw, Search, Sparkles, Sun, Trash2, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import type { ClientState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ago, STATUSES, STATUS_LABEL, type Layout, type Status } from "./model";
import type { SyncProgress } from "./use-sift";

type HeaderProps = {
  title: string;
  state: ClientState;
  progress: SyncProgress;
  busy: string | null;
  sweepCount: number;
  query: string;
  jevQuery: string | null;
  searchRef: React.RefObject<HTMLInputElement | null>;
  headerActions?: React.ReactNode;
  onQuery: (q: string) => void;
  onAskJev: () => void;
  onClearJev: () => void;
  onSync: () => void;
  onSweep: () => void;
  onToggleSidebar: () => void;
};

export function Header({ searchRef, ...p }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const asking = p.busy === "search";
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b pr-2 pl-1">
      <Button variant="ghost" size="icon-sm" onClick={p.onToggleSidebar} aria-label="Toggle categories" className="text-muted-foreground">
        <PanelLeft />
      </Button>
      <h1 className="max-w-48 shrink-0 truncate font-medium">{p.title}</h1>
      {p.headerActions}

      <form
        className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-muted-foreground focus-within:bg-muted/60 focus-within:text-foreground"
        onSubmit={(e) => {
          e.preventDefault();
          p.onAskJev();
        }}
      >
        {p.jevQuery ? <Sparkles className="size-3.5 shrink-0 text-foreground" /> : <Search className="size-3.5 shrink-0" />}
        <input
          ref={searchRef}
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              p.onClearJev();
              e.currentTarget.blur();
            }
          }}
          name="q"
          autoComplete="off"
          spellCheck={false}
          aria-label="Filter emails, or press Enter to ask Jev"
          placeholder="filter…  ↵ ask jev"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-[13px]"
        />
        {asking && <Loader2 className="size-3.5 animate-spin" />}
        {p.jevQuery && !asking && (
          <button type="button" onClick={p.onClearJev} aria-label="Clear Jev search" className="hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </form>

      <span className="shrink-0 text-muted-foreground max-md:hidden" aria-live="polite">
        {p.progress ? (
          <span className="flex items-center gap-1.5 text-foreground">
            <Loader2 className="size-3 animate-spin" />
            {p.progress.stage === "analyze" && p.progress.total ? `jev reading ${p.progress.done ?? 0}/${p.progress.total}` : "fetching…"}
          </span>
        ) : p.state.lastSyncAt ? (
          `synced ${ago(p.state.lastSyncAt)}`
        ) : (
          "never synced"
        )}
      </span>
      <Button variant="ghost" size="sm" onClick={p.onSync} disabled={!!p.progress} className="text-muted-foreground">
        <RefreshCw /> <span className="max-sm:hidden">sync</span>
      </Button>
      {p.sweepCount > 0 && (
        <Button
          size="sm"
          onClick={p.onSweep}
          disabled={!!p.busy}
          className="bg-sweep text-sweep-foreground hover:bg-sweep/90"
          aria-label={`Sweep ${p.sweepCount} junk emails to Trash`}
        >
          {p.busy === "sweep" ? <Loader2 className="animate-spin" /> : <Trash2 />}
          sweep {p.sweepCount}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle theme"
        className="text-muted-foreground max-sm:hidden"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Sun className="hidden dark:block" />
        <Moon className="dark:hidden" />
      </Button>
    </div>
  );
}

export function Tabs({
  status,
  counts,
  layout,
  onStatus,
  onLayout,
}: {
  status: Status;
  counts: Record<Status, number>;
  layout: Layout;
  onStatus: (s: Status) => void;
  onLayout: (l: Layout) => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-4 border-b px-3">
      <div role="tablist" aria-label="Filter by state" className="scroll-thin flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
        {STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            onClick={() => onStatus(s)}
            className={cn(
              "flex shrink-0 items-baseline gap-1 whitespace-nowrap transition-colors",
              status === s ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {STATUS_LABEL[s]}
            <sup className={cn("text-[10px] font-normal tabular-nums", s === "junk" && counts.junk ? "text-sweep" : "text-muted-foreground")}>
              {counts[s]}
            </sup>
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
        <span className="max-sm:hidden">View:</span>
        {(["list", "cards", "senders"] as const).map((l) => (
          <button
            key={l}
            onClick={() => onLayout(l)}
            aria-pressed={layout === l}
            className={cn("rounded-sm px-1.5 capitalize", layout === l ? "bg-muted text-foreground" : "hover:text-foreground")}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StatusBar({ onCommand, onToggleSidebar, onNewCategory, onRules }: { onCommand: () => void; onToggleSidebar: () => void; onNewCategory: () => void; onRules: () => void }) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t px-2 text-muted-foreground max-md:hidden">
      <Hint k="⌘K" label="Search" onClick={onCommand} />
      <Hint k="⌘\" label="Hide sidebar" onClick={onToggleSidebar} />
      <Hint k="⇧N" label="New category" onClick={onNewCategory} />
      <span className="ml-auto" />
      <Hint k="1–7" label="Filter" />
      <Hint k="⌥↕" label="Switch category" />
      <Hint k="J K" label="Navigate" />
      <Hint k="E" label="Trash" />
      <Hint k="U" label="Read" />
      <Hint k="V" label="View" />
      <Hint k="," label="Rules" onClick={onRules} />
    </footer>
  );
}

function Hint({ k, label, onClick }: { k: string; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <kbd className="rounded-[3px] border bg-muted px-1 text-[11px] leading-4 text-foreground/80">{k}</kbd>
      <span>{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex items-center gap-1.5 whitespace-nowrap hover:text-foreground">
      {inner}
    </button>
  ) : (
    <span className="flex items-center gap-1.5 whitespace-nowrap max-xl:hidden">{inner}</span>
  );
}
