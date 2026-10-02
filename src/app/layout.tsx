import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// One family for everything, like a terminal. Also used as --font-mono.
const mono = JetBrains_Mono({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const description = "Sort Gmail into categories you describe in plain words, and sweep the junk to Trash with undo.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Sorta: your inbox, sorted in plain words", template: "%s" },
  description,
  applicationName: "Sorta",
  keywords: ["Gmail", "email triage", "inbox zero", "email sorting", "AI email classifier", "Jev"],
  openGraph: {
    type: "website",
    siteName: "Sorta",
    title: "Sorta: your inbox, sorted in plain words",
    description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "Sorta: your inbox, sorted in plain words", description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" offset={{ bottom: 40 }} toastOptions={{ className: "font-sans" }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
