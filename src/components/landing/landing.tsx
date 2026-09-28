import Link from "next/link";
import { ArrowRight, Bell, Eye, KeyRound, Lock, MousePointerClick, Search, ShieldCheck, Undo2, Users } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { CategoryDemo } from "./category-demo";
import { HeroScroll } from "./hero-scroll";
import { JevDemo } from "./jev-demo";
import { SweepDemo } from "./sweep-demo";

const SIGN_UP = "/login?mode=signup";

/**
 * The page signed-out visitors see at `/`. Terminal-editorial like the app: one mono family,
 * hairline grid with corner ticks, colour only for meaning (category dots, red for sweep).
 */
export function Landing() {
  return (
    <div className="landing min-h-dvh overflow-x-clip bg-background text-[14px]">
      <Nav />
      <main className="mx-auto max-w-6xl border-x">
        <HeroScroll />
        <Stack />
        <How />
        <Feature
          id="categories"
          eyebrow="categories"
          title="Describe it once. Jev files the rest."
          body="A category is a name and one sentence. Jev reads every email against it and re-sorts the whole inbox right away. Edit the sentence and everything moves. Push any category to Gmail as a Sorted/ label."
          demo={<CategoryDemo />}
        />
        <Feature
          id="sweep"
          eyebrow="one-click sweep"
          title="Junk out in one click. Undo in another."
          body="Jev labels each email as scam, spam, promotion, newsletter, social ping or not junk, and says how sure it is. You choose which kinds go and how sure it must be. The count updates as you drag, without re-reading anything."
          demo={<SweepDemo />}
          flip
        />
        <Grid />
        <Keys />
        <Privacy />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

/** Small squares where grid lines cross, like registration marks. */
function Ticks() {
  const t = "absolute z-10 size-[7px] border bg-background";
  return (
    <>
      <span aria-hidden className={cn(t, "-top-[4px] -left-[4px]")} />
      <span aria-hidden className={cn(t, "-top-[4px] -right-[4px]")} />
    </>
  );
}

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("relative scroll-mt-14 border-t", className)}>
      <Ticks />
      {children}
    </section>
  );
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[12px] tracking-wide text-muted-foreground", className)}>
      <span className="text-foreground/40">{"// "}</span>
      {children}
    </p>
  );
}

function PrimaryCta({ children = "Get started" }: { children?: React.ReactNode }) {
  return (
    <Link
      href={SIGN_UP}
      data-slot="button"
      className="group inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-4 font-medium text-background hover:bg-foreground/85"
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-13 max-w-6xl items-center gap-6 border-x px-5">
        <Link href="/" aria-label="Sorta home">
          <Wordmark size="sm" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link href={SIGN_UP} data-slot="button" className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background hover:bg-foreground/85">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Stack() {
  const items = [
    { name: "Composio", what: "Gmail access" },
    { name: "Jev", what: "reads every email" },
  ];
  return (
    <Section className="grid sm:grid-cols-[auto_1fr_1fr]">
      <p className="flex items-center px-5 py-4 text-[11px] tracking-widest text-muted-foreground uppercase sm:border-r sm:px-6">built on</p>
      {items.map((it, i) => (
        <p key={it.name} className={cn("flex items-baseline gap-2 px-5 py-4 max-sm:border-t sm:px-6", i < items.length - 1 && "sm:border-r")}>
          <span className="font-semibold">{it.name}</span>
          <span className="truncate text-[12px] text-muted-foreground">{it.what}</span>
        </p>
      ))}
    </Section>
  );
}

const PRIMITIVES = [
  { type: "choice", what: "one of your options, with a probability for each", uses: "junk kind · your categories" },
  { type: "score", what: "a step on an ordered scale", uses: "how much an email needs you, 0–3" },
  { type: "noul", what: "yes or no, as a probability", uses: "reply expected · Ask Jev search" },
];

function How() {
  return (
    <Section id="how">
      <div className="grid gap-6 px-5 pt-14 pb-10 sm:px-10 lg:grid-cols-2 lg:items-end lg:px-14">
        <div>
          <Eyebrow>how jev works</Eyebrow>
          <h2 className="mt-4 max-w-xl text-[clamp(1.8rem,3.6vw,2.6rem)] leading-tight font-semibold tracking-[-0.035em] text-balance">
            One email in. Four typed answers out.
          </h2>
        </div>
        <p className="max-w-md leading-relaxed text-pretty text-muted-foreground">
          Jev isn&apos;t a chatbot. For every email, Sorta asks it four questions in a single request, and it answers each with probabilities
          instead of prose. Your categories are one of the questions, so a new category is just a new option.
        </p>
      </div>
      <div className="dot-grid border-t px-3 py-8 sm:px-10 sm:py-10 lg:px-14">
        <JevDemo />
      </div>
      <ul className="grid border-t md:grid-cols-3">
        {PRIMITIVES.map((p, i) => (
          <li key={p.type} className={cn("space-y-2 p-5 sm:p-8", i > 0 && "max-md:border-t md:border-l")}>
            <h3 className="text-[16px] font-semibold">{p.type}</h3>
            <p className="text-pretty text-muted-foreground">{p.what}</p>
            <p className="pt-1 text-pretty">
              <span className="text-foreground/40">→ </span>
              {p.uses}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Feature({ id, eyebrow, title, body, demo, flip }: { id: string; eyebrow: string; title: string; body: string; demo: React.ReactNode; flip?: boolean }) {
  return (
    <Section id={id} className="grid lg:grid-cols-2">
      <div className={cn("flex min-w-0 flex-col justify-center px-5 py-14 sm:px-10 lg:px-14", flip && "lg:order-2 lg:border-l", !flip && "lg:border-r")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-4 text-[clamp(1.6rem,3vw,2.2rem)] leading-tight font-semibold tracking-[-0.035em] text-balance">{title}</h2>
        <p className="mt-4 max-w-md leading-relaxed text-pretty text-muted-foreground">{body}</p>
      </div>
      <div className="dot-grid min-w-0 px-3 py-10 max-lg:border-t sm:px-10 lg:py-14">{demo}</div>
    </Section>
  );
}

const MORE = [
  { icon: Bell, title: "Needs attention", body: "Jev scores how much each email needs you, from 0 to 3, and whether someone is waiting on a reply." },
  { icon: Search, title: "Ask Jev", body: "Search by meaning: “receipts for things I bought”. Jev checks each email. Save the search as a category." },
  { icon: Users, title: "Top senders", body: "See who fills your inbox and how much of their mail is junk. Trash all of it or keep it, per sender." },
  { icon: MousePointerClick, title: "Corrections stick", body: "Move an email by hand and Jev won't re-sort it. Mark something “not junk” and it's never swept." },
  { icon: ShieldCheck, title: "Protected senders", body: "Add addresses or whole domains that are never swept, whatever Jev thinks of them." },
  { icon: Undo2, title: "Undo everything", body: "Sweeps go to Trash, not into the void, and every sweep can be undone from the toast." },
];

function Grid() {
  return (
    <Section>
      <div className="px-5 pt-14 pb-10 sm:px-10 lg:px-14">
        <Eyebrow>and the rest</Eyebrow>
        <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3vw,2.2rem)] leading-tight font-semibold tracking-[-0.035em] text-balance">
          Small tools for an inbox you actually read.
        </h2>
      </div>
      <ul className="grid border-t sm:grid-cols-2 lg:grid-cols-3">
        {MORE.map((f, i) => (
          <li
            key={f.title}
            className={cn(
              "space-y-3 p-5 sm:p-8",
              i > 0 && "max-sm:border-t",
              i % 2 === 1 && "sm:max-lg:border-l",
              i >= 2 && "sm:max-lg:border-t",
              i % 3 !== 0 && "lg:border-l",
              i >= 3 && "lg:border-t",
            )}
          >
            <f.icon className="size-4 text-foreground/80" aria-hidden />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="leading-relaxed text-pretty text-muted-foreground">{f.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const KEYS: { keys: string[]; sep?: string; what: string }[] = [
  { keys: ["J", "K"], sep: "/", what: "next / previous" },
  { keys: ["E"], what: "trash, then next" },
  { keys: ["1", "6"], sep: "–", what: "switch tab" },
  { keys: ["/"], what: "filter, ↵ asks Jev" },
  { keys: ["C"], what: "new category" },
  { keys: ["V"], what: "list · cards · senders" },
  { keys: [","], what: "sweep rules" },
  { keys: ["⌘", "K"], what: "command menu" },
];

function Keys() {
  return (
    <Section className="grid lg:grid-cols-[2fr_3fr]">
      <div className="px-5 py-14 sm:px-10 lg:border-r lg:px-14">
        <Eyebrow>keyboard first</Eyebrow>
        <h2 className="mt-4 text-[clamp(1.6rem,3vw,2.2rem)] leading-tight font-semibold tracking-[-0.035em] text-balance">Hands stay on the keys.</h2>
        <p className="mt-4 max-w-sm leading-relaxed text-pretty text-muted-foreground">
          The whole app runs from the keyboard, like a terminal. The URL keeps your filters, view and open email, so you can share a link or come back to one.
        </p>
      </div>
      <ul className="grid grid-cols-2 max-lg:border-t sm:grid-cols-4">
        {KEYS.map(({ keys, sep, what }, i) => (
          <li
            key={what}
            className={cn(
              "flex flex-col justify-between gap-6 p-5",
              i % 2 === 1 && "max-sm:border-l",
              i >= 2 && "max-sm:border-t",
              i % 4 !== 0 && "sm:border-l",
              i >= 4 && "sm:border-t",
            )}
          >
            <span className="flex items-center gap-1.5">
              {keys.map((k, j) => (
                <span key={k} className="contents">
                  {j > 0 && sep && <span className="text-muted-foreground">{sep}</span>}
                  <kbd className="grid h-8 min-w-8 place-items-center rounded-md border border-b-2 bg-card px-2 font-sans text-[13px]">{k}</kbd>
                </span>
              ))}
            </span>
            <span className="text-[12px] text-muted-foreground">{what}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const PRIVACY = [
  { icon: Lock, title: "Row-level security", body: "Your mail data lives in Postgres behind row-level security. One account can never read another's." },
  { icon: KeyRound, title: "Your own keys, sealed", body: "You bring your own Composio key. It's sealed with AES-256-GCM before it's stored." },
  { icon: Eye, title: "Jev labels, it doesn't write", body: "Jev returns typed answers and probabilities, not generated text. It files your mail and nothing else." },
];

function Privacy() {
  return (
    <Section id="privacy">
      <div className="px-5 pt-14 pb-10 sm:px-10 lg:px-14">
        <Eyebrow>privacy</Eyebrow>
        <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3vw,2.2rem)] leading-tight font-semibold tracking-[-0.035em] text-balance">Your mail stays yours.</h2>
      </div>
      <ul className="grid border-t md:grid-cols-3">
        {PRIVACY.map((p, i) => (
          <li key={p.title} className={cn("space-y-3 p-5 sm:p-8", i > 0 && "max-md:border-t md:border-l")}>
            <span className="grid size-8 place-items-center rounded-md border bg-card">
              <p.icon className="size-4" aria-hidden />
            </span>
            <h3 className="font-semibold">{p.title}</h3>
            <p className="leading-relaxed text-pretty text-muted-foreground">{p.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Cta() {
  return (
    <Section className="hero-grid overflow-hidden">
      <div className="flex flex-col items-center px-5 py-24 text-center sm:py-32">
        <Logo className="size-8" />
        <h2 className="mt-8 max-w-2xl text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.05] font-semibold tracking-[-0.045em] text-balance">
          Two minutes to a sorted inbox.
        </h2>
        <p className="mt-5 max-w-md leading-relaxed text-pretty text-muted-foreground">Create an account, connect Gmail and describe your first category. Jev does the rest.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <PrimaryCta>Get started</PrimaryCta>
          <Link href="/login" className="inline-flex h-10 items-center rounded-md border px-4 hover:bg-muted">
            Sign in
          </Link>
        </div>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 border-x px-5 py-6 text-[12px] text-muted-foreground sm:px-10 lg:px-14">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <Logo className="size-3.5" /> sorta
        </span>
        <span>Gmail through Composio · reading by Jev</span>
        <nav className="ml-auto flex gap-5">
          <a href="#privacy" className="hover:text-foreground">Privacy</a>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
