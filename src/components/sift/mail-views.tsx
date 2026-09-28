"use client";

import { useEffect, useMemo, useRef } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Paperclip, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { senderAddress, senderName } from "@/lib/policy";
import { JUNK_KIND_LABELS, type Category, type ClientState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SenderLogo, SenderTile } from "./avatar";
import { ago, listDate, type Row, type SenderGroup } from "./model";
import type { LastSweep } from "./use-sift";

type Common = {
  rows: Row[];
  categories: Category[];
  selectedId: string | null;
  leaving: Set<string>;
  onSelect: (id: string) => void;
};

function useCatMap(categories: Category[]) {
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
}

function junkTag(e: Row) {
  if (!e.sweepable) return null;
  const a = e.analysis;
  return a && a.junkKind !== "not_junk" ? `${JUNK_KIND_LABELS[a.junkKind].toLowerCase()} ${Math.round(e.junkScore * 100)}%` : "gmail spam";
}

/** Keeps the keyboard-selected item on screen. */
function useScrollIntoView<T extends HTMLElement>(selected: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return ref;
}

/* ── List ─────────────────────────────────────────────────────────────── */

export function ListView({ rows, categories, selectedId, leaving, onSelect }: Common) {
  const cats = useCatMap(categories);
  return (
    <ul role="listbox" aria-label="Emails">
      {rows.map((e) => (
        <ListRow
          key={e.id}
          e={e}
          cat={e.analysis?.category ? cats.get(e.analysis.category) : undefined}
          selected={selectedId === e.id}
          leaving={leaving.has(e.id)}
          onSelect={() => onSelect(e.id)}
        />
      ))}
    </ul>
  );
}

function ListRow({ e, cat, selected, leaving, onSelect }: { e: Row; cat?: Category; selected: boolean; leaving: boolean; onSelect: () => void }) {
  const ref = useScrollIntoView<HTMLLIElement>(selected);
  const unread = e.labelIds.includes("UNREAD");
  const junk = junkTag(e);
  return (
    <li ref={ref} className={cn(leaving && "row-leaving")}>
      <button
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 border-b px-3 text-left transition-colors max-md:py-2 md:h-10",
          selected ? "bg-selected" : "hover:bg-muted/50",
        )}
      >
        <SenderTile from={e.from} />
        {/* Phones stack sender over subject; wider screens keep one scannable line. */}
        <span className="flex min-w-0 flex-1 max-md:flex-col md:items-center md:gap-3">
          <span className={cn("truncate md:w-44 md:shrink-0", unread ? "font-semibold text-foreground" : "text-foreground/70")}>
            {senderName(e.from)}
            {e.threadSize && <ThreadCount n={e.threadSize} />}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className={unread ? "text-foreground" : "text-foreground/75"}>{e.subject}</span>
            <span className="text-muted-foreground max-lg:hidden"> — {e.preview}</span>
          </span>
        </span>
        {e.hasAttachment && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" />}
        {junk ? (
          <span className="shrink-0 rounded-sm bg-sweep/12 px-1.5 text-[11px] leading-5 text-sweep max-sm:hidden">{junk}</span>
        ) : cat ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground max-sm:hidden">
            <span className="size-1.5 rounded-full" style={{ background: cat.color }} />
            {cat.name.toLowerCase()}
          </span>
        ) : null}
        <span className="w-14 shrink-0 text-right whitespace-nowrap text-muted-foreground tabular-nums">{listDate(e.date)}</span>
      </button>
    </li>
  );
}

/* ── Cards (masonry) ──────────────────────────────────────────────────── */

/** Plain row-major grid: newest top-left, reading left→right then down, the order J/K walks. */
export function CardsView({ rows, categories, selectedId, leaving, onSelect }: Common) {
  const cats = useCatMap(categories);
  return (
    // Cards stretch to their row's height (footer pinned to the bottom), so rows line up without gaps.
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3 p-3" role="listbox" aria-label="Emails">
      {rows.map((e) => (
        <MailCard
          key={e.id}
          e={e}
          cat={e.analysis?.category ? cats.get(e.analysis.category) : undefined}
          selected={selectedId === e.id}
          leaving={leaving.has(e.id)}
          onSelect={() => onSelect(e.id)}
        />
      ))}
    </div>
  );
}

function ThreadCount({ n }: { n: number }) {
  return (
    <span className="ml-1.5 font-normal text-muted-foreground tabular-nums" aria-label={`${n} messages`}>
      {n}
    </span>
  );
}

function MailCard({ e, cat, selected, leaving, onSelect }: { e: Row; cat?: Category; selected: boolean; leaving: boolean; onSelect: () => void }) {
  const ref = useScrollIntoView<HTMLButtonElement>(selected);
  const unread = e.labelIds.includes("UNREAD");
  const junk = junkTag(e);
  const domain = senderAddress(e.from).split("@")[1] ?? senderAddress(e.from);
  // Emails have no images, so categorised mail gets a textured "cover" in its category's colour, titled with the sender.
  const cover = cat && !junk ? cat : null;

  return (
    <button
      ref={ref}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-md border bg-card text-left transition-colors",
        selected ? "border-foreground/40 ring-1 ring-foreground/20" : "hover:border-foreground/20",
        leaving && "row-leaving",
      )}
    >
      {cover && (
        <div
          className="flex h-20 shrink-0 items-end gap-2 border-b bg-[url(/cover.png)] bg-cover bg-center bg-blend-screen p-3"
          style={{ backgroundColor: `color-mix(in oklch, ${cover.color} 30%, #0a0a0a)` }}
        >
          <SenderLogo from={e.from} className="size-7 rounded-sm shadow-sm" />
          <span
            className="line-clamp-2 min-w-0 text-lg leading-tight font-semibold tracking-tight"
            style={{ color: `color-mix(in oklch, ${cover.color} 22%, #f4f4f0)` }}
          >
            {senderName(e.from)}
          </span>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <p className={cn("line-clamp-2 leading-snug", unread ? "font-semibold text-foreground" : "text-foreground/85")}>{e.subject}</p>
        {e.preview && <p className="line-clamp-3 break-words text-muted-foreground">{e.preview}</p>}
        {junk && <span className="self-start rounded-sm bg-sweep/12 px-1.5 text-[11px] leading-5 text-sweep">{junk}</span>}
        <p className="mt-auto flex min-w-0 items-center gap-1.5 pt-1 text-muted-foreground">
          <span className="min-w-0 truncate">by {cover ? domain : senderName(e.from)}</span>
          <span className="shrink-0 whitespace-nowrap">· {ago(e.date)}</span>
          {(e.threadSize || e.hasAttachment) && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {e.threadSize && (
                <span className="rounded-sm bg-muted px-1 text-[11px] leading-4 text-foreground/80 tabular-nums" aria-label={`${e.threadSize} messages`}>
                  {e.threadSize}
                </span>
              )}
              {e.hasAttachment && <Paperclip className="size-3.5" aria-label="Has attachments" />}
            </span>
          )}
        </p>
      </div>
    </button>
  );
}

/* ── Senders ──────────────────────────────────────────────────────────── */

export function SendersView({
  groups,
  selected,
  protectedSenders,
  onSelect,
}: {
  groups: SenderGroup[];
  selected: string | null;
  protectedSenders: string[];
  onSelect: (addr: string) => void;
}) {
  const max = groups[0]?.emails.length ?? 1;
  return (
    <ul role="listbox" aria-label="Senders">
      {groups.map((g) => {
        const junkPct = Math.round((g.junk / g.emails.length) * 100);
        return (
          <li key={g.addr}>
            <button
              role="option"
              aria-selected={selected === g.addr}
              onClick={() => onSelect(g.addr)}
              className={cn("flex h-10 w-full items-center gap-3 border-b px-3 text-left", selected === g.addr ? "bg-selected" : "hover:bg-muted/50")}
            >
              <SenderTile from={g.emails[0].from} />
              <span className="w-44 shrink-0 truncate max-md:w-28">{g.name}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground max-md:hidden">{g.addr}</span>
              {protectedSenders.includes(g.addr) && <span className="text-[11px] text-emerald-500">kept</span>}
              <span className="h-1 w-24 overflow-hidden rounded-full bg-muted max-sm:hidden">
                <span className="block h-full origin-left bg-foreground/60" style={{ transform: `scaleX(${g.emails.length / max})` }} />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums">{g.emails.length}</span>
              <span className={cn("w-16 shrink-0 text-right tabular-nums", junkPct >= 50 ? "text-sweep" : "text-muted-foreground")}>{junkPct}% junk</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Pages ────────────────────────────────────────────────────────────── */

/** "51–100 of 812" with previous / next. Hidden when everything fits on one page. */
export function Pager({
  page,
  pageCount,
  total,
  size,
  noun,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  size: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  if (pageCount < 2) return null;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <nav aria-label="Pages" className="flex h-10 items-center gap-2 border-b px-3 text-muted-foreground">
      <span className="tabular-nums" aria-live="polite">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      <span className="ml-auto tabular-nums">
        {page + 1} / {pageCount}
      </span>
      <Button variant="ghost" size="icon-xs" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>
        <ChevronLeft />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
        <ChevronRight />
      </Button>
    </nav>
  );
}

/* ── Empty states ─────────────────────────────────────────────────────── */

export function EmptyView({
  state,
  justSwept,
  searching,
  busy,
  onSync,
  onUndo,
  onReset,
}: {
  state: ClientState;
  justSwept: LastSweep;
  searching: boolean;
  busy: string | null;
  onSync: () => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  if (!state.lastSyncAt) {
    return (
      <Empty title="no mail yet" body="Sorta pulls your latest Gmail through Composio, then Jev reads each email to spot junk and sort the rest.">
        <Button onClick={onSync}>
          <RefreshCw /> sync gmail
        </Button>
      </Empty>
    );
  }
  if (justSwept) {
    return (
      <div className="rise-in flex flex-col items-center pt-20 text-center">
        <CheckCircle2 className="size-6 text-emerald-500" />
        <p className="mt-3 text-4xl font-semibold tabular-nums">
          <NumberTicker value={justSwept.count} />
        </p>
        <p className="text-muted-foreground">junk emails swept to trash · {state.stats.totalSwept.toLocaleString()} all time</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" size="sm" onClick={onUndo} disabled={!!busy}>
            <Undo2 /> undo
          </Button>
          <Button size="sm" onClick={onReset}>
            back to inbox
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Empty title={searching ? "no matches" : "nothing here"} body={searching ? "Try describing it differently, or press ↵ to ask Jev." : "No emails match both filters."}>
      <Button variant="outline" size="sm" onClick={onReset}>
        clear filters
      </Button>
    </Empty>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 pt-20 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-pretty text-muted-foreground">{body}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
