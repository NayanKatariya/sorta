"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_RECIPIENTS } from "@/lib/send-limits";
import { cn } from "@/lib/utils";
import { json } from "./use-sift";

/* ── Addresses ────────────────────────────────────────────────────────── */

const ADDRESS = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/;

/** Splits "a@x.com, B <b@y.com>; c@z.com" into bare lower-case addresses and whatever didn't parse. */
export function parseAddressText(text: string) {
  const ok: string[] = [];
  const bad: string[] = [];
  // "Name <a@x.com>" counts as the address in the brackets.
  const flat = text.replace(/[^,;\n<]*<([^<>]*)>/g, " $1 ");
  for (const item of flat.split(/[,;\s]+/)) {
    const addr = item.trim().toLowerCase();
    if (!addr) continue;
    if (addr.length <= 254 && ADDRESS.test(addr)) ok.push(addr);
    else bad.push(item.trim());
  }
  return { ok, bad };
}

const unique = (list: string[]) => [...new Set(list)];

/** The chips plus the half-typed text of one address field. */
export function useAddresses(initial: string[]) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const pending = parseAddressText(draft);
  return {
    list,
    setList,
    draft,
    setDraft,
    /** Chips plus any complete address still sitting in the input. */
    all: unique([...list, ...pending.ok]),
    /** Typed text that isn't an address, so sending must wait. */
    bad: pending.bad,
  };
}
export type Addresses = ReturnType<typeof useAddresses>;

/** Chip-style address input: Enter, comma, space or blur turns the text into a chip; paste splits lists. */
export function AddressField({
  id,
  field,
  label,
  placeholder,
  autoFocus,
  disabled,
  max = MAX_RECIPIENTS,
}: {
  id: string;
  field: Addresses;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  max?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { list, draft } = field;
  // Flagged only once the user tries to finish an address, not while it's still being typed.
  const [checked, setChecked] = useState(false);
  const invalid = checked && field.bad.length > 0;

  /** Moves the complete addresses out of the input into chips; anything else stays for the user to fix. */
  const commit = (text = draft) => {
    const { ok, bad } = parseAddressText(text);
    if (ok.length) {
      if (unique([...list, ...ok]).length > max) toast.error(`${label} can hold up to ${max} addresses.`);
      field.setList((l) => unique([...l, ...ok]).slice(0, max));
    }
    field.setDraft(bad.join(" "));
    setChecked(bad.length > 0);
  };

  return (
    <div className="space-y-1">
      <div
        onClick={() => ref.current?.focus()}
        className={cn(
          "flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-input px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          invalid && "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {list.map((a) => (
          <span key={a} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs">
            <span className="truncate">{a}</span>
            <button
              type="button"
              aria-label={`Remove ${a} from ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                field.setList((l) => l.filter((x) => x !== a));
              }}
              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={ref}
          id={id}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            // A trailing comma, semicolon or space finishes the address.
            if (/[,;\s]$/.test(v) && v.trim()) commit(v);
            else {
              field.setDraft(v);
              setChecked(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && list.length) field.setList((l) => l.slice(0, -1));
          }}
          onBlur={() => draft.trim() && commit()}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!/[,;\s]/.test(text.trim())) return;
            e.preventDefault();
            commit(draft + text);
          }}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="off"
          aria-label={label}
          aria-invalid={invalid}
          placeholder={list.length ? undefined : placeholder}
          className="h-6 min-w-[8ch] flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      {invalid && (
        <p role="alert" className="text-xs text-destructive">
          “{field.bad[0]}” isn&apos;t a valid email address.
        </p>
      )}
    </div>
  );
}

/* ── Attachments ──────────────────────────────────────────────────────── */

export function fileSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Adds files while they fit the per-message limits the server enforces; says why for the ones that don't. */
export function addFiles(current: File[], incoming: File[]): File[] {
  const next = [...current];
  let total = next.reduce((n, f) => n + f.size, 0);
  for (const f of incoming) {
    if (!f.size) toast.error(`“${f.name}” is empty.`);
    else if (next.length >= MAX_ATTACHMENTS) toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    else if (total + f.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`“${f.name}” doesn't fit`, { description: `Attachments are limited to ${fileSize(MAX_ATTACHMENT_BYTES)} per message (${fileSize(total)} used).` });
    } else {
      next.push(f);
      total += f.size;
    }
  }
  return next;
}

/** Drag-and-drop handlers for any element; `dragging` highlights the drop zone while files hover over it. */
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return {
    dragging,
    bind: {
      onDragOver: (e: React.DragEvent) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        onFiles(Array.from(e.dataTransfer.files));
      },
    },
  };
}

/** The file list with remove buttons and a picker button; pass `files` and `onFiles` from the owner's state. */
export function AttachmentList({ files, onFiles, disabled }: { files: File[]; onFiles: (f: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, f) => n + f.size, 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
          <Paperclip /> Attach files
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          onChange={(e) => {
            onFiles(addFiles(files, Array.from(e.target.files ?? [])));
            e.target.value = "";
          }}
        />
        <span className="text-xs text-muted-foreground tabular-nums max-sm:hidden">
          {files.length ? `${fileSize(total)} of ${fileSize(MAX_ATTACHMENT_BYTES)}` : `or drop files here, up to ${fileSize(MAX_ATTACHMENT_BYTES)}`}
        </span>
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Attachments">
          {files.map((f, i) => (
            <li key={`${f.name}:${i}`} className="flex max-w-full items-center rounded-md border bg-muted/30 text-xs">
              <FileText className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate px-1.5 py-1">{f.name}</span>
              <span className="shrink-0 pr-1 text-muted-foreground tabular-nums">{fileSize(f.size)}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                onClick={() => onFiles(files.filter((_, j) => j !== i))}
                className="grid size-6 shrink-0 place-items-center rounded-r-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Highlight laid over a drop zone while files are dragged onto it. */
export function DropOverlay({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <div className={cn("pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-foreground/40 bg-background/80 text-sm font-medium", className)}>
      Drop to attach
    </div>
  );
}

/* ── Sending ──────────────────────────────────────────────────────────── */

export type Sent = { from: string; to: string[]; cc: string[]; bcc: string[]; subject: string; attachments: number };

/** POSTs a multipart form to the send or reply route. The browser sets the boundary, so no content-type header. */
export async function postForm(url: string, fields: [string, string | File][]): Promise<Sent> {
  const form = new FormData();
  for (const [k, v] of fields) form.append(k, v);
  const r = await json<{ sent: Sent }>(await fetch(url, { method: "POST", body: form }));
  return r.sent;
}
