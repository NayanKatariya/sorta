"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { INBOX } from "./demo-data";
import { InboxDemo, type InboxPhase } from "./inbox-demo";

/**
 * The hero is a scroll track. Its inner frame sticks under the header while the page scrolls through it:
 * first the headline lifts away and the half-hidden dashboard rises and straightens, then Jev labels
 * a row per step of scroll, then sweep clears the junk. Scrolling back up plays it in reverse.
 */

// Where each beat sits along the track (0 = hero top at the top of the screen, 1 = track fully scrolled).
const RISE = [0, 0.28] as const;
const READ = [0.3, 0.68] as const;
const SWEEP = 0.78;

export function HeroScroll() {
  const track = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  // The dashboard starts low enough to be cut off by the fold (55% down), and never over the headline.
  const headBottom = useMotionValue(480);
  useEffect(() => {
    const node = head.current;
    const frame = node?.parentElement;
    if (!node || !frame) return;
    const measure = () => headBottom.set(Math.max(node.offsetTop + node.offsetHeight + 40, frame.clientHeight * 0.55));
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [headBottom]);
  const still = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: track, offset: ["start start", "end end"] });

  const [read, setRead] = useState(0);
  const [phase, setPhase] = useState<InboxPhase>("idle");

  useMotionValueEvent(p, "change", (v) => {
    const t = Math.min(1, Math.max(0, (v - READ[0]) / (READ[1] - READ[0])));
    setRead(v < READ[0] ? 0 : Math.round(t * INBOX.length));
    setPhase(v < READ[0] ? "idle" : v < READ[1] ? "reading" : v < SWEEP ? "sorted" : "swept");
  });

  // Function transforms run in JS. Plain range maps get handed to the browser's scroll timeline,
  // which left the fades stuck part-way in testing.
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const rise = () => clamp(p.get() / RISE[1]);
  const headOpacity = useTransform(() => 1 - clamp(p.get() / 0.14));
  const headY = useTransform(() => -60 * clamp(p.get() / 0.14));
  const boardY = useTransform(() => (1 - rise()) * headBottom.get() + rise() * 16);
  const rotateX = useTransform(() => (still ? 0 : 24 * (1 - rise())));
  const scale = useTransform(() => (still ? 1 : 0.9 + 0.1 * rise()));
  const fade = useTransform(() => 1 - clamp(p.get() / 0.18));
  const progress = useTransform(p, [READ[0], SWEEP], [0, 1]);

  return (
    <section ref={track} className="relative h-[300vh]" aria-label="Sorta sorting an inbox as you scroll">
      <div className="hero-grid sticky top-13 h-[calc(100dvh-3.25rem)] overflow-hidden">
        {/* Headline: short, centred, gone by the time the dashboard arrives. */}
        <motion.div ref={head} style={{ opacity: headOpacity, y: headY }} className="flex flex-col items-center px-5 pt-[9vh] text-center">
          <p className="text-[12px] tracking-wide text-muted-foreground">
            <span className="text-foreground/40">{"// "}</span>gmail triage, in plain words
          </p>
          <h1 className="mt-5 max-w-4xl text-[clamp(2.4rem,6.4vw,4.8rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
            Your inbox, sorted <span className="text-muted-foreground">in plain words.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-pretty text-muted-foreground">Jev files every email into your categories and sweeps the junk.</p>
          <p className="mt-4 flex items-center gap-2 text-[11px] tracking-widest text-muted-foreground uppercase">
            <span className="relative h-4 w-px overflow-hidden bg-border">
              <span className="scroll-cue absolute top-0 block h-1.5 w-px bg-foreground" />
            </span>
            scroll to sort
          </p>
        </motion.div>

        {/* The dashboard: starts half below the fold, tilted back; rises flat as you scroll. */}
        <div className="absolute inset-x-0 top-0 px-3 [perspective:1400px] sm:px-10 lg:px-14">
          <motion.div style={{ y: boardY, rotateX, scale, transformOrigin: "50% 0%" }} className="mx-auto max-w-5xl will-change-transform">
            <InboxDemo read={read} phase={phase} />
          </motion.div>
        </div>

        {/* Soft floor while the dashboard is half hidden. */}
        <motion.div aria-hidden style={{ opacity: fade }} className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
        {/* Thin progress rail along the bottom edge once sorting starts. */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px">
          <motion.div style={{ scaleX: progress }} className="h-full origin-left bg-foreground/50" />
        </div>
      </div>
    </section>
  );
}
