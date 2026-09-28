import { cn } from "@/lib/utils";

/** Sorta's mark: three bars, shortest last, like a list being sorted. Sized by `className`. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} aria-hidden>
      <rect x="1" y="2" width="14" height="3" rx="1" className="fill-foreground" />
      <rect x="1" y="6.5" width="9.5" height="3" rx="1" className="fill-foreground/70" />
      <rect x="1" y="11" width="5" height="3" rx="1" className="fill-foreground/40" />
    </svg>
  );
}

/** Mark + name. The mark is sized in em, so it stays in proportion at either size. */
export function Wordmark({ size = "lg", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <p className={cn("flex items-center gap-[0.4em] leading-none font-semibold tracking-tight", size === "lg" ? "text-3xl" : "text-xl", className)}>
      <Logo className="size-[1.05em]" />
      sorta
    </p>
  );
}

/**
 * Pages outside the app (sign-in, setup): a brand panel on the left on wide screens, the page on the right.
 * On phones the panel is hidden, so the column starts with a small wordmark instead. `width` sizes the column.
 */
export function SplitShell({ aside, width, children }: { aside: React.ReactNode; width: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden border-r bg-sidebar lg:block">
        <div aria-hidden className="absolute inset-0 bg-[url(/cover.png)] bg-cover bg-center opacity-50" />
        <div className="relative flex h-full flex-col p-10 xl:p-14">{aside}</div>
      </aside>
      <main className="flex min-h-dvh px-5 py-10 sm:px-10">
        <div className={cn("m-auto w-full", width)}>
          <Wordmark size="sm" className="mb-12 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
