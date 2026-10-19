-- ============================================================
-- Migration 027: profile avatars (Telegram / Google) + book popularity view
-- Run in Supabase SQL Editor, then: supabase migration repair --status applied 027
-- ============================================================

-- 1. Avatar on profile (telegram-auth edge fn writes photo_url here; Google via sync_my_avatar)
alter table public.users_profile add column if not exists avatar_url text;

-- Copy the OAuth picture (Google: avatar_url / picture) from auth.users into the profile.
-- Called by the frontend once after login when the profile has no avatar yet.
create or replace function public.sync_my_avatar()
returns text
language plpgsql security definer set search_path = public
as $$
declare v_url text;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(
           nullif(u.raw_user_meta_data->>'avatar_url',''),
           nullif(u.raw_user_meta_data->>'picture','')
         )
    into v_url
  from auth.users u where u.id = auth.uid();
  -- only accept https image URLs from known providers
  if v_url is null or v_url !~ '^https://([a-z0-9.-]+\.)?(googleusercontent\.com|t\.me|telegram\.org|telesco\.pe)/' then
    return (select avatar_url from public.users_profile where auth_user_id = auth.uid());
  end if;
  update public.users_profile set avatar_url = v_url
  where auth_user_id = auth.uid() and (avatar_url is null or avatar_url = '');
  return v_url;
end; $$;
grant execute on function public.sync_my_avatar() to authenticated;

-- 2. Reviews: snapshot reviewer avatar so the public list can show it without profile access
alter table public.book_reviews add column if not exists reviewer_avatar text;
create or replace function public.book_reviews_fill_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(nullif(trim(p.display_name), ''), '@' || p.username), p.avatar_url
    into new.reviewer_name, new.reviewer_avatar
  from public.users_profile p where p.id = new.user_id;
  new.updated_at := now();
  return new;
end; $$;

-- 3. Popularity: reads per book in the last 30 days (public, aggregate only — no user data)
create or replace view public.book_popularity as
  select l.target_id::uuid as book_id, count(*)::int as reads_30d
  from public.activity_logs l
  where l.action = 'book.read'
    and l.created_at > now() - interval '30 days'
    and l.target_id ~ '^[0-9a-f-]{36}$'
  group by l.target_id;
grant select on public.book_popularity to anon, authenticated;

notify pgrst, 'reload schema';
