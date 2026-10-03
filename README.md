# Sorta: Gmail triage with Jev + Composio

Sorts your Gmail into categories **you** define in plain English, and removes junk and spam in one click.

- **Gmail access**: [Composio](https://composio.dev). Each user brings their own Composio API key; it holds the Gmail OAuth connections.
- **Understanding mail**: [Jev](https://commandcode.ai/models/jev) (`typesafe/jev`), through TypeSafe, Command Code's provider API, or any compatible endpoint. Jev returns typed answers and calibrated probabilities. It doesn't generate text.
- **Accounts and data**: Supabase Auth + Postgres with row-level security.
- **UI**: Next.js 16, shadcn/ui on Base UI, cmdk command menu, Sonner toasts, Magic UI number ticker.
  Design rules come from Emil Kowalski's design-engineering notes, ibelick's Baseline UI, Vercel's Web Interface Guidelines (Rauno Freiberg) and Laws of UX. All were found through designeer.xyz.

## Features

| | |
|---|---|
| **One-click junk sweep** | Jev labels every email as scam/phishing, spam, promotion, newsletter, social ping, or not junk. One button moves everything that matches your rules, plus Gmail's Spam folder, to Trash. You can **undo** it. |
| **Dynamic categories** | Create a category with a name and a one-line description ("bank statements, UPI receipts, taxes"). Jev re-sorts the whole inbox right away. You can edit, delete, or push a category to Gmail as a `Sorted/<name>` label. |
| Sweep rules | Pick which junk kinds to sweep and how sure Jev must be (threshold). These apply instantly without re-scanning, because Jev's probabilities are stored. |
| Protected senders | Addresses or domains that are never swept. Starred mail is never swept either. |
| Needs attention | Jev scores how much each email needs you (0–3) and whether a person expects a reply. |
| Ask Jev search | Describe what you want ("receipts for things I bought"). Jev checks each email. You can save the search as a category. |
| Top senders | Who fills your inbox, the share of their mail that's junk, and trash-all or keep for each sender. |

## Using it

The layout is a terminal-style collections browser in JetBrains Mono. It has **two filters that combine**:

- **Left column: categories** (`Everything`, each category, `Uncategorized`) with counts. Hover a category and use `⋯` to edit, add it as a Gmail label, or delete it. Below them is the **accounts** list.
- **Top tabs: state** (`all · inbox · needs you · unread · junk · spam`).

Each filter's counts are computed within the other. For example, `Job hunt` + `unread` shows the tab counts for Job hunt, and the column counts for unread mail.
`View:` switches between **List** (dense rows), **Cards** (masonry; categorised mail gets a cover tinted by sender) and **Senders**. Pick an email to open the reading pane with Jev's read and the corrections.

| Key | Action |
|---|---|
| `J` / `K` | Next / previous |
| `1`–`6` | Switch the state tab |
| `⌥↑` / `⌥↓` | Switch category |
| `E` | Move to Trash, then open the next email |
| `V` | Cycle List → Cards → Senders |
| `/` | Filter; ↵ asks Jev instead |
| `⇧N` or `C` | New category |
| `,` | Sweep rules |
| `⌘K` | Command menu |
| `⌘\` | Hide or show the category column |
| `Esc` | Close the reading pane |

- **Sweep**: the red `sweep N` button in the header moves every email matching your rules to Trash in one click. Undo is available afterwards.
- **Corrections stick**: "Move to" files an email by hand, and Jev won't re-sort it. "Not junk" means it's never swept.
- The URL keeps both filters, the view and the open email (`?c=…&s=…&v=…&m=…`).

## Connect AI agents (MCP)

Sorta runs a remote [MCP](https://modelcontextprotocol.io) server (Streamable HTTP, stateless) at `<your-app-url>/api/mcp`, so Claude, Codex, Cursor and other agents can read your mail and send or reply as you.

1. Create a personal access token (`POST /api/mcp-tokens` with `{"name": "Claude Code", "scopes": ["read", "send"]}`, or in the app's AI agents panel). It looks like `sorta_pat_...` and is shown **once**; only its SHA-256 is stored. Give it `read` to browse mail, plus `send` to let the agent send and reply. Tokens can expire and be revoked at any time (`DELETE /api/mcp-tokens?id=...`); you can have up to 10 active.
2. Add the server to your agent:

```bash
# Claude Code
claude mcp add --transport http sorta https://YOUR-APP/api/mcp --header "Authorization: Bearer sorta_pat_..."
```

```toml
# Codex: ~/.codex/config.toml (export SORTA_TOKEN=sorta_pat_... first)
[mcp_servers.sorta]
url = "https://YOUR-APP/api/mcp"
bearer_token_env_var = "SORTA_TOKEN"
```

```json
// Cursor: ~/.cursor/mcp.json (or .cursor/mcp.json in a project)
{ "mcpServers": { "sorta": { "url": "https://YOUR-APP/api/mcp", "headers": { "Authorization": "Bearer sorta_pat_..." } } } }
```

Any other client that speaks Streamable HTTP: POST JSON-RPC to the URL with the header `Authorization: Bearer sorta_pat_...`. Missing or bad tokens get `401` with a `WWW-Authenticate` header.

| Tool | Scope | What it does |
|---|---|---|
| `list_accounts`, `list_categories`, `get_send_settings` | read | Connected mailboxes, your categories with counts, and your sending defaults |
| `list_emails`, `search_emails` | read | Synced mail filtered by category, account, folder, unread; paged with `limit`/`offset`. Search matches sender, subject and preview |
| `get_thread` | read | A whole conversation from Gmail, with attachment names and types |
| `send_email` | send | New message with `to`, `cc`, `bcc`, `subject`, `body`, optional `from` account and `attachments` (`[{filename, mimeType, contentBase64}]`) |
| `reply_to_thread` | send | Reply by `emailId` (or `threadId` + `accountId`), with `replyAll`, `cc`, `bcc` and attachments |

Your default CC/BCC and signature from Settings are applied to every send an agent makes. Attachments are capped at 4 MB per message (less in practice on Vercel, whose request limit is 4.5 MB). Tokens act as you: revoke any you no longer use.

## Setup

Sorta is multi-user: each person signs in, and brings their own Composio key for Gmail. Data lives in
Supabase Postgres with row-level security, so one account can never read another's mail.

You need Node 20+, a [Supabase](https://supabase.com) project and a Jev key
([Command Code](https://commandcode.ai/models/jev) or [TypeSafe](https://typesafe.ai)).

### Quick start

```bash
git clone https://github.com/NayanKatariya/sorta.git && cd sorta
npm install
npm run setup        # creates .env.local, generates SIFT_SECRET, then checks everything
```

Fill in `.env.local` (every variable is explained in [`.env.example`](.env.example)), then:

```bash
npm run db:migrate   # applies supabase/migrations/*.sql (needs SUPABASE_DB_URL)
npm run setup        # re-run until every line is ✓: it pings Supabase and makes one real Jev call
npm run dev          # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run setup` | Creates `.env.local`, generates `SIFT_SECRET`, validates every variable (prints names, never values), pings Supabase and Jev, applies migrations when `SUPABASE_DB_URL` is set. Safe to re-run. |
| `npm run db:migrate` | Applies missing migrations in order, each in a transaction, recorded in `supabase_migrations.schema_migrations` (the table the Supabase CLI uses). `-- --dry` lists them. |
| `npm run check:jev` | One real Jev call with your settings; prints the URL and model it used. |
| `npm run vercel:env` | Copies `.env.local` to your linked Vercel project (Production; `-- --preview` adds Preview, `-- --app-url <url>` sets `APP_URL`). |

No database password? Paste the files in `supabase/migrations/` into the Supabase SQL editor in filename order instead.

### Supabase settings

1. **Authentication → URL Configuration**: set *Site URL* to your app URL and add `http://localhost:3000/**`
   (and your deployed URL + `/**`) to *Redirect URLs*. Confirmation and password-reset emails land on `/auth/callback`.
2. **Authentication → Emails → SMTP**: Supabase's built-in mailer only delivers to your own team's addresses and
   is heavily rate-limited. For a deploy other people sign up to, configure a real SMTP provider.

### Environment

| Variable | |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API keys. Safe in the browser; RLS protects the data. |
| `SUPABASE_SECRET_KEY` | Server only. Live new mail, the Jev quota and the logo cache run without a signed-in user. |
| `SUPABASE_DB_URL` | Only for `npm run db:migrate`. Dashboard → Connect → Session pooler. Not needed at runtime. |
| `SIFT_SECRET` | ≥ 32 random chars (`npm run setup` generates one). Seals users' Composio keys. Keep it stable. |
| `JEV_API_KEY`, `JEV_BASE_URL`, `JEV_MODEL` | Any provider serving Jev over TypeSafe's `/v1/systemone` API. `JEV_BASE_URL` is the API root, e.g. `https://api.commandcode.ai/provider` with `typesafe/jev` for Command Code, or `https://api.typesafe.ai` with `jev-latest` for TypeSafe. If every email fails, the sync shows the error and the URL it called. |
| `JEV_DAILY_LIMIT` | Per-user daily cap on emails Jev reads. Set it on a public deploy. |
| `APP_URL` | Optional public URL, used for Composio's OAuth callback behind proxies. |

Open http://localhost:3000, create an account, then paste your Composio API key
(platform.composio.dev → Settings → API keys). Sorta lists the Gmail accounts in that Composio project so you
can pick which ones to read. Connect more from the same dialog, and change the picks under **manage accounts**.

### Deploy to Vercel

```bash
npx vercel link                                   # create or pick the project
npm run vercel:env                                # upload .env.local
npx vercel --prod                                 # deploy; note the URL
npm run vercel:env -- --app-url https://<your-url> && npx vercel --prod
```

Then add the production URL to Supabase's *Site URL* and *Redirect URLs* (above).

### Moving from the old single-user version

The old version kept everything in `data/store.json`. Sign up, then:

```bash
node --env-file=.env.local scripts/import-local-store.mjs you@example.com
```

### Checking isolation

`scripts/e2e-auth-check.mjs` signs in as two accounts against a running server and checks that neither can
reach the other's data, through the API or straight through Supabase.

## How it works

```
src/proxy.ts         refreshes the Supabase session; signed-out pages → /login, API → 401, cross-origin writes → 403
src/lib/session.ts   requireUser()/withUser(): every route runs as the signed-in user (RLS applies)
src/lib/composio.ts  Composio client for the user's own key; runs tools only on that user's mailboxes
src/lib/secrets.ts   AES-256-GCM sealing for users' Composio keys (SIFT_SECRET)
src/lib/accounts.ts  save key / list / pick / connect (hosted OAuth link) / disconnect Gmail accounts
src/lib/live.ts      GMAIL_NEW_GMAIL_MESSAGE triggers + one Composio event stream per user → new mail lands without a sync
src/lib/gmail.ts     GMAIL_FETCH_EMAILS / BATCH_MODIFY_MESSAGES / UNTRASH_MESSAGE / CREATE_LABEL
src/lib/jev.ts       one Jev request per email: junk-kind Choice + priority Score + needs-reply Noul
                     (+ category Choice over your categories + "none")
src/lib/policy.ts    the sweep rule, in code: protected → starred → Gmail spam → Σ P(swept kinds) ≥ threshold
src/lib/store.ts     Supabase data access (emails, analysis, categories, accounts, settings), scoped per user
src/lib/quota.ts     JEV_DAILY_LIMIT: per-user daily Jev allowance, counted server-side
supabase/migrations  schema + RLS policies
src/app/api/*        sync (streams progress), sweep, trash, undo, categories, settings, protect, search,
                     thread (full conversation on demand), attachment (streams a file via Composio), events (live mail)
```

Sync only sends **new** emails to Jev. When categories change, only the category question runs again.

Each sync fetches the newest **200** inbox emails per account (plus 100 from Spam). Change it under Rules (`,`): 100 / 200 / 500 / 1000.

### Gmail accounts and live mail

Every Gmail connection in your Composio project shows up under **manage accounts**; tick the ones Sorta should
read. **Connect a Gmail account** opens Composio's Google sign-in and returns to Sorta with that mailbox picked.
Sync reads all picked accounts, and trash, undo and Gmail labels act on the right mailbox. Click an account in
the sidebar to show only its mail.

Each picked account gets a Composio `GMAIL_NEW_GMAIL_MESSAGE` trigger (checks the inbox every minute). The
server listens on Composio's trigger stream from startup, so new mail is filed, read by Jev and pushed to open
tabs (`/api/events`) without pressing sync. The sidebar shows **live** while that stream is connected.
Unticking an account removes its trigger; **Disconnect** removes the connection from Composio too.
