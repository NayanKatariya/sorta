import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Setup } from "@/components/onboarding/setup";
import { requireUser } from "@/lib/session";
import { readOnboardedAt } from "@/lib/store";

export const metadata: Metadata = { title: "Set up · Sorta" };

export default async function WelcomePage() {
  // Setup is for the first sign-in; afterwards the app has all of it (accounts in the sidebar, rules on ",").
  const ctx = await requireUser().catch(() => null);
  if (ctx && (await readOnboardedAt(ctx))) redirect("/");
  return <Setup />;
}
