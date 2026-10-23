-- ============================================================
-- Migration 028: fix Security Advisor findings
--  * CRITICAL  Security Definer View  → replace view with a definer FUNCTION (aggregate only)
--  * WARN      Function search_path mutable (3 fns)
-- Run in SQL Editor, then: supabase migration repair --status applied 028
-- ============================================================

-- 1. book_popularity: view → function (same output; RPC instead of table select)
drop view if exists public.book_popularity;
create or replace function public.book_popularity()
returns table(book_id uuid, reads_30d int)
language sql stable security definer set search_path = public
as $$
  select l.target_id::uuid as book_id, count(*)::int as reads_30d
  from public.activity_logs l
  where l.action = 'book.read'
    and l.created_at > now() - interval '30 days'
    and l.target_id ~ '^[0-9a-f-]{36}$'
  group by l.target_id;
$$;
revoke all on function public.book_popularity() from public;
grant execute on function public.book_popularity() to anon, authenticated;

-- 2. Pin search_path on the flagged functions
alter function public.touch_updated_at() set search_path = public;
alter function public.can_purchase(uuid) set search_path = public;
alter function public.tg_promo_code_upper() set search_path = public;

notify pgrst, 'reload schema';
