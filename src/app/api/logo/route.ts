import { getLogo } from "@/lib/logos";
import { logoDomain } from "@/lib/policy";
import { requireUser } from "@/lib/session";

/** GET /api/logo?d=upwork.com → the sender's brand logo, or 404 so the UI keeps its initials tile. */
export async function GET(req: Request) {
  // Fetching a logo makes outbound requests, so only signed-in users can trigger it.
  if (!(await requireUser().catch(() => null))) return new Response(null, { status: 401 });
  const d = new URL(req.url).searchParams.get("d")?.toLowerCase() ?? "";
  // Only bare organisation domains, so each platform maps to exactly one cached file.
  if (logoDomain(`x@${d}`) !== d) return new Response(null, { status: 400 });

  const logo = await getLogo(d);
  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
  return new Response(new Uint8Array(logo.body), {
    headers: {
      "Content-Type": logo.type,
      "Cache-Control": "private, max-age=604800, immutable",
      // Logos come from third parties; an SVG opened directly must not run anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
