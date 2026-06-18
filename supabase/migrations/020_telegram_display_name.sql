-- ============================================================
-- Migration 020: Telegram display name
-- ============================================================
-- Problem: the `username` column has CHECK (username ~ '^[a-zA-Z]+[0-9]+$'),
-- so it can ONLY hold ascii-letters+digits. Telegram users with Khmer names
-- (or no public @username) get an auto-generated handle like `tg4821`, and the
-- UI shows that instead of their real name.
--
-- Fix: add a free-form `display_name` column (no constraint) used for DISPLAY
-- only. The `username` stays the unique system handle (good for watermark /
-- audit traceability). UI prefers @telegram_username, then display_name.
-- ============================================================

alter table public.users_profile
  add column if not exists display_name text;

-- ------------------------------------------------------------
-- Backfill existing Telegram (and Google) users from auth metadata
-- ------------------------------------------------------------
update public.users_profile up
set display_name = nullif(trim(au.raw_user_meta_data ->> 'full_name'), '')
from auth.users au
where au.id = up.auth_user_id
  and coalesce(up.display_name, '') = ''
  and coalesce(au.raw_user_meta_data ->> 'full_name', '') <> '';

-- Backfill telegram_username from metadata where it was lost
update public.users_profile up
set telegram_username = nullif(trim(au.raw_user_meta_data ->> 'telegram_username'), '')
from auth.users au
where au.id = up.auth_user_id
  and coalesce(up.telegram_username, '') = ''
  and coalesce(au.raw_user_meta_data ->> 'telegram_username', '') <> '';

-- ------------------------------------------------------------
-- Update profile-creation trigger to also capture display_name
-- (full_name from OAuth/Telegram metadata) on first insert.
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
  disp text;
begin
  email_text := coalesce(new.email, '');
  disp := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');

  base_name := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(email_text, '@', 1),
      'user'
    ),
    '[^a-zA-Z]', '', 'g'
  ));

  if base_name = '' or base_name is null then
    base_name := 'user';
  end if;

  loop
    candidate := base_name || (1000 + floor(random() * 9000))::int::text;

    begin
      insert into public.users_profile (auth_user_id, username, role, email, display_name)
      values (new.id, candidate, 'buyer', email_text, disp)
      on conflict (auth_user_id) do nothing;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 20 then
        candidate := base_name || lpad((abs(hashtext(new.id::text)) % 9999 + 1000)::text, 4, '0');
        insert into public.users_profile (auth_user_id, username, role, email, display_name)
        values (new.id, candidate, 'buyer', email_text, disp)
        on conflict (auth_user_id) do nothing;
        exit;
      end if;
    end;
  end loop;

  return new;
end
$$;

-- Reload PostgREST cache so `display_name` is exposed via the API
notify pgrst, 'reload schema';
