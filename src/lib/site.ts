/** Absolute site origin for metadata, robots and sitemap: APP_URL, else Vercel's production domain, else local dev. */
export const siteUrl =
  process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
