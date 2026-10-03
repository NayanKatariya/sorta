import { createToken, listTokens, revokeToken, SCOPES, type Scope } from "@/lib/mcp-tokens";
import { body, HttpError, withUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The signed-in user's active access tokens for the MCP server (never the secret itself). */
export const GET = withUser(async (ctx) => Response.json({ tokens: await listTokens(ctx) }));

/** Creates a token. The response carries the secret once; it can't be shown again. */
export const POST = withUser(async (ctx, req) => {
  const { name, scopes, expiresInDays } = await body<{ name?: unknown; scopes?: unknown; expiresInDays?: unknown }>(req, 4096);
  const label = typeof name === "string" ? name.trim() : "";
  if (!label || label.length > 60) throw new HttpError(400, "Give the token a name (up to 60 characters).");
  const picked = scopes === undefined ? (["read"] as Scope[]) : scopes;
  if (!Array.isArray(picked) || !picked.length || picked.some((s) => !SCOPES.includes(s as Scope))) {
    throw new HttpError(400, `Scopes must be a non-empty list of: ${SCOPES.join(", ")}.`);
  }
  if (expiresInDays != null && (typeof expiresInDays !== "number" || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
    throw new HttpError(400, "expiresInDays must be a whole number from 1 to 365, or null for no expiry.");
  }
  const { token, info } = await createToken(ctx, label, [...new Set(picked as Scope[])], (expiresInDays as number | null | undefined) ?? null);
  return Response.json({ token, info }, { status: 201, headers: { "Cache-Control": "no-store" } });
});

/** Revokes a token: ?id=<token id>. Agents using it are refused from their next call. */
export const DELETE = withUser(async (ctx, req) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Say which token to revoke.");
  await revokeToken(ctx, id);
  return Response.json({ tokens: await listTokens(ctx) });
});
