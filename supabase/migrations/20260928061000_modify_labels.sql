-- Adds/removes Gmail label ids on many of the caller's emails in one statement.
create function public.modify_labels(p_ids text[], p_add text[], p_remove text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.emails e
     set label_ids = array(
           select distinct l from unnest(e.label_ids || p_add) as l
            where l <> all (p_remove) or l = any (p_add))
   where e.user_id = (select auth.uid())
     and e.id = any (p_ids);
$$;
revoke execute on function public.modify_labels(text[], text[], text[]) from public, anon;
grant execute on function public.modify_labels(text[], text[], text[]) to authenticated;
