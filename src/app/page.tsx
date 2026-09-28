import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";
import { AppShell } from "@/components/sift/app-shell";
import { HttpError, requireUser } from "@/lib/session";
import { readOnboardedAt } from "@/lib/store";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Signed-out visitors get the landing page; first sign-in goes through setup.
  const ctx = await requireUser().catch(() => null);
  if (!ctx) return <Landing />;
  // A signed session whose user was deleted: clear its cookies (only a route handler can) and start over.
  const onboardedAt = await readOnboardedAt(ctx).catch((err) => {
    if (err instanceof HttpError && err.status === 401) redirect("/auth/signout");
    throw err;
  });
  if (!onboardedAt) {
    // Keep ?account=… so setup can say whether connecting a Gmail account worked.
    const account = (await searchParams).account;
    redirect(typeof account === "string" ? `/welcome?account=${encodeURIComponent(account)}` : "/welcome");
  }
  return <AppShell />;
}
