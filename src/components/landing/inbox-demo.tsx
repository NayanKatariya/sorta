import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";
import { CATEGORIES, INBOX, catColor } from "./demo-data";

/**
 * A small copy of the app on made-up mail. It doesn't animate by itself: the hero drives it from the
 * scroll position, so Jev labels `read` rows, then sweep sends the junk to Trash and the toast offers undo.
 */

export type InboxPhase = "idle" | "reading" | "sorted" | "sweeping" | "swept";

const TABS = ["all", "inbox", "needs you", "unread", "junk", "spam"];
const JUNK = INBOX.filter((r) => r.junk).length;

export function InboxDemo({ read, phase }: { read: number; phase: InboxPhase }) {
  const gone = phase === "sweeping" || phase === "swept";
  const labelled = INBOX.slice(0, read);
  const count = (name: string) => labelled.filter((r) => r.label === name).length;
  const junkLeft = gone ? 0 : labelled.filter((r) => r.junk).length;

  return (
    <div
      aria-label="Preview of the Sorta inbox being sorted"
      role="img"
      className="overflow-hidden rounded-lg border bg-card text-[12px] shadow-[0_30px_80px_-20px_oklch(0_0_0/0.5)] select-none"
    >
      {/* Title bar */}
      <div className="flex h-10 items-center gap-3 border-b px-3">
        <span className="flex items-center gap-1.5 font-semibold">
          <Logo className="size-3.5" />
          sorta
        </span>
        <nav className="flex min-w-0 items-center gap-1 overflow-hidden text-muted-foreground max-sm:hidden">
          {TABS.map((t, i) => (
            <span key={t} className={cn("rounded-sm px-1.5 py-0.5 whitespace-nowrap", i === 1 && "bg-selected text-foreground")}>
              {t}
            </span>
          ))}
        </nav>
        <span
          className={cn(
            "ml-auto flex h-6 items-center gap-1.5 rounded-sm px-2 tabular-nums transition-[background-color,color,box-shadow] duration-300",
            junkLeft ? "bg-sweep text-sweep-foreground" : "bg-muted text-muted-foreground",
            phase === "sorted" && "animate-pulse-ring",
          )}
        >
          sweep {junkLeft}
        </span>
      </div>

      <div className="grid md:grid-cols-[168px_1fr]">
        {/* Category column */}
        <aside className="space-y-0.5 border-r p-2 max-md:hidden">
          <p className="px-2 pt-1 pb-2 text-[11px] tracking-wider text-muted-foreground uppercase">categories</p>
          <SideRow name="Everything" n={gone ? INBOX.length - JUNK : INBOX.length} active />
          {CATEGORIES.map((c) => (
            <SideRow key={c.name} name={c.name} n={count(c.name)} color={catColor(c.hue)} />
          ))}
          <SideRow name="Uncategorized" n={INBOX.length - read} />
        </aside>

        {/* Mail list */}
        {/* Fixed height: swept rows collapse without moving the page below. */}
        <ul className="h-90 min-w-0">
          {INBOX.map((row, i) => {
            const isRead = i < read;
            const active = phase === "reading" && i === read;
            const leaving = gone && row.junk;
            return (
              <li
                key={row.id}
                className={cn(
                  "grid transition-[grid-template-rows,opacity,translate] duration-400 ease-(--ease-out)",
                  leaving ? "translate-x-4 grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div
                    className={cn(
                      "flex h-10 items-center gap-3 border-b px-3 transition-colors duration-200",
                      active && "bg-selected",
                      isRead && row.junk && !gone && "bg-sweep/[0.06]",
                    )}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", row.unread ? "bg-foreground" : "bg-transparent")} />
                    <span className={cn("w-32 shrink-0 truncate max-sm:hidden", row.unread ? "font-semibold" : "text-foreground/70")}>{row.from}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className={row.unread ? "text-foreground" : "text-foreground/75"}>{row.subject}</span>
                      <span className="text-muted-foreground max-lg:hidden"> — {row.preview}</span>
                    </span>
                    <Label row={row} shown={isRead} />
                    <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums max-sm:hidden">{row.time}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Status line, like a terminal's */}
      <div className="flex h-8 items-center gap-2 border-t px-3 text-muted-foreground" aria-live="off">
        <span className={cn("size-1.5 rounded-full", phase === "reading" ? "animate-pulse bg-foreground" : "bg-emerald-500")} />
        <span className="truncate">
          {phase === "idle" && "9 new emails"}
          {phase === "reading" && `jev reading ${Math.min(read + 1, INBOX.length)}/${INBOX.length}…`}
          {phase === "sorted" && `sorted ${INBOX.length - JUNK} into categories · ${JUNK} junk found`}
          {gone && `moved ${JUNK} to Trash`}
        </span>
        <span
          className={cn(
            "ml-auto flex items-center gap-2 rounded-sm border bg-background px-2 py-0.5 text-foreground transition-[opacity,translate] duration-300",
            phase === "swept" ? "opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          Swept {JUNK} emails <span className="underline underline-offset-2">Undo</span>
        </span>
      </div>
    </div>
  );
}

function SideRow({ name, n, color, active }: { name: string; n: number; color?: string; active?: boolean }) {
  return (
    <div className={cn("flex h-7 items-center gap-2 rounded-sm px-2", active ? "bg-selected text-foreground" : "text-foreground/75")}>
      {color && <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="flex-1 truncate">{name}</span>
      <span className="text-muted-foreground tabular-nums">{n}</span>
    </div>
  );
}

function Label({ row, shown }: { row: (typeof INBOX)[number]; shown: boolean }) {
  const cat = CATEGORIES.find((c) => c.name === row.label);
  return (
    <span
      className={cn(
        "shrink-0 transition-[opacity,translate,filter] duration-300 ease-(--ease-out)",
        shown ? "opacity-100" : "translate-x-1 opacity-0 blur-[2px]",
      )}
    >
      {row.junk ? (
        <span className="rounded-sm bg-sweep/12 px-1.5 text-[11px] leading-5 text-sweep">{row.label}</span>
      ) : (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full" style={{ background: cat && catColor(cat.hue) }} />
          {row.label}
        </span>
      )}
    </span>
  );
}
