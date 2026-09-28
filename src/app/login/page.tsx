import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { safeNext } from "@/lib/safe-next";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · Sorta" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const q = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  // Already signed in: straight on to where they were going.
  if (await requireUser().catch(() => null)) redirect(safeNext(pick(q.next)));
  return <AuthForm next={pick(q.next)} error={pick(q.error)} initialMode={pick(q.mode) === "signup" ? "signup" : "signin"} />;
}
