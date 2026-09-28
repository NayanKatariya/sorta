#!/usr/bin/env node
/**
 * Smoke test for auth and per-user isolation against a running Sorta (default http://localhost:3000).
 * Needs two confirmed accounts:
 *   E2E_A_EMAIL / E2E_B_EMAIL and E2E_PASSWORD (both accounts share it), plus the Supabase env.
 *   node --env-file=.env.local scripts/e2e-auth-check.mjs [baseUrl]
 */
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

/** Signs in the way the browser would and returns the auth cookies + a data client. */
async function signIn(email) {
  const jar = new Map();
  const sb = createServerClient(URL_, KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: process.env.E2E_PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { sb, userId: data.user.id, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
}

const api = (who, path, init = {}) =>
  fetch(BASE + path, {
    redirect: "manual",
    ...init,
    headers: { ...(who ? { cookie: who.cookie } : {}), ...(init.method && init.method !== "GET" ? { origin: BASE } : {}), ...init.headers },
  });

// ---- signed out ----
let r = await api(null, "/");
check("signed-out page redirects to /login", r.status === 307 && r.headers.get("location")?.includes("/login"), `${r.status} ${r.headers.get("location")}`);
r = await api(null, "/api/state");
check("signed-out API is 401", r.status === 401, String(r.status));
r = await api(null, "/api/logo?d=github.com");
check("signed-out logo is 401", r.status === 401, String(r.status));
r = await api(null, "/login");
check("login page is public", r.status === 200, String(r.status));
r = await api(null, "/auth/callback?next=//evil.example");
check("callback without code doesn't go off-site", !(r.headers.get("location") ?? "").includes("evil.example"), r.headers.get("location") ?? "");

const A = await signIn(process.env.E2E_A_EMAIL);
const B = await signIn(process.env.E2E_B_EMAIL);

// ---- CSRF ----
r = await fetch(BASE + "/api/settings", { method: "POST", headers: { cookie: A.cookie }, body: "{}" });
check("POST without Origin is refused", r.status === 403, String(r.status));
r = await fetch(BASE + "/api/settings", { method: "POST", headers: { cookie: A.cookie, origin: "https://evil.example" }, body: "{}" });
check("cross-origin POST is refused", r.status === 403, String(r.status));

// ---- OAuth return without the matching one-time state does nothing ----
r = await api(A, "/api/accounts/callback/forged-state?status=success");
check("forged Composio callback is refused", (r.headers.get("location") ?? "").includes("account=failed"), r.headers.get("location") ?? String(r.status));

// ---- first-run walkthrough: shown until finished, then never again ----
r = await api(A, "/api/state");
check("state reports onboardedAt (null until the walkthrough is finished)", r.status === 200 && "onboardedAt" in (await r.json()), String(r.status));
r = await api(A, "/api/settings", { method: "POST", body: JSON.stringify({ onboarded: true }) });
check("finishing the walkthrough sets onboardedAt", r.status === 200 && Boolean((await r.json()).onboardedAt), String(r.status));
r = await api(A, "/api/settings", { method: "POST", body: JSON.stringify({ onboarded: false }) });
check("walkthrough can't be un-finished through the API", Boolean((await r.json()).onboardedAt));

// ---- A sets things up ----
r = await api(A, "/api/state");
check("A reads own state", r.status === 200, String(r.status));
r = await api(A, "/api/settings", { method: "POST", body: JSON.stringify({ fetchLimit: 999999, threshold: 5, sweepKinds: ["spam", "not_junk", "bogus"] }) });
const st = await r.json();
check("settings are clamped/filtered", st.settings?.fetchLimit === 1000 && st.settings?.threshold === 0.99 && JSON.stringify(st.settings?.sweepKinds) === '["spam"]', JSON.stringify(st.settings));
r = await api(A, "/api/settings", { method: "POST", body: "not json" });
check("bad JSON is 400", r.status === 400, String(r.status));
r = await api(A, "/api/categories", { method: "POST", body: JSON.stringify({ name: "A private", description: "x".repeat(600) }) });
check("over-long category description is 400", r.status === 400, String(r.status));
r = await api(A, "/api/categories", { method: "POST", body: JSON.stringify({ name: "A private", description: "receipts" }) });
const aCat = (await r.json()).categories?.find((c) => c.name === "A private");
check("A creates a category", Boolean(aCat), String(r.status));

// A plants an account + email directly via the Data API (as A), so B has something to aim at.
await A.sb.from("accounts").upsert({ user_id: A.userId, id: "e2e_acc", composio_user_id: "x", email: "a@e2e.test", status: "ACTIVE", enabled: true });
await A.sb.from("emails").upsert({ user_id: A.userId, id: "e2e_msg", account_id: "e2e_acc", date: new Date().toISOString(), folder: "inbox", subject: "secret" });

// ---- B tries to reach A's data ----
r = await api(B, "/api/state");
const bState = await r.json();
check("B's state has none of A's categories", !bState.categories?.some((c) => c.id === aCat?.id));
check("B's state has none of A's emails", !bState.emails?.some((e) => e.id === "e2e_msg"));
check("B's state has none of A's accounts", !bState.accounts?.some((a) => a.id === "e2e_acc"));
r = await api(B, "/api/categories", { method: "PATCH", body: JSON.stringify({ id: aCat?.id, name: "pwned" }) });
check("B can't edit A's category", r.status === 404, String(r.status));
r = await api(B, `/api/categories?id=${aCat?.id}`, { method: "DELETE" });
check("B can't delete A's category", r.status === 404, String(r.status));
r = await api(B, "/api/thread?id=e2e_msg");
check("B can't open A's thread", r.status === 404, String(r.status));
r = await api(B, "/api/attachment?email=e2e_msg&message=e2e_msg&id=x&name=x");
check("B can't fetch A's attachment", r.status === 404, String(r.status));
r = await api(B, "/api/trash", { method: "POST", body: JSON.stringify({ ids: ["e2e_msg"] }) });
check("B can't trash A's mail", r.status === 200 && (await r.json()).trashed === 0, String(r.status));
r = await api(B, "/api/accounts", { method: "DELETE", body: JSON.stringify({ id: "e2e_acc" }) });
check("B can't disconnect A's account", r.status !== 200, String(r.status));
r = await api(B, "/api/override", { method: "POST", body: JSON.stringify({ ids: ["e2e_msg"], keep: true }) });
check("B's override of A's mail is a no-op", r.status === 200);

// B straight at the Data API with its own JWT.
const q = await B.sb.from("emails").select("id").eq("id", "e2e_msg");
check("Data API: B reads 0 of A's emails", (q.data ?? []).length === 0, JSON.stringify(q.error));
const q2 = await B.sb.from("composio_credentials").select("*");
check("Data API: B reads no credentials but its own", (q2.data ?? []).every((row) => row.user_id === B.userId));
const q3 = await B.sb.from("jev_usage").select("*");
check("Data API: jev_usage is closed", Boolean(q3.error), q3.error?.code ?? "no error");
const q4 = await B.sb.rpc("consume_jev_quota", { p_user: B.userId, p_calls: -100000, p_limit: 10 });
check("Data API: consume_jev_quota is not callable by users", Boolean(q4.error), q4.error?.code ?? "no error");
const q5 = await A.sb.from("user_state").update({ fetch_limit: 100000 }).eq("user_id", A.userId);
check("Data API: CHECK stops fetch_limit=100000", Boolean(q5.error), q5.error?.code ?? "no error");

// A still has everything.
const mine = await A.sb.from("emails").select("subject").eq("id", "e2e_msg").single();
check("A's email untouched", mine.data?.subject === "secret");

// ---- clean up ----
await api(A, `/api/categories?id=${aCat?.id}`, { method: "DELETE" });
await A.sb.from("accounts").delete().eq("id", "e2e_acc");
console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
