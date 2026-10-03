"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, MoreHorizontal, Pencil, Tag, Trash2, Upload, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { senderAddress } from "@/lib/policy";
import { toast } from "sonner";
import type { Account, Category } from "@/lib/types";
import { CategoryDialog } from "./category-dialog";
import { CommandMenu } from "./command-menu";
import { ComposeDialog } from "./compose-dialog";
import { hasReplyDraft } from "./reply-box";
import { ComposioDialog, type ComposioStep } from "./composio-dialog";
import { MailDetail, SenderDetail } from "./mail-detail";
import { CardsView, EmptyView, ListView, Pager, SendersView } from "./mail-views";
import { collapseThreads, groupSenders, inCollection, inStatus, STATUSES, threadIdsOf, threadKey, type Collection, type Layout, type Status } from "./model";
import { RulesDialog, type SettingsTab } from "./rules-dialog";
import { Sidebar } from "./sidebar";
import { Header, StatusBar, Tabs } from "./toolbar";
import { useSift } from "./use-sift";

const MATCH = 0.5;
/** Rows (or senders) per page. The full set stays loaded for counts, the sweep and search. */
const PAGE_SIZE = 50;

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function fromUrl() {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const s = p.get("s") as Status | null;
  const l = p.get("v") as Layout | null;
  return {
    collection: (p.get("c") ?? "all") as Collection,
    status: s && STATUSES.includes(s) ? s : ("inbox" as Status),
    layout: l && ["list", "cards", "senders"].includes(l) ? l : ("list" as Layout),
    id: p.get("m"),
    account: p.get("a") ?? "all",
  };
}

/** True (and says why) while a reply has unsent text or files, which leaving the conversation would lose. */
function keepDraft() {
  if (!hasReplyDraft()) return false;
  toast("Send or discard your reply first.", { id: "reply-draft" });
  return true;
}

export function AppShell() {
  const sift = useSift();
  const { state, busy } = sift;
  const wide = useMedia("(min-width: 1024px)");
  const desktop = useMedia("(min-width: 768px)");

  const [collection, setCollection] = useState<Collection>(() => fromUrl().collection);
  const [status, setStatus] = useState<Status>(() => fromUrl().status);
  const [layout, setLayout] = useState<Layout>(() => fromUrl().layout);
  const [selectedId, setSelectedId] = useState<string | null>(() => fromUrl().id);
  const [account, setAccount] = useState<string>(() => fromUrl().account);
  const [selectedSender, setSelectedSender] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const toggleSidebar = () => (desktop ? setSidebarOpen((o) => !o) : setMobileNav((o) => !o));
  const [query, setQuery] = useState("");
  const [jev, setJev] = useState<{ q: string; scores: Record<string, number> } | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<Partial<Category> | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("sweep");
  const [composing, setComposing] = useState(false);
  /** Bumped by R / Shift+R; the open email's reply box listens. */
  const [replySignal, setReplySignal] = useState({ n: 0, all: false });
  const openSettings = (tab: SettingsTab = "sweep") => {
    setSettingsTab(tab);
    setRulesOpen(true);
    setMobileNav(false);
  };
  const [commandOpen, setCommandOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<Account | null>(null);
  const [composioStep, setComposioStep] = useState<ComposioStep | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The URL carries both filters, the layout and the open email.
  useEffect(() => {
    const p = new URLSearchParams();
    if (collection !== "all") p.set("c", collection);
    if (account !== "all") p.set("a", account);
    if (status !== "inbox") p.set("s", status);
    if (layout !== "list") p.set("v", layout);
    if (selectedId) p.set("m", selectedId);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [collection, status, layout, selectedId, account]);

  // One-off signals in the URL, read at first render: the effect above rewrites the query string before
  // later effects run. ?account=… is the return from Composio's Google sign-in; ?sync=1 is the end of setup.
  const [arrival] = useState(() => {
    const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return { account: q.get("account"), sync: q.has("sync") };
  });
  const { sync } = sift;
  useEffect(() => {
    if (arrival.account === "connected") toast.success("Gmail account connected. Syncing…");
    else if (arrival.account) toast.error("Connecting the Gmail account didn't finish. Try again.");
    if (arrival.sync || arrival.account === "connected") sync();
  }, [arrival, sync]);

  // First run (after the welcome page): nothing works without a Composio key, so ask for it straight away (once per load).
  const configured = state?.composio.configured;
  const askedForKey = useRef(false);
  useEffect(() => {
    if (configured !== false || askedForKey.current) return;
    askedForKey.current = true;
    setComposioStep("key");
  }, [configured]);

  const validAccount = account === "all" || state?.accounts.some((a) => a.id === account && a.enabled) ? account : "all";
  // The account picker scopes everything else, including both filters' counts.
  const emails = useMemo(
    () => (state?.emails ?? []).filter((e) => validAccount === "all" || e.accountId === validAccount),
    [state?.emails, validAccount],
  );
  const validCollection: Collection =
    collection === "all" || collection === "uncategorized" || state?.categories.some((c) => c.id === collection) ? collection : "all";

  // Double filter: each axis' counts are computed within the other axis.
  const inCol = useMemo(() => emails.filter((e) => inCollection(e, validCollection)), [emails, validCollection]);
  const inStat = useMemo(() => emails.filter((e) => inStatus(e, status)), [emails, status]);
  const statusCounts = useMemo(
    () => Object.fromEntries(STATUSES.map((s) => [s, inCol.filter((e) => inStatus(e, s)).length])) as Record<Status, number>,
    [inCol],
  );

  const flatRows = useMemo(() => {
    if (jev) return emails.filter((e) => (jev.scores[e.id] ?? 0) >= MATCH).sort((a, b) => jev.scores[b.id] - jev.scores[a.id]);
    let list = inCol.filter((e) => inStatus(e, status));
    if (status === "attention") list = [...list].sort((a, b) => (b.analysis?.priority ?? 0) - (a.analysis?.priority ?? 0));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => `${e.from} ${e.subject} ${e.preview}`.toLowerCase().includes(q));
    return list;
  }, [emails, inCol, status, query, jev]);
  // List and cards show conversations; the senders view counts every message.
  const rows = useMemo(() => (layout === "senders" ? flatRows : collapseThreads(flatRows)), [layout, flatRows]);
  const threadOf = useCallback((id: string) => threadIdsOf(state?.emails ?? [], id), [state?.emails]);

  const senderGroups = useMemo(() => (layout === "senders" ? groupSenders(flatRows) : []), [layout, flatRows]);
  const selected = emails.find((e) => e.id === selectedId) ?? null;
  // The row standing for the open conversation, even after a newer reply takes its place.
  const selectedRowId = selected ? (rows.find((r) => threadKey(r) === threadKey(selected))?.id ?? selected.id) : null;
  const senderGroup = useMemo(
    () => (selectedSender ? (groupSenders(emails.filter((e) => senderAddress(e.from) === selectedSender))[0] ?? null) : null),
    [emails, selectedSender],
  );
  // Pages of PAGE_SIZE. Any filter change, including going back to an earlier one, starts at page 1.
  const filterKey = `${validCollection}|${status}|${layout}|${validAccount}|${query}|${jev?.q ?? ""}`;
  const [pageAt, setPageAt] = useState({ key: filterKey, n: 0 });
  if (pageAt.key !== filterKey) setPageAt({ key: filterKey, n: 0 });
  const total = layout === "senders" ? senderGroups.length : rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageAt.key === filterKey ? pageAt.n : 0, pageCount - 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const goPage = (n: number) => {
    setPageAt({ key: filterKey, n });
    scrollRef.current?.scrollTo({ top: 0 });
  };
  /** Keeps the page in step when the selection moves onto another page (J/K, trash-and-advance). */
  const showIndex = (i: number) => {
    if (i >= 0 && Math.floor(i / PAGE_SIZE) !== page) setPageAt({ key: filterKey, n: Math.floor(i / PAGE_SIZE) });
  };
  const pageRows = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const pageGroups = useMemo(() => senderGroups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [senderGroups, page]);

  const sweepIds = useMemo(() => emails.filter((e) => e.sweepable).map((e) => e.id), [emails]);
  const collections: Collection[] = useMemo(
    () => ["all", ...(state?.categories.map((c) => c.id) ?? []), ...(state?.categories.length ? ["uncategorized"] : [])],
    [state?.categories],
  );

  const resetSearch = () => {
    setJev(null);
    setQuery("");
  };
  const pickCollection = (c: Collection) => {
    setCollection(c);
    resetSearch();
  };
  const pickStatus = (s: Status) => {
    setStatus(s);
    resetSearch();
  };
  const openEmail = (id: string) => {
    if (id !== selectedId && keepDraft()) return;
    setSelectedSender(null);
    setSelectedId(id);
  };
  const openSender = (addr: string) => {
    if (keepDraft()) return;
    setSelectedId(null);
    setSelectedSender(addr);
  };

  const askJev = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setQuery(q);
      const r = await sift.search(q.trim());
      if (r) setJev({ q: q.trim(), scores: r.scores });
    },
    [sift],
  );

  /** Trash, then land on the neighbour so triage keeps flowing. */
  const trashAndAdvance = useCallback(
    (ids: string[]) => {
      if (selectedId && ids.includes(selectedId)) {
        const i = rows.findIndex((r) => r.id === selectedRowId);
        const next = rows.slice(i + 1).find((r) => !ids.includes(r.id)) ?? rows.slice(0, i).reverse().find((r) => !ids.includes(r.id));
        setSelectedId(next?.id ?? null);
        if (next) showIndex(rows.filter((r) => !ids.includes(r.id)).indexOf(next));
      }
      sift.trash(ids);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showIndex only reads the current page
    [rows, selectedId, selectedRowId, sift, page, filterKey],
  );

  // Keyboard map (mirrors the status bar). Never animated; ignored while typing or in dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      const t = e.target as HTMLElement;
      if (mod || t.closest("input, textarea, [contenteditable], [role=dialog], [data-compose]")) return;
      // Moving to another email or closing this one would throw an unsent reply away.
      if (["j", "k", "ArrowDown", "ArrowUp", "e", "#", "Escape"].includes(e.key) && keepDraft()) return;

      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const i = collections.indexOf(validCollection);
        pickCollection(collections[(i + (e.key === "ArrowDown" ? 1 : -1) + collections.length) % collections.length]);
        return;
      }
      if (e.altKey) return;

      if (/^[1-7]$/.test(e.key)) {
        pickStatus(STATUSES[Number(e.key) - 1]);
        return;
      }
      const move = (d: number) => {
        if (layout === "senders") {
          if (!senderGroups.length) return;
          const i = senderGroups.findIndex((g) => g.addr === selectedSender);
          // Nothing picked yet: start at the top of the page on screen.
          const to = Math.min(senderGroups.length - 1, Math.max(0, i === -1 ? page * PAGE_SIZE : i + d));
          openSender(senderGroups[to].addr);
          showIndex(to);
          return;
        }
        if (!rows.length) return;
        const i = rows.findIndex((r) => r.id === selectedRowId);
        const to = Math.min(rows.length - 1, Math.max(0, i === -1 ? page * PAGE_SIZE : i + d));
        openEmail(rows[to].id);
        showIndex(to);
      };
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "u":
          if (selected) sift.markRead(threadOf(selected.id), selected.labelIds.includes("UNREAD"));
          break;
        case "e":
        case "#":
          if (selectedId) trashAndAdvance(threadOf(selectedId));
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "N":
          e.preventDefault(); // don't type the key into the dialog's autofocused field
          setCategoryDialog({});
          break;
        case "c":
          e.preventDefault();
          setComposing(true);
          break;
        case "r":
        case "R":
          if (!selected) break;
          e.preventDefault();
          setReplySignal((s) => ({ n: s.n + 1, all: e.key === "R" }));
          break;
        case "v":
          setLayout((l) => (l === "list" ? "cards" : l === "cards" ? "senders" : "list"));
          break;
        case ",":
          openSettings();
          break;
        case "Escape":
          setSelectedId(null);
          setSelectedSender(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!state) return <LoadingShell />;

  const activeCategory = state.categories.find((c) => c.id === validCollection);
  const title = jev
    ? `jev: “${jev.q}”`
    : validCollection === "all"
      ? "Everything"
      : validCollection === "uncategorized"
        ? "Uncategorized"
        : (activeCategory?.name ?? "Category");

  const detailActions = {
    busy,
    onTrash: trashAndAdvance,
    onProtect: sift.protect,
    onMove: (ids: string[], category: string | null) => sift.override(ids, { category }),
    onKeep: (id: string, keep: boolean) => sift.override([id], { keep }),
    onRead: sift.markRead,
    onNewCategory: () => setCategoryDialog({}),
  };
  const closeDetail = () => {
    if (keepDraft()) return;
    setSelectedId(null);
    setSelectedSender(null);
  };
  const detail = selected ? (
    <MailDetail email={selected} state={state} {...detailActions} replySignal={replySignal} onSelectEmail={openEmail} onClose={closeDetail} />
  ) : senderGroup ? (
    <SenderDetail group={senderGroup} state={state} {...detailActions} onSelectEmail={openEmail} onClose={closeDetail} />
  ) : null;

  const headerActions = (
    <>
      {jev && (
        <Button variant="ghost" size="xs" onClick={() => setCategoryDialog({ name: jev.q.slice(0, 40), description: jev.q })}>
          <Tag /> save as category
        </Button>
      )}
      {activeCategory && !jev && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${activeCategory.name} options`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem onClick={() => setCategoryDialog(activeCategory)}>
              <Pencil /> Edit description…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => sift.pushToGmail(activeCategory.id)}>
              <Upload /> {Object.keys(activeCategory.gmailLabels ?? {}).length ? "Re-apply Gmail label" : "Add as Gmail label"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => trashAndAdvance(flatRows.map((r) => r.id))} disabled={!flatRows.length}>
              <Trash2 /> Trash these {flatRows.length}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(activeCategory)}>
              <X /> Delete category…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  const sidebar = (
    <Sidebar
      state={state}
      scoped={inStat}
      collection={validCollection}
      account={validAccount}
      busy={busy}
      onCollection={(c) => {
        pickCollection(c);
        setMobileNav(false);
      }}
      onAccount={(id) => {
        setAccount(id);
        setSelectedId(null);
        setMobileNav(false);
      }}
      onNewCategory={() => setCategoryDialog({})}
      onCompose={() => {
        setComposing(true);
        setMobileNav(false);
      }}
      onAgents={() => openSettings("agents")}
      onEditCategory={(c) => setCategoryDialog(c)}
      onDeleteCategory={setConfirmDelete}
      onGmailLabel={(c) => sift.pushToGmail(c.id)}
      onManageAccounts={() => {
        setComposioStep(state.composio.configured ? "accounts" : "key");
        setMobileNav(false);
      }}
      onDisconnect={setConfirmDisconnect}
    />
  );

  const content = !rows.length ? (
    <EmptyView
      state={state}
      justSwept={sift.justSwept}
      searching={!!query.trim() || !!jev}
      busy={busy}
      onSync={sift.sync}
      onUndo={sift.undo}
      onReset={() => {
        sift.clearJustSwept();
        resetSearch();
        setCollection("all");
        setStatus("inbox");
      }}
    />
  ) : (
    <>
      {layout === "cards" ? (
        <CardsView rows={pageRows} categories={state.categories} selectedId={selectedRowId} leaving={sift.leaving} onSelect={openEmail} />
      ) : layout === "senders" ? (
        <SendersView groups={pageGroups} selected={selectedSender} protectedSenders={state.protectedSenders} onSelect={openSender} />
      ) : (
        <ListView rows={pageRows} categories={state.categories} selectedId={selectedRowId} leaving={sift.leaving} onSelect={openEmail} />
      )}
      <Pager page={page} pageCount={pageCount} total={total} size={PAGE_SIZE} noun={layout === "senders" ? "senders" : "conversations"} onPage={goPage} />
    </>
  );

  return (
    <div className="flex h-dvh flex-col overflow-clip bg-background">
      <div className="flex min-h-0 flex-1">
        {desktop && sidebarOpen && <aside className="w-[280px] shrink-0 border-r bg-sidebar xl:w-[320px]">{sidebar}</aside>}

        <main className="flex min-w-0 flex-1 flex-col">
          <Header
            title={title}
            state={state}
            progress={sift.progress}
            busy={busy}
            sweepCount={sweepIds.length}
            query={query}
            jevQuery={jev?.q ?? null}
            searchRef={searchRef}
            headerActions={headerActions}
            onQuery={(q) => {
              setQuery(q);
              if (jev) setJev(null);
            }}
            onAskJev={() => askJev(query)}
            onClearJev={resetSearch}
            onSync={sift.sync}
            onSweep={() => sift.sweep(sweepIds)}
            onToggleSidebar={toggleSidebar}
            onCompose={() => setComposing(true)}
          />
          <Tabs status={status} counts={statusCounts} layout={layout} onStatus={pickStatus} onLayout={setLayout} />
          {!state.jevConfigured && (
            <p role="alert" className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3.5 shrink-0" />
              Add CMD_API_KEY to .env.local and restart so Jev can read your mail.
            </p>
          )}
          <div className="flex min-h-0 flex-1">
            <div ref={scrollRef} className="scroll-thin min-w-0 flex-1 overflow-y-auto overscroll-contain">
              {content}
            </div>
            {wide && detail && <aside className="w-[460px] shrink-0 border-l bg-card xl:w-[540px]">{detail}</aside>}
          </div>
        </main>
      </div>

      <StatusBar
        onCommand={() => setCommandOpen(true)}
        onToggleSidebar={toggleSidebar}
        onNewCategory={() => setCategoryDialog({})}
        onCompose={() => setComposing(true)}
        onRules={() => openSettings()}
      />

      {!desktop && (
        <Sheet open={mobileNav} onOpenChange={setMobileNav}>
          <SheetContent side="left" className="gap-0 bg-sidebar p-0 data-[side=left]:w-[85vw]" showCloseButton={false}>
            <SheetTitle className="sr-only">Categories</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>
      )}
      {!wide && (
        <Sheet open={!!detail} onOpenChange={(o) => !o && closeDetail()}>
          <SheetContent side="right" className="gap-0 bg-card p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl" showCloseButton={false}>
            <SheetTitle className="sr-only">{selected?.subject ?? senderGroup?.name ?? "Details"}</SheetTitle>
            {detail}
          </SheetContent>
        </Sheet>
      )}

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        state={state}
        junkCount={sweepIds.length}
        onCollection={pickCollection}
        onStatus={pickStatus}
        onLayout={setLayout}
        onSync={sift.sync}
        onSweep={() => {
          setStatus("junk");
          sift.sweep(sweepIds);
        }}
        onUndo={sift.undo}
        onNewCategory={() => setCategoryDialog({})}
        onCompose={() => setComposing(true)}
        onRules={() => openSettings()}
        onSending={() => openSettings("sending")}
        onAgents={() => openSettings("agents")}
        onAskJev={askJev}
      />

      {categoryDialog && (
        <CategoryDialog
          open
          onOpenChange={(o) => !o && setCategoryDialog(null)}
          initial={categoryDialog}
          existing={state.categories}
          busy={busy === "category"}
          onSave={async (name, description) => {
            const r = categoryDialog.id ? await sift.editCategory(categoryDialog.id, name, description) : await sift.addCategory(name, description);
            const created = !categoryDialog.id ? r?.categories.at(-1) : undefined;
            if (created) pickCollection(created.id);
            return r;
          }}
        />
      )}
      <ComposioDialog
        open={!!composioStep}
        onOpenChange={(o) => !o && setComposioStep(null)}
        step={composioStep ?? "accounts"}
        onStep={setComposioStep}
        state={state}
        busy={busy}
        onSaveKey={sift.saveComposioKey}
        onRemoveKey={async () => {
          await sift.removeComposioKey();
          setAccount("all");
          setComposioStep("key");
        }}
        onSaveAccounts={sift.setAccounts}
        onConnect={sift.connectAccount}
      />
      {composing && <ComposeDialog open onOpenChange={(o) => !o && setComposing(false)} state={state} />}
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} tab={settingsTab} onTab={setSettingsTab} state={state} onSettings={sift.updateSettings} onProtect={sift.protect} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its emails stay in your inbox and get re-sorted into your other categories. Any Gmail label you created stays in Gmail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const id = confirmDelete!.id;
                setConfirmDelete(null);
                pickCollection("all");
                await sift.deleteCategory(id);
              }}
            >
              Delete category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDisconnect} onOpenChange={(o) => !o && setConfirmDisconnect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {confirmDisconnect?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the connection from your Composio project, along with its new-mail trigger. Nothing is deleted in Gmail. To only
              stop Sorta reading it, uncheck it under Manage accounts instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const id = confirmDisconnect!.id;
                setConfirmDisconnect(null);
                setAccount("all");
                await sift.disconnectAccount(id);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex h-dvh">
      <div className="hidden w-[280px] border-r md:block">
        <Skeleton className="m-3 h-4 w-16" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-[35px] items-center gap-3 border-b px-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 flex-1" />
          </div>
        ))}
      </div>
      <div className="flex-1">
        <Skeleton className="m-2 h-5 w-1/3" />
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-3 border-b px-3">
            <Skeleton className="size-6" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
