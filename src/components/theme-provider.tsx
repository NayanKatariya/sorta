"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * next-themes renders an inline <script> that sets the theme class before first paint. The server HTML needs it
 * runnable; on the client it has already run, and React 19 warns about any <script> it renders there. So the
 * client copy gets a non-JS type (next-themes marks the tag suppressHydrationWarning, so the attribute difference is fine).
 */
const scriptProps = typeof window === "undefined" ? undefined : ({ type: "application/json" } as const);

export function ThemeProvider(props: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider scriptProps={scriptProps} {...props} />;
}
