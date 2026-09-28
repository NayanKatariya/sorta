-- `real` can't hold 0.99 exactly (0.9900000095…), which tripped the 0.3–0.99 check at the top of the range.
alter table public.user_state alter column threshold type numeric(3, 2) using round(threshold::numeric, 2);
