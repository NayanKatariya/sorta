"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES, catColor } from "./demo-data";

/**
 * What Sorta actually sends Jev (see lib/jev.ts): one request per email, carrying the sender, subject and
 * preview as state plus four typed questions. Jev answers each with probabilities, never text.
 * This plays that exchange on made-up mail: state in → questions lit one by one → answers → filed or swept.
 */

type Bar = [label: string, p: number];
type Example = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  folder: "Inbox" | "Spam";
  junk: Bar[];
  category: Bar[];
  priority: 0 | 1 | 2 | 3;
  reply: number;
  outcome: { kind: "filed"; category: string; extra: string[] } | { kind: "swept"; reason: string };
};

const EXAMPLES: Example[] = [
  {
    id: "interview",
    from: "Priya Shah <priya@stripe.com>",
    subject: "Interview loop for Thursday",
    preview: "Can you do 2pm with the platform team? Let me know by tomorrow.",
    folder: "Inbox",
    junk: [["not_junk", 0.96], ["promotion", 0.02], ["spam", 0.01]],
    category: [["Job hunt", 0.95], ["none", 0.03], ["Travel", 0.01]],
    priority: 2,
    reply: 0.91,
    outcome: { kind: "filed", category: "Job hunt", extra: ["needs you", "reply expected"] },
  },
  {
    id: "phish",
    from: "PayPaI Support <security@paypa1-help.co>",
    subject: "Verify your acc0unt within 24h",
    preview: "Unusual sign-in detected. Confirm your card details to avoid suspension.",
    folder: "Inbox",
    junk: [["scam_or_phishing", 0.97], ["spam", 0.02], ["not_junk", 0.01]],
    category: [["none", 0.88], ["Money", 0.09], ["Job hunt", 0.02]],
    priority: 0,
    reply: 0.04,
    outcome: { kind: "swept", reason: "Scam / phishing" },
  },
  {
    id: "statement",
    from: "HDFC Bank <alerts@hdfcbank.net>",
    subject: "Your statement for September",
    preview: "The statement for your account ending 4417 is ready to download.",
    folder: "Inbox",
    junk: [["not_junk", 0.98], ["promotion", 0.01], ["newsletter", 0.01]],
    category: [["Money", 0.98], ["none", 0.01], ["Travel", 0.01]],
    priority: 1,
    reply: 0.02,
    outcome: { kind: "filed", category: "Money", extra: ["worth a glance"] },
  },
  {
    id: "promo",
    from: "Uber Eats <offers@uber.com>",
    subject: "40% off your next 3 orders",
    preview: "Only this weekend. Tap to claim before it's gone.",
    folder: "Inbox",
    junk: [["promotion", 0.93], ["spam", 0.04], ["not_junk", 0.03]],
    category: [["none", 0.9], ["Travel", 0.06], ["Money", 0.03]],
    priority: 0,
    reply: 0.01,
    outcome: { kind: "swept", reason: "Promotions" },
  },
];

const QUESTIONS = [
  { key: "junk", type: "choice", ask: "Which kind of email is this?", options: "6 kinds" },
  { key: "category", type: "choice", ask: "Which of your categories fits?", options: "yours · none" },
  { key: "priority", type: "score", ask: "How much does it need you?", options: "0 – 3" },
  { key: "reply", type: "noul", ask: "Is a person waiting on a reply?", options: "yes / no" },
] as const;

const PRIORITY = ["no attention", "worth a glance", "needs you soon", "urgent"];

/** Stage timeline for one email: 0 arrives, 1 sent to Jev, 2–5 questions answered in turn, 6 filed. */
const STAGE_AT = [0, 700, 1300, 1800, 2300, 2800, 3500];
const HOLD = 6800;
const DONE = 6;

const ease = [0.23, 1, 0.32, 1] as const;

export function JevDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const still = useReducedMotion();
  const [i, setI] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (still || !inView) return;
    const timers = STAGE_AT.map((ms, s) => window.setTimeout(() => setStage(s), ms));
    timers.push(
      window.setTimeout(() => {
        setStage(0);
        setI((n) => (n + 1) % EXAMPLES.length);
      }, HOLD),
    );
    return () => timers.forEach(clearTimeout);
  }, [i, inView, still]);

  const s = still ? DONE : stage;
  const ex = EXAMPLES[i];

  return (
    <div ref={ref} className="grid gap-3 lg:grid-cols-[1fr_28px_1fr_28px_1.15fr] lg:gap-0">
      {/* 1 · state */}
      <Panel label="state" hint="what Jev sees">
        <AnimatePresence mode="wait" initial={false}>
          <motion.pre
            key={ex.id}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease }}
            className="overflow-hidden text-[12px] leading-6 whitespace-pre-wrap"
          >
            <span className="text-muted-foreground">{"email: {"}</span>
            {"\n"}
            <Field k="from" v={ex.from} />
            <Field k="subject" v={ex.subject} />
            <Field k="preview" v={ex.preview} />
            <Field k="gmail_folder" v={ex.folder} />
            <span className="text-muted-foreground">{"}"}</span>
          </motion.pre>
        </AnimatePresence>
        <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">Only these fields. Not the whole body, not attachments.</p>
      </Panel>

      <Wire active={s === 1} />

      {/* 2 · Jev + questions */}
      <Panel
        label={
          <span className="flex items-center gap-2">
            <motion.span
              className="size-1.5 rounded-full bg-foreground"
              animate={s >= 1 && s < DONE && !still ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
              transition={{ duration: 0.8, repeat: s >= 1 && s < DONE ? Infinity : 0 }}
            />
            jev
          </span>
        }
        hint="one request, four questions"
      >
        <ul className="space-y-1.5">
          {QUESTIONS.map((q, n) => {
            const done = s >= n + 2;
            const active = s === n + 1 && s >= 1;
            return (
              <li
                key={q.key}
                className={cn(
                  "relative overflow-hidden rounded-md border px-3 py-2 transition-colors duration-300",
                  done ? "border-border bg-background/60" : active ? "border-foreground/30 bg-selected" : "border-dashed text-muted-foreground",
                )}
              >
                {active && !still && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
                    initial={{ left: "-35%" }}
                    animate={{ left: "105%" }}
                    transition={{ duration: 0.5, ease: "linear", repeat: Infinity }}
                  />
                )}
                <div className="relative flex items-center gap-2">
                  <span className="font-semibold">{q.key}</span>
                  <span className="rounded-sm bg-muted px-1 text-[10px] leading-4 text-muted-foreground">{q.type}</span>
                  <span className="ml-auto text-[11px] whitespace-nowrap text-muted-foreground">{q.options}</span>
                  <AnimatePresence>
                    {done && (
                      <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
                        <Check className="size-3.5 text-emerald-500" aria-hidden />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <p className="relative mt-0.5 truncate text-[12px] text-muted-foreground">{q.ask}</p>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Wire active={s >= 2 && s < DONE} />

      {/* 3 · answers */}
      <Panel label="answers" hint="probabilities, not text">
        <div className="space-y-3" key={ex.id}>
          <Answer show={s >= 2} title="junk" type="choice">
            <Bars bars={ex.junk} show={s >= 2} tone={ex.junk[0][0] === "not_junk" ? "ok" : "junk"} />
          </Answer>
          <Answer show={s >= 3} title="category" type="choice">
            <Bars bars={ex.category} show={s >= 3} tone="cat" />
          </Answer>
          <div className="grid grid-cols-2 gap-3">
            <Answer show={s >= 4} title="priority" type="score">
              <div className="flex gap-1 pt-1">
                {[0, 1, 2, 3].map((n) => (
                  <motion.span
                    key={n}
                    className="h-2 flex-1 rounded-[2px] bg-muted"
                    animate={{ backgroundColor: s >= 4 && n <= ex.priority && ex.priority > 0 ? "var(--foreground)" : "var(--muted)" }}
                    transition={{ delay: s >= 4 ? n * 0.08 : 0, duration: 0.2 }}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {s >= 4 ? (
                  <>
                    <span className="text-foreground tabular-nums">{ex.priority}</span> · {PRIORITY[ex.priority]}
                  </>
                ) : (
                  "–"
                )}
              </p>
            </Answer>
            <Answer show={s >= 5} title="reply" type="noul">
              <div className="h-2 overflow-hidden rounded-[2px] bg-muted">
                <motion.span
                  className="block h-full origin-left bg-foreground"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: s >= 5 ? ex.reply : 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {s >= 5 ? (
                  <>
                    <span className="text-foreground tabular-nums">{ex.reply.toFixed(2)}</span> · {ex.reply > 0.5 ? "yes" : "no"}
                  </>
                ) : (
                  "–"
                )}
              </p>
            </Answer>
          </div>
        </div>
      </Panel>

      {/* Outcome, spanning the row */}
      <div className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-4 py-2 lg:col-span-5 lg:mt-3">
        <span className="text-[11px] tracking-wider text-muted-foreground uppercase">sorta</span>
        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
        <AnimatePresence mode="wait">
          {s >= DONE ? (
            <motion.span
              key={ex.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.3, ease }}
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              {ex.outcome.kind === "filed" ? (
                <>
                  <span>filed in</span>
                  <CategoryChip name={ex.outcome.category} />
                  {ex.outcome.extra.map((e) => (
                    <span key={e} className="rounded-sm border px-1.5 text-[11px] leading-5 text-muted-foreground">
                      {e}
                    </span>
                  ))}
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5 text-sweep" aria-hidden />
                  <span>swept to Trash</span>
                  <span className="rounded-sm bg-sweep/12 px-1.5 text-[11px] leading-5 text-sweep">{ex.outcome.reason}</span>
                  <span className="text-[11px] text-muted-foreground">undo any time</span>
                </>
              )}
            </motion.span>
          ) : (
            <motion.span key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted-foreground">
              {s === 0 ? "new email" : "waiting for Jev…"}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="ml-auto flex gap-1" aria-hidden>
          {EXAMPLES.map((e, n) => (
            <span key={e.id} className={cn("h-1 w-4 rounded-full transition-colors duration-300", n === i ? "bg-foreground" : "bg-muted")} />
          ))}
        </span>
      </div>
    </div>
  );
}

function Panel({ label, hint, children }: { label: React.ReactNode; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-card">
      <div className="flex h-9 items-center justify-between border-b px-4">
        <span className="text-[11px] tracking-wider uppercase">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <span className="block pl-4">
      <span className="text-muted-foreground">{k}: </span>
      <span className="text-foreground/90">&quot;{v}&quot;</span>
    </span>
  );
}

/** A connector between panels; a pulse runs along it while data is moving. */
function Wire({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="relative flex items-center justify-center max-lg:h-5">
      <span className="absolute bg-border max-lg:inset-y-0 max-lg:w-px lg:inset-x-0 lg:h-px" />
      {active && (
        <motion.span
          className="absolute size-1.5 rounded-full bg-foreground shadow-[0_0_8px_2px] shadow-foreground/40 max-lg:hidden"
          initial={{ left: "0%" }}
          animate={{ left: "100%" }}
          transition={{ duration: 0.55, ease: "easeInOut", repeat: Infinity }}
        />
      )}
      {active && (
        <motion.span
          className="absolute size-1.5 rounded-full bg-foreground lg:hidden"
          initial={{ top: "0%" }}
          animate={{ top: "100%" }}
          transition={{ duration: 0.55, ease: "easeInOut", repeat: Infinity }}
        />
      )}
    </div>
  );
}

function Answer({ show, title, type, children }: { show: boolean; title: string; type: string; children: React.ReactNode }) {
  return (
    <motion.div animate={{ opacity: show ? 1 : 0.3 }} transition={{ duration: 0.25 }}>
      <p className="mb-1.5 flex items-center gap-2">
        <span className="font-semibold">{title}</span>
        <span className="rounded-sm bg-muted px-1 text-[10px] leading-4 text-muted-foreground">{type}</span>
      </p>
      {children}
    </motion.div>
  );
}

function Bars({ bars, show, tone }: { bars: Bar[]; show: boolean; tone: "ok" | "junk" | "cat" }) {
  return (
    <ul className="space-y-1">
      {bars.map(([label, p], n) => {
        const cat = CATEGORIES.find((c) => c.name === label);
        const winner = n === 0;
        const fill = !winner ? "var(--muted-foreground)" : tone === "junk" ? "var(--sweep)" : tone === "cat" && cat ? catColor(cat.hue) : "var(--foreground)";
        return (
          <li key={label} className="grid grid-cols-[minmax(0,8.5rem)_1fr_2.5rem] items-center gap-2 text-[11px]">
            <span className={cn("flex items-center gap-1.5 truncate", winner ? "text-foreground" : "text-muted-foreground")}>
              {cat && <span className="size-1.5 shrink-0 rounded-full" style={{ background: catColor(cat.hue) }} />}
              {label}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.span
                className="block h-full origin-left rounded-full"
                style={{ background: fill, opacity: winner ? 1 : 0.5 }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: show ? Math.max(p, 0.015) : 0 }}
                transition={{ type: "spring", stiffness: 140, damping: 20, delay: show ? n * 0.06 : 0 }}
              />
            </span>
            <span className={cn("text-right tabular-nums", winner ? "text-foreground" : "text-muted-foreground")}>{show ? p.toFixed(2) : "–"}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryChip({ name }: { name: string }) {
  const cat = CATEGORIES.find((c) => c.name === name);
  return (
    <span className="flex items-center gap-1.5 rounded-sm border px-1.5 leading-5 font-semibold">
      <span className="size-1.5 rounded-full" style={{ background: cat && catColor(cat.hue) }} />
      {name}
    </span>
  );
}
