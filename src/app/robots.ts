import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Only the landing and sign-in pages are public; everything else is behind a session anyway. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/login"], disallow: ["/api/", "/auth/", "/welcome"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
