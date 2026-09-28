-- When the user's current sync started; null when none is running. Taken and cleared by the sync route.
-- A lock older than a sync can live (Vercel stops functions at 300 s) counts as abandoned, so a killed run
-- can't block syncing forever. Lives in the database, not in memory, so every server instance sees it.
alter table public.user_state add column sync_started_at timestamptz;
