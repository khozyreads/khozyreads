-- ============================================================
-- 007_fix_security_advisor.sql
-- ============================================================
-- Fixes Supabase Security Advisor errors:
--   1. Exposed Auth Users on public.admin_users_view
--   2. Security Definer View on public.admin_users_view
--   3. Security Definer View on public.admin_orders_view
--
-- Root cause: Views in Postgres default to SECURITY DEFINER behavior
-- (they run with owner's privileges, bypassing the caller's RLS).
-- Without explicit security_invoker = on, even non-admins could query
-- these views and see all rows.
--
-- Fix strategy:
--   - admin_orders_view: add security_invoker = on so caller's RLS applies.
--     Existing RLS on `orders` already restricts buyers to their own rows
--     and grants admins via is_admin() — so behavior stays correct.
--
--   - admin_users_view: drop the view (because it joins auth.users,
--     which non-admins can't read directly). Replace with a SECURITY
--     DEFINER function admin_list_users() that explicitly verifies
--     is_admin() before returning anything. Non-admins get an exception.
-- ============================================================

-- 1. admin_orders_view: enforce caller's identity via security_invoker
alter view public.admin_orders_view set (security_invoker = on);

-- 2. admin_users_view: drop and replace with a function that checks admin role
drop view if exists public.admin_users_view;

create or replace function public.admin_list_users()
returns table(
  id uuid,
  auth_user_id uuid,
  username text,
  email text,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Hard gate: anyone who is not an admin gets an exception, not data.
  if not public.is_admin() then
    raise exception 'access denied: admin role required'
      using errcode = '42501';
  end if;

  return query
    select
      up.id,
      up.auth_user_id,
      up.username,
      up.email,
      up.role,
      up.status,
      up.created_at,
      up.updated_at,
      au.last_sign_in_at,
      au.banned_until
    from public.users_profile up
    left join auth.users au on au.id = up.auth_user_id
    order by up.created_at desc;
end
$$;

-- Restrict execution to authenticated role only (anon can't call it at all).
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- ============================================================
-- DONE
-- After running this migration, verify in Supabase Security Advisor:
--   - The 3 errors should disappear after a refresh.
-- ============================================================
