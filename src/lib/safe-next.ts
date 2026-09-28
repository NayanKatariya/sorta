/** Only same-site paths: "/x" yes, "//evil.com" or "https://…" no. Keeps redirects from leaving Sorta. */
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
