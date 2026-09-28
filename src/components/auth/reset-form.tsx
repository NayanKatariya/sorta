"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "./auth-shell";

/** Reached from the reset email (via /auth/callback, which signed the user in). */
export function ResetForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthShell title="Choose a new password">
      <form
        className="space-y-5"
        onSubmit={async (ev) => {
          ev.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const { error } = await createClient().auth.updateUser({ password });
            if (error) throw error;
          } catch (e) {
            // No recovery session (link expired, or opened elsewhere) lands here too.
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
            return;
          }
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so no signed-in state survives
          window.location.assign("/");
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            New password
          </label>
          <Input id="password" className="h-10 text-base md:text-base" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-10 w-full text-base" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}
