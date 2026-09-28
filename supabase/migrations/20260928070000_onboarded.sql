-- When the user finished the first-run walkthrough. Null means show it on next load.
alter table public.user_state add column onboarded_at timestamptz;
