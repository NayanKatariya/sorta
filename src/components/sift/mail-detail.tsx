"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FileImage,
  FileText,
  FolderInput,
  Mail,
  MailOpen,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { senderAddress, senderName } from "@/lib/policy";
import { JUNK_KIND_LABELS, type Category, type ClientState, type ThreadMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SenderTile } from "./avatar";
import { fullDate, listDate, priorityLabel, threadIdsOf, threadKey, type Row, type SenderGroup } from "./model";
import { json } from "./use-sift";

type Actions = {
  busy: string | null;
  onTrash: (ids: string[]) => void;
  onProtect: (sender: string, on: boolean) => void;
  onMove: (ids: string[], category: string | null) => void;
  onKeep: (id: string, keep: boolean) => void;
  onRead: (ids: string[], read: boolean) => void;
  onNewCategory: () => void;
  onClose?: () => void;
};

export function MailDetail({
  email,
  state,
  onSelectEmail,
  ...act
}: { email: Row; state: ClientState; onSelectEmail: (id: string) => void } & Actions) {
  const a = email.analysis;
  const addr = senderAddress(email.from);
  const isProtected = state.protectedSenders.includes(addr);
  const category = a?.category ? state.categories.find((c) => c.id === a.category) : undefined;
  // Trash and read act on the whole conversation, as in Gmail.
  const thread = threadIdsOf(state.emails, email.id);
  const fromSender = state.emails.filter((e) => threadKey(e) !== threadKey(email) && senderAddress(e.from) === addr);
  const unread = state.emails.some((e) => thread.includes(e.id) && e.labelIds.includes("UNREAD"));

  return (
    <article className="@container flex h-full min-h-0 flex-col" aria-label={email.subject}>
      {/* Labels collapse to icons by the pane's own width (it's a side panel on wide screens), so the bar never overflows. */}
      <div className="flex h-14 min-w-0 shrink-0 items-center gap-1 border-b px-3">
        {act.onClose && (
          <Button variant="ghost" size="icon-sm" onClick={act.onClose} aria-label="Close">
            <X />
          </Button>
        )}
        <MoveMenu categories={state.categories} current={category} onMove={(id) => act.onMove([email.id], id)} onNew={act.onNewCategory} />
        {email.sweepable || a?.keep ? (
          <Button variant="ghost" size="sm" onClick={() => act.onKeep(email.id, !a?.keep)} aria-label={a?.keep ? "Allow sweep" : "Not junk"}>
            {a?.keep ? <X /> : <Check />} <span className="@max-xl:hidden">{a?.keep ? "Allow sweep" : "Not junk"}</span>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => act.onProtect(addr, !isProtected)} aria-label={isProtected ? "Sender kept" : "Always keep sender"}>
          {isProtected ? <ShieldCheck className="text-emerald-600" /> : <Shield />}
          <span className="@max-4xl:hidden">{isProtected ? "Sender kept" : "Always keep sender"}</span>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="sm" onClick={() => act.onRead(thread, unread)} aria-label={unread ? "Mark as read" : "Mark as unread"} />
              }
            >
              {unread ? <MailOpen /> : <Mail />}
              <span className="@max-3xl:hidden">{unread ? "Mark as read" : "Mark unread"}</span>
            </TooltipTrigger>
            <TooltipContent>
              {unread ? "Mark as read" : "Mark as unread"} <Kbd className="ml-1">U</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" onClick={() => act.onTrash(thread)} disabled={!!act.busy} aria-label={thread.length > 1 ? "Move conversation to Trash" : "Move to Trash"} />
              }
            >
              <Trash2 />
            </TooltipTrigger>
            <TooltipContent>
              Move to Trash <Kbd className="ml-1">E</Kbd>
            </TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={email.url} target="_blank" rel="noreferrer" aria-label="Open in Gmail" />}
          >
            <span className="@max-2xl:hidden">Open in Gmail</span> <ArrowUpRight />
          </Button>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-6">
          <h2 className="text-lg font-semibold text-balance sm:text-xl">{email.subject}</h2>
          <div className="mt-4 flex items-center gap-3">
            <SenderTile from={email.from} className="size-9 text-[11px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{senderName(email.from)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {addr}
                <span className="sm:hidden"> · {fullDate(email.date)}</span>
              </p>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground max-sm:hidden" dateTime={email.date}>
              {fullDate(email.date)}
            </time>
          </div>

          {a ? <JevRead email={email} category={category} /> : <p className="mt-6 text-sm text-muted-foreground">Jev hasn&apos;t read this one yet. Sync to analyze it.</p>}

          <Conversation email={email} size={thread.length} />

          {fromSender.length > 0 && (
            <section className="mt-10" aria-labelledby="more-from">
              <div className="flex items-baseline justify-between">
                <h3 id="more-from" className="text-sm font-medium">
                  More from {senderName(email.from)} <span className="text-muted-foreground tabular-nums">{fromSender.length}</span>
                </h3>
                <button
                  onClick={() => act.onTrash([...thread, ...fromSender.map((e) => e.id)])}
                  disabled={isProtected || !!act.busy}
                  className="text-xs text-muted-foreground hover:text-sweep disabled:opacity-50"
                >
                  Trash all {fromSender.length + 1}
                </button>
              </div>
              <ul className="mt-2 divide-y rounded-md border">
                {fromSender.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <button onClick={() => onSelectEmail(e.id)} className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                      <span className="min-w-0 flex-1 truncate text-sm">{e.subject}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{listDate(e.date)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

/* ── Conversation ─────────────────────────────────────────────────────── */

// Threads already opened this session show instantly; keyed by message and thread size so a new reply refetches.
const threadCache = new Map<string, ThreadMessage[]>();

function Conversation({ email, size }: { email: Row; size: number }) {
  const key = `${email.id}:${size}`;
  const [result, setResult] = useState<{ key: string; messages?: ThreadMessage[]; error?: string } | null>(null);

  useEffect(() => {
    if (threadCache.has(key)) return;
    let cancelled = false;
    fetch(`/api/thread?id=${encodeURIComponent(email.id)}`)
      .then((r) => (r.status === 401 ? json<never>(r) : (r.json() as Promise<{ messages?: ThreadMessage[]; error?: string }>)))
      .then((b) => {
        if (b.messages) threadCache.set(key, b.messages);
        if (!cancelled) setResult({ key, messages: b.messages, error: b.error });
      })
      .catch((e: Error) => !cancelled && setResult({ key, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [email.id, key]);

  const messages = threadCache.get(key) ?? (result?.key === key ? result.messages : undefined);
  const error = result?.key === key ? result.error : undefined;

  if (!messages?.length) {
    return (
      <div className="mt-6">
        <p className="text-[15px] leading-relaxed text-pretty text-foreground/85">{email.preview || "No preview text."}</p>
        {error ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Couldn&apos;t load the full email ({error}).{" "}
            <a href={email.url} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">
              Open it in Gmail
            </a>
          </p>
        ) : (
          <div className="mt-4 space-y-2" aria-label="Loading the full email">
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {messages.length > 1 && <p className="text-xs text-muted-foreground tabular-nums">{messages.length} messages in this conversation</p>}
      {messages.map((m, i) => (
        <ThreadItem key={m.id} m={m} storedId={email.id} open={i === messages.length - 1 || m.id === email.id} single={messages.length === 1} />
      ))}
    </div>
  );
}

/** Splits a reply into what's new and the quoted history below it. */
function splitQuoted(text: string) {
  const m = /\n[^\n]*\bOn\b[^\n]{4,200}\bwrote:\s*\n|\n>/.exec(text);
  return m ? [text.slice(0, m.index).trimEnd(), text.slice(m.index).trim()] : [text.trimEnd(), ""];
}

function ThreadItem({ m, storedId, open: initiallyOpen, single }: { m: ThreadMessage; storedId: string; open: boolean; single: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [showQuoted, setShowQuoted] = useState(false);
  const [body, quoted] = splitQuoted(m.text);
  const sent = m.labelIds.includes("SENT");
  const head = (
    <>
      <SenderTile from={m.from} className="size-7 text-[10px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{sent ? "You" : senderName(m.from)}</span>
        {!open && <span className="block truncate text-xs text-muted-foreground">{body.split("\n")[0] || "(no text)"}</span>}
      </span>
      <time className="shrink-0 text-xs text-muted-foreground tabular-nums" dateTime={m.date}>
        {listDate(m.date)}
      </time>
    </>
  );

  if (single) return <MessageBody body={body} quoted={quoted} showQuoted={showQuoted} onQuoted={setShowQuoted} m={m} storedId={storedId} />;

  return (
    <div className="rounded-md border">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40">
        {head}
      </button>
      {open && (
        <div className="border-t px-3 pt-3 pb-3">
          <MessageBody body={body} quoted={quoted} showQuoted={showQuoted} onQuoted={setShowQuoted} m={m} storedId={storedId} />
        </div>
      )}
    </div>
  );
}

function MessageBody({
  body,
  quoted,
  showQuoted,
  onQuoted,
  m,
  storedId,
}: {
  body: string;
  quoted: string;
  showQuoted: boolean;
  onQuoted: (v: boolean) => void;
  m: ThreadMessage;
  storedId: string;
}) {
  const attachmentUrl = (a: { id: string; filename: string }) =>
    `/api/attachment?${new URLSearchParams({ email: storedId, message: m.id, id: a.id, name: a.filename })}`;
  return (
    <>
      {m.html ? (
        <HtmlFrame html={m.html} inline={m.inline ?? {}} attachmentUrl={attachmentUrl} />
      ) : (
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground/85">{body || "(no text)"}</p>
      )}
      {!m.html && quoted && (
        <>
          <button onClick={() => onQuoted(!showQuoted)} className="mt-2 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground hover:text-foreground" aria-expanded={showQuoted}>
            {showQuoted ? "hide quoted text" : "···"}
          </button>
          {showQuoted && <p className="mt-2 border-l-2 pl-3 text-sm break-words whitespace-pre-wrap text-muted-foreground">{quoted}</p>}
        </>
      )}
      {m.attachments.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Attachments">
          {m.attachments.map((a) => {
            const url = attachmentUrl(a);
            const Icon = a.mimeType.startsWith("image/") ? FileImage : FileText;
            return (
              <li key={a.id} className="flex max-w-full items-center rounded-md border bg-muted/30 text-sm">
                <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 py-1.5 pr-2 pl-2.5 hover:underline">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.filename}</span>
                </a>
                <a href={`${url}&download=1`} className="border-l px-2 py-1.5 text-muted-foreground hover:text-foreground" aria-label={`Download ${a.filename}`}>
                  <Download className="size-3.5" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ── HTML email ───────────────────────────────────────────────────────── */

const QUOTED = ".gmail_quote, blockquote[type=cite], #divRplyFwdMsg, .yahoo_quoted";

/**
 * Head injected into every email. Scripts can't run at all (the iframe sandbox has no allow-scripts,
 * and the CSP blocks them too); links open in a new tab; quoted history starts hidden.
 */
const EMAIL_HEAD = `<!doctype html><meta charset="utf-8"><base target="_blank"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:">
<style>
html,body{margin:0;padding:0;overflow:hidden}
body{background:#fff;color:#1f1f1f;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-wrap:break-word}
#sift-fit{padding:16px;box-sizing:border-box}
html:not(.sift-show-quoted) :is(${QUOTED}){display:none!important}
</style>`;

/** Renders the sender's HTML in a sandboxed frame that grows to fit and shrinks wide newsletters to the pane. */
function HtmlFrame({
  html,
  inline,
  attachmentUrl,
}: {
  html: string;
  inline: Record<string, { id: string; filename: string }>;
  attachmentUrl: (a: { id: string; filename: string }) => string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [hasQuoted, setHasQuoted] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);

  const srcDoc = useMemo(() => {
    // Embedded images point at `cid:` parts; serve them through the attachment route.
    const body = html.replace(/cid:([^"'\s)>]+)/gi, (whole, cid: string) => {
      const a = inline[cid] ?? inline[decodeURIComponent(cid)];
      return a ? attachmentUrl(a) : whole;
    });
    return EMAIL_HEAD + body;
  }, [html, inline, attachmentUrl]);

  const fit = () => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;
    let wrap = doc.getElementById("sift-fit");
    if (!wrap) {
      wrap = doc.createElement("div");
      wrap.id = "sift-fit";
      while (doc.body.firstChild) wrap.appendChild(doc.body.firstChild);
      doc.body.appendChild(wrap);
    }
    wrap.style.transform = "";
    wrap.style.width = "";
    const natural = wrap.scrollWidth;
    const available = frame.clientWidth;
    if (natural > available + 1) {
      wrap.style.width = `${natural}px`;
      wrap.style.transformOrigin = "0 0";
      wrap.style.transform = `scale(${available / natural})`;
    }
    frame.style.height = `${Math.ceil(wrap.getBoundingClientRect().height) + 2}px`;
  };

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let inner: ResizeObserver | undefined;
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      setHasQuoted(doc.querySelector(QUOTED) !== null);
      fit();
      // Images arriving late change the height; re-fit when they do.
      inner?.disconnect();
      inner = new ResizeObserver(() => fit());
      if (doc.getElementById("sift-fit")) inner.observe(doc.getElementById("sift-fit")!);
    };
    const outer = new ResizeObserver(() => fit());
    outer.observe(frame);
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      outer.disconnect();
      inner?.disconnect();
    };
  }, [srcDoc]);

  useEffect(() => {
    ref.current?.contentDocument?.documentElement.classList.toggle("sift-show-quoted", showQuoted);
    fit();
  }, [showQuoted]);

  return (
    <>
      <iframe
        ref={ref}
        title="Email content"
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="block h-40 w-full rounded-md border bg-white"
      />
      {hasQuoted && (
        <button
          onClick={() => setShowQuoted((v) => !v)}
          className="mt-2 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={showQuoted}
        >
          {showQuoted ? "hide quoted text" : "···"}
        </button>
      )}
    </>
  );
}

/** Jev's judgments, shown as facts with their certainty, so the user can trust or correct them. */
function JevRead({ email, category }: { email: Row; category?: Category }) {
  const a = email.analysis!;
  const pr = priorityLabel(a.priority);
  const topKind = a.junkKind;
  const topP = a.junkProbabilities[topKind] ?? 0;

  return (
    <section aria-label="How Jev read this email" className="mt-6 rounded-md border bg-background/40">
      <dl className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Fact label="Kind">
          <span className={cn(email.sweepable && "text-sweep")}>{topKind === "not_junk" ? "Not junk" : JUNK_KIND_LABELS[topKind]}</span>
          <Meter value={topP} className={email.sweepable ? "bg-sweep" : undefined} />
        </Fact>
        <Fact label="Priority">
          <span className={pr.tone}>{pr.label}</span>
          {a.needsReply >= 0.6 && <span className="block text-xs text-muted-foreground">Reply expected</span>}
        </Fact>
        <Fact label="Category">
          {category ? (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: category.color }} />
              <span className="truncate">{category.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
          <span className="block text-xs text-muted-foreground">
            {a.manualCategory ? "Filed by you" : category ? `${Math.round(a.categoryConfidence * 100)}% sure` : " "}
          </span>
        </Fact>
      </dl>
      {(email.sweepable || a.keep || email.folder === "spam") && (
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          {a.keep
            ? "You marked this as not junk. It won't be swept."
            : email.folder === "spam"
              ? "Gmail put this in Spam. It will be removed on the next sweep."
              : `Will be swept: Jev is ${Math.round(email.junkScore * 100)}% sure it's junk you've chosen to remove.`}
        </p>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <span className="mt-1.5 flex items-center gap-2">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full origin-left rounded-full bg-foreground/60", className)} style={{ transform: `scaleX(${value})` }} />
      </span>
      <span className="text-xs font-normal text-muted-foreground tabular-nums">{Math.round(value * 100)}%</span>
    </span>
  );
}

function MoveMenu({
  categories,
  current,
  onMove,
  onNew,
}: {
  categories: Category[];
  current?: Category;
  onMove: (id: string | null) => void;
  onNew: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Move to category" />}>
        <FolderInput /> <span className="@max-lg:hidden">Move to</span> <ChevronDown className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {/* Base UI group labels must sit inside a Group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to category</DropdownMenuLabel>
          {categories.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => onMove(c.id)}>
              <span className="size-2 rounded-full" style={{ background: c.color }} />
              <span className="flex-1">{c.name}</span>
              {current?.id === c.id && <Check className="opacity-60" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {current && (
          <DropdownMenuItem onClick={() => onMove(null)}>
            <X /> Remove from {current.name}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNew}>New category…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SenderDetail({ group, state, onSelectEmail, ...act }: { group: SenderGroup; state: ClientState; onSelectEmail: (id: string) => void } & Actions) {
  const isProtected = state.protectedSenders.includes(group.addr);
  const junkPct = Math.round((group.junk / group.emails.length) * 100);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
        {act.onClose && (
          <Button variant="ghost" size="icon-sm" onClick={act.onClose} aria-label="Close">
            <X />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => act.onProtect(group.addr, !isProtected)}>
          {isProtected ? <ShieldCheck className="text-emerald-600" /> : <Shield />} {isProtected ? "Sender kept" : "Always keep sender"}
        </Button>
        {group.unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => act.onRead(group.emails.filter((e) => e.labelIds.includes("UNREAD")).map((e) => e.id), true)}
          >
            <MailOpen /> Mark {group.unread} read
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn("text-sweep hover:bg-sweep/10 hover:text-sweep", !group.unread && "ml-auto")}
          disabled={isProtected || !!act.busy}
          onClick={() => act.onTrash(group.emails.map((e) => e.id))}
        >
          <Trash2 /> Trash all {group.emails.length}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6">
          <div className="flex items-center gap-3">
            <SenderTile from={group.emails[0].from} className="size-11 text-sm" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{group.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{group.addr}</p>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-3 divide-x rounded-md border bg-background/40">
            <Fact label="Emails">
              <span className="tabular-nums">{group.emails.length}</span>
            </Fact>
            <Fact label="Unread">
              <span className="tabular-nums">{group.unread}</span>
            </Fact>
            <Fact label="Junk">
              <span className={cn("tabular-nums", junkPct >= 50 && "text-sweep")}>{junkPct}%</span>
            </Fact>
          </dl>
          <ul className="mt-6 divide-y rounded-md border">
            {group.emails.map((e) => (
              <li key={e.id}>
                <button onClick={() => onSelectEmail(e.id)} className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                  <span className="min-w-0 flex-1 truncate text-sm">{e.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{listDate(e.date)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function DetailIdle({ state }: { state: ClientState }) {
  const shortcuts: [string, string][] = [
    ["J / K", "Next / previous"],
    ["E", "Move to Trash"],
    ["U", "Mark read / unread"],
    ["/", "Search or ask Jev"],
    ["C", "New category"],
    ["⌘ K", "All commands"],
  ];
  return (
    <div className="grid h-full place-items-center px-8 max-lg:hidden">
      <div className="w-full max-w-xs">
        <p className="text-sm font-medium">{state.emails.length ? "Pick an email to see how Jev read it" : "Sync to get started"}</p>
        <dl className="mt-4 space-y-2">
          {shortcuts.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <dt className="text-muted-foreground">{v}</dt>
              <dd>
                <Kbd>{k}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
