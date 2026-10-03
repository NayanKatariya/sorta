"use client";

import { useMemo } from "react";
import { KeyRound, LogOut, MoreHorizontal, Pencil, Plug, Plus, Settings2, Trash2, Unplug, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import type { Account, Category, ClientState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { inCollection, isToday, type Collection, type Row } from "./model";

type Props = {
  state: ClientState;
  /** Emails already narrowed by the status tab and account; the counts reflect it. */
  scoped: Row[];
  collection: Collection;
  account: string;
  busy: string | null;
  onCollection: (c: Collection) => void;
  onAccount: (id: string) => void;
  onNewCategory: () => void;
  onCompose: () => void;
  /** Opens settings on the AI agents (MCP) tab. */
  onAgents: () => void;
  onEditCategory: (c: Category) => void;
  onDeleteCategory: (c: Category) => void;
  onGmailLabel: (c: Category) => void;
  /** Opens the Composio dialog: the key step until a key is saved, then the account picker. */
  onManageAccounts: () => void;
  onDisconnect: (a: Account) => void;
};

const row = "group flex h-[35px] w-full items-center gap-2 border-b px-3 text-left transition-colors";

export function Sidebar(p: Props) {
  const { state, scoped } = p;
  const items = useMemo(() => {
    const list: { id: Collection; name: string; cat?: Category }[] = [
      { id: "all", name: "Everything" },
      ...state.categories.map((c) => ({ id: c.id, name: c.name, cat: c })),
    ];
    if (state.categories.length) list.push({ id: "uncategorized", name: "Uncategorized" });
    return list.map((it) => ({ ...it, count: scoped.filter((e) => inCollection(e, it.id)).length }));
  }, [state.categories, scoped]);

  const all = state.emails;
  const stats: [number, string][] = [
    [all.filter((e) => isToday(e.date)).length, "today"],
  ];
  const perAccount = (id: string) => all.filter((e) => e.accountId === id).length;
  const accounts = state.accounts.filter((a) => a.enabled);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Logo />
        <span className="font-semibold" translate="no">
          sorta
        </span>
      </div>
      <p className="flex h-8 shrink-0 items-center gap-3 overflow-hidden border-b px-3 whitespace-nowrap text-muted-foreground">
        {stats.map(([n, label]) => (
          <span key={label}>
            <span className="text-foreground tabular-nums">{n.toLocaleString()}</span> {label}
          </span>
        ))}
      </p>

      <button onClick={p.onCompose} className={cn(row, "shrink-0 font-medium hover:bg-muted/60")}>
        <Pencil className="size-3.5" /> compose
        <kbd className="ml-auto rounded-[3px] border bg-muted px-1 text-[11px] leading-4 text-foreground/80 max-md:hidden">C</kbd>
      </button>

      <nav aria-label="Categories" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {items.map((it) => {
          const active = p.collection === it.id;
          return (
            <div key={it.id} className={cn(row, "pr-1", active ? "bg-selected" : "hover:bg-muted/60")}>
              <button onClick={() => p.onCollection(it.id)} aria-current={active ? "page" : undefined} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
                {it.cat && <span className="size-1.5 shrink-0 rounded-full" style={{ background: it.cat.color }} />}
                <span className={cn("truncate", active ? "font-semibold text-foreground" : "text-foreground/85")}>{it.name}</span>
                <span className="ml-auto shrink-0 pl-2 text-muted-foreground tabular-nums">{it.count}</span>
              </button>
              {it.cat ? (
                <CategoryMenu
                  category={it.cat}
                  visible={active}
                  onEdit={() => p.onEditCategory(it.cat!)}
                  onDelete={() => p.onDeleteCategory(it.cat!)}
                  onGmailLabel={() => p.onGmailLabel(it.cat!)}
                />
              ) : (
                <span className="size-6 shrink-0" />
              )}
            </div>
          );
        })}
        <button onClick={p.onNewCategory} className={cn(row, "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
          <Plus className="size-3.5" /> new category
        </button>
        {!state.categories.length && (
          <p className="px-3 py-3 text-pretty text-muted-foreground">
            Categories are written in plain words, e.g. &ldquo;bank statements, UPI receipts, taxes&rdquo;. Jev files matching mail into each one.
          </p>
        )}
      </nav>

      <section aria-label="Accounts" className="shrink-0 border-t">
        <p className="flex h-8 items-center gap-2 border-b px-3 text-muted-foreground">
          accounts
          {accounts.length > 0 && (
            <span
              className="ml-auto flex items-center gap-1.5 text-xs"
              title={state.composio.live ? "New mail arrives on its own through Composio triggers" : "Not receiving new mail live; use sync"}
            >
              <span className={cn("size-1.5 rounded-full", state.composio.live ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/50")} />
              {state.composio.live ? "live" : "offline"}
            </span>
          )}
        </p>
        {accounts.length > 1 && (
          <button onClick={() => p.onAccount("all")} className={cn(row, p.account === "all" ? "bg-selected font-semibold" : "hover:bg-muted/60")}>
            <span className="flex-1 truncate">All accounts</span>
            <span className="text-muted-foreground tabular-nums">{all.length}</span>
            <span className="size-6 shrink-0" />
          </button>
        )}
        {accounts.map((a) => {
          const active = p.account === a.id;
          const ok = a.status === "ACTIVE";
          return (
            <div key={a.id} className={cn(row, "pr-1", active ? "bg-selected" : "hover:bg-muted/60")}>
              <button
                onClick={() => p.onAccount(active ? "all" : a.id)}
                disabled={accounts.length < 2}
                className="flex h-full min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                title={ok ? a.email : `${a.email}: ${a.status.toLowerCase()}, reconnect it`}
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />
                <span className={cn("truncate", active ? "font-semibold" : "text-foreground/85")}>{a.email}</span>
                <span className="ml-auto shrink-0 pl-2 text-muted-foreground tabular-nums">{ok ? perAccount(a.id) : a.status.toLowerCase()}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<MenuButton label={`${a.email} options`} />} />
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={p.onManageAccounts}>
                    <Settings2 /> Manage accounts…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => p.onDisconnect(a)}>
                    <Unplug /> Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        {state.composio.configured ? (
          <button onClick={p.onManageAccounts} className={cn(row, "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
            {accounts.length ? <Settings2 className="size-3.5" /> : <Plus className="size-3.5" />}
            {accounts.length ? "manage accounts" : "choose gmail accounts"}
          </button>
        ) : (
          <button onClick={p.onManageAccounts} className={cn(row, "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
            <KeyRound className="size-3.5" /> add composio api key
          </button>
        )}
        <button onClick={p.onAgents} className={cn(row, "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
          <Plug className="size-3.5" /> ai agents (mcp)
        </button>
        <button
          onClick={async () => {
            await createClient().auth.signOut();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so no signed-in state survives
            window.location.assign("/login");
          }}
          className={cn(row, "border-t text-muted-foreground hover:bg-muted/60 hover:text-foreground")}
        >
          <LogOut className="size-3.5" /> sign out
        </button>
      </section>
    </div>
  );
}

export function CategoryMenu({
  category,
  visible,
  onEdit,
  onDelete,
  onGmailLabel,
}: {
  category: Category;
  visible?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onGmailLabel: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<MenuButton label={`${category.name} options`} visible={visible} />} />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> Edit category…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onGmailLabel}>
          <Upload /> {Object.keys(category.gmailLabels ?? {}).length ? "Re-apply Gmail label" : "Add as Gmail label"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 /> Delete category…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Row "⋯" button: shown on hover/focus, always on the active row and on touch screens. */
function MenuButton({ label, visible, ...props }: React.ComponentProps<"button"> & { label: string; visible?: boolean }) {
  return (
    <button
      {...props}
      aria-label={label}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-100",
        visible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      <MoreHorizontal className="size-3.5" />
    </button>
  );
}
