import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Reachable without signing in (`/` shows the landing page then). Everything else, pages and API alike, needs a session. */
const PUBLIC = [/^\/$/, /^\/login$/, /^\/auth\//];

/**
 * The request's Origin must be this site: the host the browser addressed (Host, or X-Forwarded-Host
 * behind a proxy), or APP_URL. Not nextUrl.origin: Next normalises that to the host it's bound to,
 * which behind a proxy or on 127.0.0.1 isn't what the browser sent. A cross-site page can't set these headers.
 */
function sameSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = [request.headers.get("x-forwarded-host")?.split(",")[0].trim(), request.headers.get("host")];
  if (process.env.APP_URL) allowed.push(new URL(process.env.APP_URL).host);
  return allowed.some((h) => h && h.toLowerCase() === host.toLowerCase());
}

/**
 * Refreshes the Supabase session on every request (Server Components can't write cookies) and
 * keeps signed-out visitors out: pages redirect to /login, API calls get 401.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Cookie auth + state-changing requests: refuse ones another site made the browser send.
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameSite(request)) {
    return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });

  // getClaims verifies the token's signature; getSession would trust whatever the cookie says.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  if (signedIn || PUBLIC.some((p) => p.test(pathname))) return response;

  const blocked = isApi
    ? NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
    : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + request.nextUrl.search)}`, request.url));
  // Carry any refreshed/cleared cookies and the no-cache headers over.
  for (const c of response.cookies.getAll()) blocked.cookies.set(c);
  for (const h of ["cache-control", "expires", "pragma"]) {
    const v = response.headers.get(h);
    if (v) blocked.headers.set(h, v);
  }
  return blocked;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|cover.png|favicon.ico).*)"],
};
