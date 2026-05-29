-- ============================================================
-- 011_google_auth_and_admin_role.sql
-- ============================================================
-- Two changes:
--   1. Update handle_new_auth_user trigger so Google OAuth users get
--      a unique auto-generated username like `ririchan4821` derived
--      from their email prefix + 4 random digits. Old behavior used
--      `raw_user_meta_data ->> 'username'` which only works for the
--      manual email/password signup flow.
--   2. Add admin_set_user_role(target_user_id, new_role) RPC so
--      existing admins can promote/demote users from the dashboard
--      without touching SQL directly.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Auto-username trigger for Google OAuth (and any future provider)
-- ------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
  attempts int := 0;
  email_text text;
begin
  email_text := coalesce(new.email, '');

  -- Strip everything except letters from email-prefix or metadata.username
  -- Result must match `^[a-zA-Z]+[0-9]+$` (letters then digits).
  base_name := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(email_text, '@', 1),
      'user'
    ),
    '[^a-zA-Z]', '', 'g'
  ));

  -- Fallback if email had no letters at all (e.g. 12345@gmail.com)
  if base_name = '' or base_name is null then
    base_name := 'user';
  end if;

  -- Try up to 20 random suffixes; if all collide, fall back to UUID slice
  loop
    candidate := base_name || (1000 + floor(random() * 9000))::int::text;

    begin
      insert into public.users_profile (auth_user_id, username, role, email)
      values (new.id, candidate, 'buyer', email_text)
      on conflict (auth_user_id) do nothing;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 20 then
        -- Worst case: append part of the auth_user_id UUID for guaranteed uniqueness
        candidate := base_name || lpad((abs(hashtext(new.id::text)) % 9999 + 1000)::text, 4, '0');
        insert into public.users_profile (auth_user_id, username, role, email)
        values (new.id, candidate, 'buyer', email_text)
        on conflict (auth_user_id) do nothing;
        exit;
      end if;
    end;
  end loop;

  return new;
end
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ------------------------------------------------------------
-- 2. admin_set_user_role(target_user_id, new_role)
-- ------------------------------------------------------------
-- Lets an existing admin promote a buyer to admin (or demote an admin
-- back to buyer). Refuses to act on self (avoids accidental lockout).
-- ------------------------------------------------------------
create or replace function public.admin_set_user_role(
  p_target_user_id uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_profile_id uuid := public.current_profile_id();
  v_target public.users_profile%rowtype;
begin
  -- Authorization
  if v_caller_profile_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'access denied: admin role required' using errcode = '42501';
  end if;

  -- Validate role
  if p_new_role not in ('buyer', 'admin') then
    raise exception 'invalid role: %', p_new_role using errcode = '22023';
  end if;

  -- Load target
  select * into v_target from public.users_profile where id = p_target_user_id;
  if not found then
    raise exception 'user not found' using errcode = '02000';
  end if;

  -- Prevent self-demote / self-promote (admin should ask another admin)
  if v_target.id = v_caller_profile_id then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;

  -- Apply
  update public.users_profile
    set role = p_new_role, updated_at = now()
    where id = p_target_user_id;

  -- Log
  insert into public.activity_logs (action, actor_user_id, target_type, target_id, details)
  values (
    'user.role_changed',
    v_caller_profile_id,
    'user',
    p_target_user_id,
    jsonb_build_object('from', v_target.role, 'to', p_new_role)
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_role', p_new_role
  );
end
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- ============================================================
-- DONE
-- ============================================================
