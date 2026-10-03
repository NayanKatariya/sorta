-- Personal access tokens for the MCP server (/api/mcp). An AI agent presents one as a bearer token and acts as
-- its owner, within the token's scopes. Only the SHA-256 of the token is stored: the plaintext is shown once, at creation.
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  -- sha-256 of the token, hex.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- First characters of the token, so the list can say which is which.
  prefix text not null check (length(prefix) <= 24),
  -- read = list/read mail; send = also send and reply.
  scopes text[] not null default '{read}' check (cardinality(scopes) >= 1 and scopes <@ '{read,send}'::text[]),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index mcp_tokens_user_idx on public.mcp_tokens (user_id, created_at desc);

alter table public.mcp_tokens enable row level security;
revoke all on public.mcp_tokens from anon;
-- The server looks tokens up by hash with the service role, since an agent has no session; it also stamps last_used_at.
grant select, insert, update, delete on public.mcp_tokens to authenticated, service_role;
create policy "owner access" on public.mcp_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Users can reach this table directly through the Data API, so the rules the server keeps are enforced here too:
-- a token's secret, owner, scopes and expiry never change after creation, and a revoked token stays revoked.
create function public.mcp_tokens_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.token_hash <> old.token_hash or new.prefix <> old.prefix
     or new.scopes <> old.scopes or new.expires_at is distinct from old.expires_at or new.created_at <> old.created_at then
    raise exception 'Only a token''s name can change; create a new token instead.';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'A revoked token stays revoked.';
  end if;
  return new;
end;
$$;

create trigger mcp_tokens_guard before update on public.mcp_tokens
  for each row execute function public.mcp_tokens_guard();
