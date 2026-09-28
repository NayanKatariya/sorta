"use client";

import { useState } from "react";
import { Star, Undo2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { SWEEP_KINDS } from "./demo-data";

/**
 * The sweep rules, working on made-up numbers: pick the kinds, drag how sure Jev must be,
 * and the count updates at once (the real app does the same from stored probabilities).
 */
export function SweepDemo() {
  const [on, setOn] = useState(() => new Set(SWEEP_KINDS.filter((k) => k.on).map((k) => k.key)));
  const [threshold, setThreshold] = useState(80);
  const [swept, setSwept] = useState<number | null>(null);

  const above = (probs: number[]) => probs.filter((p) => p * 100 >= threshold).length;
  const total = SWEEP_KINDS.reduce((n, k) => n + (on.has(k.key) ? above(k.probs) : 0), 0);

  const toggle = (key: string, checked: boolean) => {
    setSwept(null);
    setOn((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-10 items-center border-b px-4">
        <p className="text-[11px] tracking-wider text-muted-foreground uppercase">sweep rules</p>
        <span className="ml-auto text-[11px] text-muted-foreground">try it</span>
      </div>
      <ul className="divide-y">
        {SWEEP_KINDS.map((k) => {
          const n = above(k.probs);
          return (
            <li key={k.key}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                <Checkbox checked={on.has(k.key)} onCheckedChange={(v) => toggle(k.key, Boolean(v))} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{k.label}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{k.hint}</span>
                </span>
                <span className={cn("tabular-nums", on.has(k.key) ? "text-sweep" : "text-muted-foreground line-through decoration-muted-foreground/50")}>{n}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="space-y-3 border-t px-4 py-4">
        <div className="flex items-center justify-between">
          <span>How sure Jev must be</span>
          <span className="text-muted-foreground tabular-nums">{threshold}%</span>
        </div>
        <Slider
          min={50}
          max={95}
          step={5}
          value={[threshold]}
          onValueChange={(v) => {
            setSwept(null);
            setThreshold(Array.isArray(v) ? v[0] : v);
          }}
          aria-label="How sure Jev must be"
        />
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Star className="size-3" aria-hidden /> Starred mail and protected senders are never swept.
        </p>
      </div>
      <div className="flex items-center gap-3 border-t bg-background/40 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-muted-foreground" aria-live="polite">
          {swept === null ? `${total} emails match your rules` : `Moved ${swept} to Trash.`}
        </span>
        {swept === null ? (
          <button
            type="button"
            data-slot="button"
            disabled={total === 0}
            onClick={() => setSwept(total)}
            className="h-8 rounded-md bg-sweep px-3 font-medium text-sweep-foreground tabular-nums hover:bg-sweep/90 disabled:opacity-50"
          >
            sweep {total}
          </button>
        ) : (
          <button type="button" data-slot="button" onClick={() => setSwept(null)} className="flex h-8 items-center gap-1.5 rounded-md border px-3 hover:bg-muted">
            <Undo2 className="size-3.5" aria-hidden /> Undo
          </button>
        )}
      </div>
    </div>
  );
}
