"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "./auth-shell";

type Mode = "signin" | "signup" | "forgot";

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  signin: { title: "Welcome back", subtitle: "Sign in to your inbox.", submit: "Sign in" },
  signup: { title: "Create your account", subtitle: "Setup takes about two minutes.", submit: "Create account" },
  forgot: { title: "Reset your password", subtitle: "We'll email you a link to choose a new one.", submit: "Send reset link" },
};

export function AuthForm({ next, error: initialError, initialMode = "signin" }: { next: string | null; error: string | null; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [sent, setSent] = useState<string | null>(null);
  const copy = COPY[mode];

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign(safeNext(next));
        return;
      }
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(safeNext(next)) } });
        if (error) throw error;
        // With email confirmation off, sign-up signs you straight in.
        if (data.session) {
          window.location.assign(safeNext(next));
          return;
        }
        setSent(`We sent a confirmation link to ${email}. Open it to finish signing up.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback("/auth/reset") });
        if (error) throw error;
        setSent(`If ${email} has an account, a reset link is on its way.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setSent(null);
  };

  return (
    <AuthShell title={copy.title} subtitle={copy.subtitle}>
      {sent ? (
        <div className="space-y-5">
          <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm text-pretty">
            {sent}
          </p>
          <Button variant="outline" size="lg" className="h-10 w-full text-base" onClick={() => switchTo("signin")}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate={false}>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input id="email" className="h-10 text-base md:text-base" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                {mode === "signin" && (
                  <button type="button" onClick={() => switchTo("forgot")} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                className="h-10 text-base md:text-base"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "signup" && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-10 w-full text-base" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {copy.submit}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button type="button" onClick={() => switchTo("signup")} className="text-foreground underline-offset-4 hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <button type="button" onClick={() => switchTo("signin")} className="text-foreground underline-offset-4 hover:underline">
                Back to sign in
              </button>
            )}
          </p>
        </form>
      )}
    </AuthShell>
  );
}
