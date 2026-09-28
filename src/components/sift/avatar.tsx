"use client";

import { useState } from "react";
import { logoDomain, senderAddress, senderName } from "@/lib/policy";
import { cn } from "@/lib/utils";
import { avatarHue } from "./model";

function initials(from: string) {
  return (
    senderName(from)
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

/** Domains whose logo failed to load this session, so every other row skips straight to the fallback. */
const failed = new Set<string>();

/** The sender's brand logo (one per organisation domain), or `fallback` if there isn't one. */
export function SenderLogo({ from, className, fallback = null }: { from: string; className?: string; fallback?: React.ReactNode }) {
  const domain = logoDomain(senderAddress(from));
  const [broken, setBroken] = useState<string | null>(null);
  if (!domain || broken === domain || failed.has(domain)) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny cached icons; next/image adds nothing here
    <img
      src={`/api/logo?d=${domain}`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        failed.add(domain);
        setBroken(domain);
      }}
      className={cn("size-6 shrink-0 rounded-[3px] object-contain", className)}
    />
  );
}

/** Square sender tile: the brand logo when we have one, else coloured initials. */
export function SenderTile({ from, className }: { from: string; className?: string }) {
  return (
    <SenderLogo
      from={from}
      className={className}
      fallback={
        <span
          aria-hidden
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-[3px] text-[9px] font-semibold tracking-tight",
            "bg-[oklch(0.9_0.05_var(--h))] text-[oklch(0.35_0.1_var(--h))] dark:bg-[oklch(0.3_0.06_var(--h))] dark:text-[oklch(0.88_0.07_var(--h))]",
            className,
          )}
          style={{ "--h": avatarHue(senderAddress(from)) } as React.CSSProperties}
        >
          {initials(from)}
        </span>
      }
    />
  );
}
