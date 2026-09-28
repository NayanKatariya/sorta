-- Sorta schema. Every user-owned row carries user_id and is guarded by RLS, so a signed-in user
-- can only ever see or change their own mail, even when talking to the Data API directly.
-- The service role (server-only) is used for background work: Composio's live new-mail stream,
-- the Jev usage quota and the shared sender-logo cache.

-- Settings and bookkeeping, one row per user.
create table public.user_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  sweep_kinds text[] not null default '{scam_or_phishing,spam,promotion}'
    check (sweep_kinds <@ '{scam_or_phishing,spam,promotion,newsletter,social_notification}'::text[]),
  threshold real not null default 0.7 check (threshold between 0.3 and 0.99),
  include_spam_folder boolean not null default true,
  fetch_limit integer not null default 200 check (fetch_limit between 25 and 1000),
  protected_senders text[] not null default '{}' check (cardinality(protected_senders) <= 2000),
  last_sweep jsonb,
  last_sync_at timestamptz,
  total_swept integer not null default 0 check (total_swept >= 0),
  created_at timestamptz not null default now()
);

-- The user's Composio API key, AES-256-GCM sealed with the server's SIFT_SECRET.
-- Ciphertext only: reading your own row gives you nothing usable.
create table public.composio_credentials (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  api_key_sealed text not null check (length(api_key_sealed) < 2000),
  hint text not null check (length(hint) <= 8),
  saved_at timestamptz not null default now()
);

create table public.accounts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) <= 200),
  composio_user_id text not null check (length(composio_user_id) <= 200),
  email text not null check (length(email) <= 320),
  status text not null check (length(status) <= 40),
  enabled boolean not null default false,
  trigger_id text check (length(trigger_id) <= 200),
  primary key (user_id, id)
);

create table public.categories (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) <= 40),
  name text not null check (length(name) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  gmail_labels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.emails (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (length(id) <= 200),
  account_id text not null,
  thread_id text not null default '',
  sender text not null default '',
  subject text not null default '',
  preview text not null default '',
  date timestamptz not null,
  label_ids text[] not null default '{}',
  url text not null default '',
  folder text not null check (folder in ('inbox', 'spam')),
  has_attachment boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id),
  -- Removing a mailbox removes its mail.
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);
create index emails_user_date_idx on public.emails (user_id, date desc);
create index emails_user_account_idx on public.emails (user_id, account_id);

-- Jev's reading of each email. Kept apart from `emails` so it survives a mailbox refresh
-- and a sweep; sync prunes it (prune_analysis).
create table public.analysis (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email_id text not null check (length(email_id) <= 200),
  junk_kind text not null,
  junk_probabilities jsonb not null,
  priority real not null,
  needs_reply real not null,
  category text,
  category_confidence real not null default 0,
  category_version text not null default '',
  manual_category boolean not null default false,
  keep boolean not null default false,
  primary key (user_id, email_id)
);

-- RLS: owner-only, for every user table.
do $$
declare t text;
begin
  foreach t in array array['user_state', 'composio_credentials', 'accounts', 'categories', 'emails', 'analysis'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    execute format(
      'create policy "owner access" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Sweeps, trashes and undos record themselves in one statement so concurrent requests don't lose counts.
create function public.record_sweep(p_sweep jsonb, p_delta integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.user_state
     set last_sweep = p_sweep,
         total_swept = greatest(0, total_swept + p_delta)
   where user_id = (select auth.uid());
$$;

-- Drops Jev results for mail that's no longer in any picked mailbox.
create function public.prune_analysis()
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.analysis a
   where a.user_id = (select auth.uid())
     and not exists (select 1 from public.emails e where e.user_id = a.user_id and e.id = a.email_id);
$$;

revoke execute on function public.record_sweep(jsonb, integer) from public, anon;
revoke execute on function public.prune_analysis() from public, anon;
grant execute on function public.record_sweep(jsonb, integer) to authenticated;
grant execute on function public.prune_analysis() to authenticated;

-- Jev calls per user per day. Written only by the server (service role), so users can't reset it.
create table public.jev_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  calls integer not null default 0,
  primary key (user_id, day)
);
alter table public.jev_usage enable row level security;
revoke all on public.jev_usage from anon, authenticated;
grant select, insert, update on public.jev_usage to service_role;

-- Grants up to p_calls of today's remaining allowance and returns how many were granted.
create function public.consume_jev_quota(p_user uuid, p_calls integer, p_limit integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used integer;
  granted integer;
begin
  insert into public.jev_usage (user_id, day, calls) values (p_user, current_date, 0)
  on conflict (user_id, day) do nothing;
  select calls into used from public.jev_usage where user_id = p_user and day = current_date for update;
  granted := greatest(0, least(p_calls, p_limit - used));
  update public.jev_usage set calls = calls + granted where user_id = p_user and day = current_date;
  return granted;
end;
$$;
revoke execute on function public.consume_jev_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_jev_quota(uuid, integer, integer) to service_role;

-- Sender logos, shared by everyone (brand images, not user data). Server-only.
create table public.logos (
  domain text primary key check (length(domain) <= 253),
  content_type text,
  body_b64 text,
  missed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.logos enable row level security;
revoke all on public.logos from anon, authenticated;
grant select, insert, update, delete on public.logos to service_role;
