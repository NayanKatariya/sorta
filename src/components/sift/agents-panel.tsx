"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Scope, TokenInfo } from "@/lib/mcp-tokens";
import { cn } from "@/lib/utils";
import { ago } from "./model";
import { json } from "./use-sift";

const EXPIRIES = [
  { days: 0, label: "Never expires" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

const SCOPE_HINT: Record<Scope, string> = {
  read: "List categories, search and read your mail",
  send: "Also send new emails and replies as you",
};

/** Connect Claude, Codex, Cursor or any MCP client: access tokens plus ready-made config. */
export type FreshSecret = { id: string; token: string; name: string };

/** `fresh` lives in the parent so the secret survives switching settings tabs or closing the dialog. */
export function AgentsPanel({ fresh, onFresh }: { fresh: FreshSecret | null; onFresh: (f: FreshSecret | null) => void }) {
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<TokenInfo | null>(null);
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const url = `${origin}/api/mcp`;

  const load = useCallback(async () => {
    try {
      setTokens((await json<{ tokens: TokenInfo[] }>(await fetch("/api/mcp-tokens"))).tokens);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    fetch("/api/mcp-tokens")
      .then((r) => json<{ tokens: TokenInfo[] }>(r))
      .then((r) => setTokens(r.tokens))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">
        Let an AI agent work with your mail over MCP. It signs in with an access token you create here and can only do what you allow. Revoke a
        token and the agent loses access straight away.
      </p>

      {fresh && <FreshToken token={fresh.token} name={fresh.name} onDone={() => onFresh(null)} />}

      <div className="space-y-2">
        <p className="text-sm font-medium">Access tokens</p>
        {tokens === null && !loadError && <Skeleton className="h-12 w-full" />}
        {loadError && (
          <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            Couldn&apos;t load your tokens: {loadError}
          </p>
        )}
        {tokens?.length === 0 && <p className="rounded-lg border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">No tokens yet.</p>}
        {tokens?.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-medium">{t.name}</span>
                {t.scopes.map((s) => (
                  <span key={s} className={cn("rounded-full px-1.5 text-[11px]", s === "send" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                    {s}
                  </span>
                ))}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{t.prefix}…</span> · created {ago(t.createdAt)} · {t.lastUsedAt ? `used ${ago(t.lastUsedAt)}` : "never used"}
                {t.expiresAt && ` · expires ${new Date(t.expiresAt).toLocaleDateString()}`}
              </p>
            </div>
            <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setRevoke(t)} aria-label={`Revoke ${t.name}`}>
              <Trash2 /> <span className="max-sm:hidden">Revoke</span>
            </Button>
          </div>
        ))}
      </div>

      <NewToken
        disabled={!tokens || tokens.length >= 10}
        full={(tokens?.length ?? 0) >= 10}
        onCreated={(token, info) => {
          onFresh({ id: info.id, token, name: info.name });
          setTokens((t) => [info, ...(t ?? [])]);
        }}
      />

      <Snippets url={url} token={fresh?.token} />

      <AlertDialog open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoke?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Any agent using this token is refused from its next request. This can&apos;t be undone; create a new token to reconnect it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const t = revoke!;
                setRevoke(null);
                try {
                  setTokens((await json<{ tokens: TokenInfo[] }>(await fetch(`/api/mcp-tokens?id=${t.id}`, { method: "DELETE" }))).tokens);
                  if (fresh && fresh.id === t.id) onFresh(null);
                  toast.success(`Revoked “${t.name}”`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                  void load();
                }
              }}
            >
              Revoke token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewToken({ disabled, full, onCreated }: { disabled: boolean; full: boolean; onCreated: (token: string, info: TokenInfo) => void }) {
  const [name, setName] = useState("");
  const [send, setSend] = useState(false);
  const [days, setDays] = useState(90);
  const [creating, setCreating] = useState(false);

  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/20 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
          const r = await json<{ token: string; info: TokenInfo }>(
            await fetch("/api/mcp-tokens", {
              method: "POST",
              body: JSON.stringify({ name: name.trim(), scopes: send ? ["read", "send"] : ["read"], expiresInDays: days || null }),
            }),
          );
          onCreated(r.token, r.info);
          setName("");
          setSend(false);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err));
        } finally {
          setCreating(false);
        }
      }}
    >
      <p className="text-sm font-medium">New token</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name, e.g. Claude Code on my laptop" aria-label="Token name" autoComplete="off" />
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Expiry"
          className="h-8 shrink-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-popover"
        >
          {EXPIRIES.map((x) => (
            <option key={x.days} value={x.days}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-3 text-sm opacity-70">
          <Checkbox checked disabled />
          <span>
            <span className="font-medium">Read</span> <span className="text-xs text-muted-foreground">{SCOPE_HINT.read}</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Checkbox checked={send} onCheckedChange={(v) => setSend(Boolean(v))} />
          <span>
            <span className="font-medium">Send</span> <span className="text-xs text-muted-foreground">{SCOPE_HINT.send}</span>
          </span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={disabled || creating || !name.trim()}>
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} Create token
        </Button>
        {full && <span className="text-xs text-muted-foreground">You have 10 tokens. Revoke one to create another.</span>}
      </div>
    </form>
  );
}

/** Shown once, right after creation. */
function FreshToken({ token, name, onDone }: { token: string; name: string; onDone: () => void }) {
  return (
    <div role="status" className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
      <p className="text-sm font-medium">Token “{name}” created</p>
      <p className="text-xs text-muted-foreground">Copy it now. For your security it won&apos;t be shown again.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md bg-background px-2 py-1.5 font-mono text-xs break-all select-all">{token}</code>
        <CopyButton text={token} label="Copy token" />
      </div>
      <Button variant="outline" size="xs" onClick={onDone}>
        I&apos;ve saved it
      </Button>
    </div>
  );
}

function CopyButton({ text, label = "Copy", icon = false }: { text: string; label?: string; icon?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size={icon ? "icon-xs" : "sm"}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it by hand.");
        }
      }}
    >
      {done ? <Check className="text-emerald-600" /> : <Copy />}
      {!icon && (done ? "Copied" : label)}
    </Button>
  );
}

/** Config for each client. The real token goes in right after creating one; otherwise a placeholder. */
function Snippets({ url, token }: { url: string; token?: string }) {
  const t = token ?? "YOUR_TOKEN";
  const clients = [
    {
      id: "claude",
      label: "Claude Code",
      note: "Run once in your terminal. Add --scope user to use it in every project. Claude Desktop and claude.ai connectors need OAuth, which Sorta doesn't offer yet.",
      code: `claude mcp add --transport http sorta ${url} \\\n  --header "Authorization: Bearer ${t}"`,
    },
    {
      id: "codex",
      label: "Codex",
      note: "Keep the token in an environment variable, then add the server to ~/.codex/config.toml (or run: codex mcp add sorta --url … --bearer-token-env-var SORTA_TOKEN).",
      code: `export SORTA_TOKEN="${t}"\n\n# ~/.codex/config.toml\n[mcp_servers.sorta]\nurl = "${url}"\nbearer_token_env_var = "SORTA_TOKEN"`,
    },
    {
      id: "cursor",
      label: "Cursor",
      note: "Save as .cursor/mcp.json in a project, or ~/.cursor/mcp.json for all projects.",
      code: JSON.stringify({ mcpServers: { sorta: { url, headers: { Authorization: `Bearer ${t}` } } } }, null, 2),
    },
    {
      id: "other",
      label: "Other",
      note: "Any client that speaks MCP over Streamable HTTP. Send the token as a Bearer header on every request.",
      code: `URL:       ${url}\nTransport: Streamable HTTP (stateless, JSON responses)\nHeader:    Authorization: Bearer ${t}\n\n# quick test\ncurl -s ${url} \\\n  -H "Authorization: Bearer ${t}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Connect a client</p>
        <span className="flex min-w-0 items-center gap-1.5">
          <code className="truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{url}</code>
          <CopyButton text={url} label="Copy MCP URL" icon />
        </span>
      </div>
      <Tabs defaultValue="claude">
        <TabsList className="w-full">
          {clients.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {clients.map((c) => (
          <TabsContent key={c.id} value={c.id} className="space-y-2">
            <p className="text-xs text-muted-foreground">{c.note}</p>
            <div className="relative">
              <pre className="scroll-thin overflow-x-auto rounded-lg border bg-muted/40 p-3 pr-10 font-mono text-xs leading-relaxed">{c.code}</pre>
              <div className="absolute top-1.5 right-1.5">
                <CopyButton text={c.code} label={`Copy ${c.label} setup`} icon />
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      {!token && <p className="text-xs text-muted-foreground">Replace YOUR_TOKEN with a token above. Create one and this fills itself in.</p>}
    </div>
  );
}
