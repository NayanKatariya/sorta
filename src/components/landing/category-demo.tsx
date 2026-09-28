"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CATEGORY_EXAMPLES, catColor } from "./demo-data";

/** A category being described in plain words, then Jev filing matching mail into it. Cycles through examples. */
export function CategoryDemo() {
  const [ex, setEx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const example = CATEGORY_EXAMPLES[ex];

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const play = (i: number) => {
      const { description, matches } = CATEGORY_EXAMPLES[i];
      setEx(i);
      setTyped(0);
      setShown(0);
      for (let c = 1; c <= description.length; c++) at(400 + c * 45, () => setTyped(c));
      const typedAt = 400 + description.length * 45;
      matches.forEach((_, m) => at(typedAt + 700 + m * 260, () => setShown(m + 1)));
      at(typedAt + 700 + matches.length * 260 + 2600, () => play((i + 1) % CATEGORY_EXAMPLES.length));
    };
    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    const io = new IntersectionObserver(([entry]) => {
      stop();
      if (still) {
        setTyped(CATEGORY_EXAMPLES[0].description.length);
        setShown(4);
      } else if (entry.isIntersecting) play(0);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      stop();
    };
  }, []);

  const doneTyping = typed >= example.description.length;

  return (
    <div ref={ref} role="img" aria-label={`Example: a category named ${example.name}, described as “${example.description}”`} className="overflow-hidden rounded-lg border bg-card select-none">
      <div className="space-y-3 border-b p-4">
        <p className="text-[11px] tracking-wider text-muted-foreground uppercase">new category</p>
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
          <span className="size-2 rounded-full" style={{ background: catColor(example.hue) }} />
          <span className="font-semibold">{example.name}</span>
        </div>
        <div className="min-h-9 rounded-md border bg-background px-3 py-2 text-foreground/85">
          {example.description.slice(0, typed)}
          <span className={cn("ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-foreground/70", doneTyping && "animate-caret")} />
        </div>
      </div>
      <div className="flex h-8 items-center gap-2 border-b px-4 text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", doneTyping && shown < 4 ? "animate-pulse bg-foreground" : shown >= 4 ? "bg-emerald-500" : "bg-muted-foreground/40")} />
        {!doneTyping ? "describe it in a sentence" : shown < 4 ? "jev re-sorting your inbox…" : `${example.matches.length} filed · p = how sure Jev is`}
      </div>
      <ul>
        {example.matches.map((m, i) => (
          <li
            key={`${ex}-${m.subject}`}
            className={cn(
              "flex h-10 items-center gap-3 border-b px-4 transition-[opacity,translate] duration-300 ease-(--ease-out) last:border-b-0",
              i < shown ? "opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="w-28 shrink-0 truncate text-foreground/70 sm:w-32">{m.from}</span>
            <span className="min-w-0 flex-1 truncate">{m.subject}</span>
            <span className="flex w-16 shrink-0 items-center justify-end gap-1.5 text-muted-foreground tabular-nums">
              <span className="h-1 w-6 overflow-hidden rounded-full bg-muted">
                <span className="block h-full origin-left" style={{ background: catColor(example.hue), transform: `scaleX(${m.p})` }} />
              </span>
              {m.p.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
