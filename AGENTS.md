<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sorta: guide for AI coding agents

Sorta sorts a user's Gmail into categories they describe in plain words and sweeps junk to Trash with undo.
Next.js 16 (App Router) + React 19, Supabase (Auth + Postgres with RLS), Jev (typed judgments over TypeSafe's
`/v1/systemone` API) and Composio (Gmail). Human docs: `README.md`. Every env variable: `.env.example`.

## Setting up a clone

Run these in order and stop at the first failure:

1. `npm install`
2. `npm run setup` creates `.env.local` from `.env.example` and generates `SIFT_SECRET`. It then validates
   everything and prints only names and ✓/✗, never values.
3. Ask the human for the values it reports as missing: Supabase URL, publishable and secret keys, a Jev key,
   and optionally `SUPABASE_DB_URL`. Have them paste the values into `.env.local` themselves.
4. `npm run db:migrate` (needs `SUPABASE_DB_URL`). Without it, tell the human to paste
   `supabase/migrations/*.sql` into the Supabase SQL editor in filename order.
5. `npm run setup` again, until every line is ✓. It pings Supabase and makes one real Jev call.
6. `npm run dev`, then check http://localhost:3000. Signed out it shows the landing page; after sign-up it shows `/welcome`.
7. Remind the human to set Supabase *Authentication → URL Configuration* (Site URL + Redirect URLs).
   This lives only in the dashboard; no script can set it.

Deploying to Vercel: `npx vercel link`, then `npm run vercel:env`, then `npx vercel --prod`. Next run
`npm run vercel:env -- --app-url <prod-url>` and `npx vercel --prod` again, then add the prod URL in Supabase Auth URLs.

## Rules

- **Secrets.** Never print, log, echo or commit a value from `.env.local`. Read names only
  (e.g. `sed -n 's/=.*//p' .env.local`). Test credentials with `npm run setup` / `npm run check:jev`,
  which print outcomes only. `.env*` is gitignored except `.env.example`.
- **User data is isolated by RLS.** Request handlers use `withUser()` / `requireUser()` from
  `src/lib/session.ts`, so every query runs as the signed-in user. Only background work (live mail, quota, logos)
  uses the service-role client from `src/lib/supabase/admin.ts`. There it must still filter on `user_id`.
- **Schema changes** go in a new `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Never edit an applied one.
  Every new table gets `user_id … references auth.users on delete cascade` and RLS policies like the existing ones.
- **Jev** calls live only in `src/lib/jev.ts`. The provider is set by `JEV_API_KEY` / `JEV_BASE_URL` / `JEV_MODEL`.
  The base URL is an API root; `normalizeBaseURL` accepts `/v1` and `/v1/systemone` suffixes and maps
  commandcode.ai web pages to `https://api.commandcode.ai/provider`. If you change that logic, keep
  `scripts/check-jev.mjs` in step.
- **Don't wipe data or push to `master` without the human's explicit say-so.** `master` is protected:
  outside contributions need the owner's approval.

## Next.js 16 and stack specifics

- Middleware is `src/proxy.ts` (exported `proxy`, not `middleware`). It refreshes the Supabase session, sends
  signed-out pages to `/login` (except `/`, `/login` and `/auth/*`), and refuses cross-origin API writes.
- `/` renders the landing page (`src/components/landing/`) for signed-out visitors and the app otherwise.
  A validly signed session whose user was deleted gets redirected to `/auth/signout`, which clears the cookies.
- UI is shadcn on **Base UI** (`components.json` style `base-nova`). Compose with the `render` prop, not `asChild`.
  Tailwind v4, config in `src/app/globals.css`. The root font size is **13px**, so `rem`-based sizes are smaller than
  usual. One font family: JetBrains Mono.
- Animation uses `motion/react`. Honour reduced motion, as the existing components do.
- The theme is `next-themes`, through `src/components/theme-provider.tsx`. The wrapper avoids React 19's
  script-tag warning.

## Before you say you're done

```bash
npx tsc --noEmit -p .
npm run lint
npm run build
```

For UI work, also run it (`npm run dev`) and look at the page in a browser, at desktop and phone widths.
For Jev or env work, run `npm run check:jev`.
