-- ============================================================
-- Migration 017: Helper RPC find_auth_user_by_email
-- ============================================================
-- Allows the telegram-auth edge function to look up an existing
-- auth.users entry by email (placeholder email like tg{id}@telegram...).
-- Used as a fallback when find_profile_by_telegram_id returns nothing
-- but auth.users already has the entry (recover from past failed
-- profile updates).
-- ============================================================

create or replace function public.find_auth_user_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where email = p_email limit 1;
$$;

revoke all on function public.find_auth_user_by_email(text) from public;
grant execute on function public.find_auth_user_by_email(text) to service_role;

notify pgrst, 'reload schema';
