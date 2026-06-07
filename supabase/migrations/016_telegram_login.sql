-- ============================================================
-- Migration 016: Telegram login support
-- ============================================================
-- Adds columns to users_profile so we can identify buyers who
-- signed in via Telegram, and avoid duplicating accounts when
-- the same Telegram user logs in twice.
--
-- NOTE: Telegram returns numeric IDs that fit in bigint.
-- Username may be NULL (not all Telegram users have one).
-- ============================================================

alter table public.users_profile
  add column if not exists telegram_id bigint,
  add column if not exists telegram_username text;

-- Unique index so we never create two profiles for the same Telegram user
create unique index if not exists idx_users_profile_telegram_id
  on public.users_profile (telegram_id)
  where telegram_id is not null;

-- Helper RPC: find a profile by telegram_id (used by edge function)
create or replace function public.find_profile_by_telegram_id(p_tg_id bigint)
returns table(profile_id uuid, auth_user_id uuid, username text)
language sql
security definer
set search_path = public
as $$
  select id, auth_user_id, username
  from public.users_profile
  where telegram_id = p_tg_id
  limit 1;
$$;

revoke all on function public.find_profile_by_telegram_id(bigint) from public;
grant execute on function public.find_profile_by_telegram_id(bigint) to service_role;

-- Reload PostgREST cache
notify pgrst, 'reload schema';
