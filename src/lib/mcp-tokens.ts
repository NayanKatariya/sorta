import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { adminClient, adminConfigured } from "./supabase/admin";
import { HttpError } from "./session";
import type { Ctx } from "./store";

/** Personal access tokens for the MCP server. Only a SHA-256 of each is stored; the plaintext exists once, at creation. */

export const TOKEN_PREFIX = "sorta_pat_";
export const MAX_TOKENS = 10;
export type Scope = "read" | "send";
export const SCOPES: Scope[] = ["read", "send"];

export type TokenInfo = {
  id: string;
  name: string;
  /** Start of the token, enough to recognise it. */
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};
type TokenRow = {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  scopes: Scope[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

const COLS = "id, user_id, name, token_hash, prefix, scopes, created_at, last_used_at, expires_at, revoked_at";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const toInfo = (r: TokenRow): TokenInfo => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  scopes: r.scopes,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
  expiresAt: r.expires_at,
});
const fail = (what: string, error: { message: string }) => new Error(`Database: ${what} failed (${error.message})`);

// ---- managing tokens (signed-in user, RLS-bound client) ----

export async function listTokens({ db, userId }: Ctx): Promise<TokenInfo[]> {
  // Expired tokens are dead (authenticate refuses them), so they neither show up nor count toward the cap.
  const { data, error } = await db
    .from("mcp_tokens")
    .select(COLS)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });
  if (error) throw fail("reading tokens", error);
  return (data as TokenRow[]).map(toInfo);
}

/** Creates a token. The returned plaintext is the only time it can be seen. */
export async function createToken(ctx: Ctx, name: string, scopes: Scope[], expiresInDays: number | null) {
  if ((await listTokens(ctx)).length >= MAX_TOKENS) throw new HttpError(409, `You can have ${MAX_TOKENS} active tokens. Revoke one first.`);
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const row = {
    user_id: ctx.userId,
    name,
    token_hash: hash(token),
    prefix: token.slice(0, TOKEN_PREFIX.length + 4),
    scopes,
    expires_at: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null,
  };
  const { data, error } = await ctx.db.from("mcp_tokens").insert(row).select(COLS).single();
  if (error) throw fail("creating token", error);
  return { token, info: toInfo(data as TokenRow) };
}

export async function revokeToken({ db, userId }: Ctx, id: string) {
  const { data, error } = await db
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error) throw fail("revoking token", error);
  if (!data?.length) throw new HttpError(404, "Token not found.");
}

// ---- authenticating a request ----

export type McpAuth = { ctx: Ctx; scopes: Scope[]; tokenId: string };

/** last_used_at is only rewritten when it's older than this, so a busy agent doesn't write on every call. */
const TOUCH_MS = 5 * 60_000;

/**
 * Resolves an `Authorization: Bearer` header to the token's owner. There is no session behind an agent, so
 * this uses the service-role client; the returned Ctx names the owner, and every store query filters on it.
 * Returns null for anything unrecognised, revoked or expired (the caller answers 401 without saying which).
 */
export async function authenticate(req: Request): Promise<McpAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  const token = m?.[1];
  // Cheap shape check first: nothing malformed reaches the database.
  if (!token || !token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  if (!adminConfigured()) throw new HttpError(503, "The server isn't set up for agent access (SUPABASE_SECRET_KEY is missing).");

  const digest = hash(token);
  const db = adminClient();
  const { data, error } = await db.from("mcp_tokens").select(COLS).eq("token_hash", digest).maybeSingle();
  if (error) throw fail("reading token", error);
  const row = data as TokenRow | null;
  // The lookup already matched the digest; compare again in constant time so the check doesn't rest on the database's equality.
  if (!row || !timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(digest))) return null;
  if (row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return null;

  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > TOUCH_MS) {
    // Bookkeeping only: failing to stamp must not fail the call.
    await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("user_id", row.user_id).eq("id", row.id);
  }
  return { ctx: { db, userId: row.user_id }, scopes: row.scopes, tokenId: row.id };
}
