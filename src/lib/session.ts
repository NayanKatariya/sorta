import "server-only";
import type { Ctx } from "./store";
import { createClient } from "./supabase/server";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The signed-in user and an RLS-bound client for them. Checked in every route, not only in the
 * proxy, so a matcher mistake can't open the API. getClaims verifies the JWT signature.
 */
export async function requireUser(): Promise<Ctx & { email: string | null }> {
  const db = await createClient();
  const { data, error } = await db.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) throw new HttpError(401, "Sign in to continue.");
  return { db, userId: sub, email: (data.claims.email as string | undefined) ?? null };
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs a handler for the signed-in user; turns thrown errors into JSON responses. */
export function withUser(fn: (ctx: Ctx, req: Request) => Promise<Response>, failStatus = 502) {
  return async (req: Request) => {
    let ctx: Ctx;
    try {
      ctx = await requireUser();
    } catch (err) {
      return Response.json({ error: errorMessage(err) }, { status: err instanceof HttpError ? err.status : 500 });
    }
    try {
      return await fn(ctx, req);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      console.error(`[api] ${new URL(req.url).pathname} failed`, err);
      return Response.json({ error: errorMessage(err) }, { status: failStatus });
    }
  };
}

/** Parses a JSON body, capped in size; a bad body is the client's fault (400), not a crash. */
export async function body<T>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request body too large.");
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}

export function stringList(v: unknown, max: number, what: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new HttpError(400, `${what} must be a list of strings.`);
  if (v.length > max) throw new HttpError(400, `Too many ${what} (max ${max}).`);
  return v as string[];
}
