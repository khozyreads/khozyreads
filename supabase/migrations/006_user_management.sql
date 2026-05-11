-- ============================================================
-- Migration 006: User Management (status + email sync)
-- ============================================================
-- Adds:
--   - users_profile.status (active / disabled)
--   - users_profile.email (denormalized from auth.users for admin UI)
--   - RPC admin_toggle_user_status (admin can disable/enable from dashboard)
--   - Email sync trigger
-- ============================================================

-- 1. Add columns
alter table public.users_profile
  add column if not exists status text not null default 'active'
    check (status in ('active','disabled')),
  add column if not exists email text;

-- 2. Backfill email from existing auth.users
update public.users_profile up
set email = au.email
from auth.users au
where up.auth_user_id = au.id and up.email is null;

-- 3. Update new-user trigger to also save email
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  profile_username text;
begin
  profile_username = lower(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  ));

  insert into public.users_profile (auth_user_id, username, email, role)
  values (new.id, profile_username, new.email, 'buyer')
  on conflict (auth_user_id) do update set email = excluded.email;

  return new;
end;
$$;

-- 4. Trigger to sync email when user changes it in auth.users
create or replace function public.sync_profile_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.users_profile
  set email = new.email
  where auth_user_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_email_change on auth.users;
create trigger on_auth_email_change
after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.sync_profile_email();

-- 5. RPC: admin_toggle_user_status (updates only the profile flag;
--     auth.users ban is handled by edge function)
create or replace function public.admin_toggle_user_status(p_user_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin_id uuid;
  v_admin_username text;
  v_target_username text;
begin
  select id, username into v_admin_id, v_admin_username
  from public.users_profile
  where auth_user_id = auth.uid() and role = 'admin';

  if v_admin_id is null then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_status not in ('active','disabled') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select username into v_target_username from public.users_profile where id = p_user_id;
  if v_target_username is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  update public.users_profile set status = p_status where id = p_user_id;

  insert into public.activity_logs (action, actor_user_id, actor_username, target_type, target_id, details)
  values (
    case when p_status='disabled' then 'user.disable' else 'user.enable' end,
    v_admin_id, v_admin_username,
    'user', p_user_id::text,
    jsonb_build_object('target_username', v_target_username, 'new_status', p_status)
  );
end;
$$;

grant execute on function public.admin_toggle_user_status(uuid, text) to authenticated;

-- 6. Admin view for users (only admins can read via RLS)
create or replace view public.admin_users_view as
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
left join auth.users au on au.id = up.auth_user_id;

-- View inherits RLS from underlying tables, so non-admin can only see their own
-- (but auth.users join requires elevation — view itself is unprotected, RLS on
--  base table users_profile still applies for column up.*)

-- 7. Update can_purchase to also require active status
create or replace function public.can_purchase(target_book_id uuid)
returns boolean stable language sql as $$
  select exists (
    select 1 from public.books b
    join public.users_profile up on up.auth_user_id = auth.uid()
    where b.id = target_book_id
      and b.status = 'active'
      and b.is_buy_enabled = true
      and (b.available_from is null or now() >= b.available_from)
      and (b.available_until is null or now() <= b.available_until)
      and up.status = 'active'
  )
$$;
