"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ClientState, Settings } from "@/lib/types";

export type SyncProgress = { stage: string; message?: string; done?: number; total?: number } | null;
export type LastSweep = { count: number; at: number } | null;

const LEAVE_MS = 180;

/** The session ended (signed out elsewhere, or expired): back to the sign-in page. */
export function toLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so no signed-in state survives
  window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
}

export async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    toLogin();
    throw new Error("Signed out");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function useSift() {
  const [state, setState] = useState<ClientState | null>(null);
  const [progress, setProgress] = useState<SyncProgress>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Rows currently playing their exit animation. */
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  /** Drives the post-sweep "done" moment in the UI. */
  const [justSwept, setJustSwept] = useState<LastSweep>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await json<ClientState>(await fetch("/api/state")));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    fetch("/api/state")
      .then((r) => json<ClientState>(r))
      .then(setState)
      .catch((e) => toast.error(e.message));
    // Then ask Composio which Gmail accounts are connected (quietly; the cached list shows meanwhile).
    fetch("/api/accounts")
      .then((r) => json<ClientState>(r))
      .then(setState)
      .catch(() => {});
  }, []);

  const guard = useCallback(async <T,>(key: string, fn: () => Promise<T>) => {
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  // New mail pushed by Composio triggers. Bursts are batched into one refresh and one toast.
  useEffect(() => {
    const events = new EventSource("/api/events");
    let pending: { from: string; subject: string }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener("mail", (ev) => {
      pending.push(JSON.parse((ev as MessageEvent).data));
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const batch = pending;
        pending = [];
        await refresh();
        const from = batch[0].from.replace(/\s*<.*>$/, "").replace(/"/g, "");
        toast(batch.length === 1 ? `New mail from ${from}` : `${batch.length} new emails`, {
          description: batch.length === 1 ? batch[0].subject : undefined,
        });
      }, 800);
    });
    // A closed stream (not a reconnect) usually means the session ended; ask /api/state, which redirects on 401.
    events.onerror = () => {
      if (events.readyState === EventSource.CLOSED) fetch("/api/state").then((r) => r.status === 401 && toLogin());
    };
    events.addEventListener("status", (ev) => {
      const { live } = JSON.parse((ev as MessageEvent).data) as { live: boolean };
      setState((s) => (s && s.composio.live !== live ? { ...s, composio: { ...s.composio, live } } : s));
    });
    return () => {
      clearTimeout(timer);
      events.close();
    };
  }, [refresh]);

  /** True while this tab is running or waiting on a sync, so repeat clicks don't start a second one. */
  const syncing = useRef(false);

  /** Another tab or request already holds the sync: show progress and poll until it finishes, then load its result. */
  const joinRunningSync = useCallback(async () => {
    setProgress({ stage: "fetch", message: "Syncing… (already running)" });
    const deadline = Date.now() + 7 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const next = await json<ClientState>(await fetch("/api/state"));
      if (!next.syncing) {
        setState(next);
        return;
      }
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setProgress({ stage: "fetch", message: "Fetching from Gmail…" });
    try {
      const res = await fetch("/api/sync", { method: "POST", body: "{}" });
      if (res.status === 409) return await joinRunningSync();
      if (!res.ok) await json(res);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const ev = JSON.parse(line);
          if (ev.stage === "done") setState(ev.state);
          else if (ev.stage === "error") toast.error(ev.message);
          else if (ev.stage === "notice") toast.warning(ev.message);
          else setProgress((p) => ({ ...p, ...ev }));
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      syncing.current = false;
      setProgress(null);
    }
  }, [joinRunningSync]);

  // Opened (or reloaded) while a sync is running elsewhere: show it and pick up its result.
  const joinedOnLoad = useRef(false);
  useEffect(() => {
    if (!state?.syncing || joinedOnLoad.current || syncing.current) return;
    joinedOnLoad.current = true;
    syncing.current = true;
    joinRunningSync()
      .catch(() => {})
      .finally(() => {
        syncing.current = false;
        setProgress(null);
      });
  }, [state?.syncing, joinRunningSync]);

  const undo = useCallback(
    () =>
      guard("undo", async () => {
        const r = await json<{ restored: number; state: ClientState }>(await fetch("/api/undo", { method: "POST" }));
        setState(r.state);
        setJustSwept(null);
        toast.success(`Restored ${r.restored} ${r.restored === 1 ? "email" : "emails"}`, {
          description: "Sync to bring them back into view.",
          action: { label: "Sync now", onClick: () => sync() },
        });
      }),
    [guard, sync],
  );

  /** Optimistic removal: animate rows out, drop them locally, then call the API; roll back on failure. */
  const removeOptimistic = useCallback(
    async (ids: string[], call: () => Promise<{ count: number; state: ClientState; notice?: string }>, noun: (n: number) => string, sweep = false) => {
      if (!ids.length) return;
      setBusy(sweep ? "sweep" : "trash");
      setLeaving(new Set(ids));
      await new Promise((r) => setTimeout(r, LEAVE_MS));
      const drop = new Set(ids);
      setState((s) => (s ? { ...s, emails: s.emails.filter((e) => !drop.has(e.id)) } : s));
      setLeaving(new Set());
      try {
        const r = await call();
        setState(r.state);
        if (r.notice) toast.warning(r.notice);
        if (sweep) setJustSwept({ count: r.count, at: Date.now() });
        toast.success(`${noun(r.count)} moved to Trash`, {
          action: { label: "Undo", onClick: () => undo() },
          duration: 8000,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [undo, refresh],
  );

  /** `ids` is what the UI shows as sweepable; the server re-applies the same rule. */
  const sweep = useCallback((ids: string[]) => {
    return removeOptimistic(
      ids,
      async () => {
        const r = await json<{ swept: number; state: ClientState; notice?: string }>(await fetch("/api/sweep", { method: "POST", body: "{}" }));
        return { count: r.swept, state: r.state, notice: r.notice };
      },
      (n) => `${n} junk ${n === 1 ? "email" : "emails"}`,
      true,
    );
  }, [removeOptimistic]);

  const trash = useCallback(
    (ids: string[]) =>
      removeOptimistic(
        ids,
        async () => {
          const r = await json<{ trashed: number; state: ClientState; notice?: string }>(
            await fetch("/api/trash", { method: "POST", body: JSON.stringify({ ids }) }),
          );
          return { count: r.trashed, state: r.state, notice: r.notice };
        },
        (n) => (n === 1 ? "Email" : `${n} emails`),
      ),
    [removeOptimistic],
  );

  const post = useCallback(
    (key: string, url: string, body: unknown, method = "POST") =>
      guard(key, async () => {
        const r = await json<ClientState & { state?: ClientState; notice?: string }>(
          await fetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
        );
        setState(r.state ?? r);
        if (r.notice) toast.warning(r.notice);
        return r;
      }),
    [guard],
  );

  /**
   * Re-sorts the inbox after a category change, in the background: the dialog has already closed.
   * Changes made while it runs queue one more pass (the server reads the categories as they are then).
   */
  const resortRunning = useRef(false);
  const resortAgain = useRef(false);
  const resort = useCallback(async (focus?: { id: string; name: string }) => {
    if (resortRunning.current) {
      resortAgain.current = true;
      return;
    }
    resortRunning.current = true;
    const toastId = toast.loading(focus ? `Jev is sorting your inbox into ${focus.name}…` : "Jev is re-sorting your inbox…");
    try {
      let r: ClientState & { notice?: string };
      do {
        resortAgain.current = false;
        r = await json<ClientState & { notice?: string }>(await fetch("/api/categories/resort", { method: "POST" }));
        setState(r);
      } while (resortAgain.current);
      const filed = focus && r.categories.some((c) => c.id === focus.id) ? r.emails.filter((e) => e.analysis?.category === focus.id).length : null;
      toast.success(filed === null ? "Inbox re-sorted" : `Filed ${filed} ${filed === 1 ? "email" : "emails"} in ${focus!.name}`, { id: toastId });
      if (r.notice) toast.warning(r.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id: toastId, description: "The next sync finishes sorting." });
    } finally {
      resortRunning.current = false;
    }
  }, []);

  return {
    state,
    progress,
    busy,
    leaving,
    justSwept,
    clearJustSwept: () => setJustSwept(null),
    sync,
    sweep,
    undo,
    trash,
    updateSettings: (patch: Partial<Settings>) => post("settings", "/api/settings", patch),
    protect: (sender: string, on: boolean) => post("protect", "/api/protect", { sender, protect: on }),
    override: (ids: string[], patch: { category?: string | null; keep?: boolean }) =>
      post("override", "/api/override", { ids, ...patch }),
    /** Optimistic: flip the UNREAD label locally first so the button responds instantly. */
    markRead: (ids: string[], read: boolean) => {
      const set = new Set(ids);
      setState((s) =>
        s
          ? {
              ...s,
              emails: s.emails.map((e) =>
                set.has(e.id) ? { ...e, labelIds: [...e.labelIds.filter((l) => l !== "UNREAD"), ...(read ? [] : ["UNREAD"])] } : e,
              ),
            }
          : s,
      );
      return post("read", "/api/read", { ids, read }).then((r) => {
        if (!r) refresh();
      });
    },
    /** Saves right away (the dialog closes), then sorts in the background. */
    addCategory: async (name: string, description: string) => {
      const r = await post("category", "/api/categories", { name, description });
      const created = r?.categories.at(-1);
      if (created) void resort({ id: created.id, name: created.name });
      return r;
    },
    editCategory: async (id: string, name: string, description: string) => {
      const r = await post("category", "/api/categories", { id, name, description }, "PATCH");
      if (r) void resort({ id, name });
      return r;
    },
    deleteCategory: async (id: string) => {
      const r = await post("category", `/api/categories?id=${id}`, undefined, "DELETE");
      if (r) void resort();
      return r;
    },
    pushToGmail: (id: string) =>
      guard("gmail", async () => {
        const r = await json<{ labeled: number; state: ClientState }>(
          await fetch("/api/categories/gmail", { method: "POST", body: JSON.stringify({ id }) }),
        );
        setState(r.state);
        toast.success(`Labeled ${r.labeled} emails in Gmail`);
      }),
    connectAccount: () =>
      guard("account", async () => {
        const { redirectUrl } = await json<{ redirectUrl: string }>(await fetch("/api/accounts", { method: "POST" }));
        window.location.href = redirectUrl;
      }),
    disconnectAccount: (id: string) => post("account", "/api/accounts", { id }, "DELETE"),
    /** Throws instead of toasting, so the key form can show the error inline. */
    saveComposioKey: async (apiKey: string) => {
      setBusy("composio");
      try {
        setState(await json<ClientState>(await fetch("/api/composio", { method: "POST", body: JSON.stringify({ apiKey }) })));
      } finally {
        setBusy(null);
      }
    },
    removeComposioKey: () => post("composio", "/api/composio", undefined, "DELETE"),
    /** Saves which mailboxes Sift reads, then pulls in their mail. */
    setAccounts: (enabled: string[], { syncAfter = true } = {}) =>
      guard("accounts", async () => {
        const r = await json<{ failed: string[]; state: ClientState }>(
          await fetch("/api/accounts", { method: "PATCH", body: JSON.stringify({ enabled }) }),
        );
        setState(r.state);
        if (r.failed.length) toast.warning(`Couldn't turn on live mail for ${r.failed.join(", ")}`, { description: "Sync still works for it." });
        if (enabled.length && syncAfter) sync();
        return r;
      }),
    search: (query: string) =>
      guard("search", async () =>
        json<{ scores: Record<string, number> }>(await fetch("/api/search", { method: "POST", body: JSON.stringify({ query }) })),
      ),
  };
}

export type Sift = ReturnType<typeof useSift>;
