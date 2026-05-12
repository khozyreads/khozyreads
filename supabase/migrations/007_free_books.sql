-- ============================================================
-- Migration 007: Free books
-- ============================================================
-- Admin can mark a book as "free" → readers can claim and read
-- without paying. Auto-grants library access on claim.
-- ============================================================

-- 1. Add is_free column to books
alter table public.books
  add column if not exists is_free boolean not null default false;

create index if not exists books_is_free_idx on public.books (is_free) where is_free = true;

-- 2. RPC: claim_free_book
-- Authenticated user can claim any active free book.
-- Creates a library entry, logs the activity.
create or replace function public.claim_free_book(p_book_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_username text;
  v_book_title text;
  v_lib_id uuid;
begin
  select id, username into v_profile_id, v_username
  from public.users_profile
  where auth_user_id = auth.uid() and status = 'active';

  if v_profile_id is null then
    raise exception 'Login required or account disabled' using errcode = '42501';
  end if;

  -- Verify book is free + active
  select title into v_book_title
  from public.books
  where id = p_book_id and is_free = true and status = 'active';

  if v_book_title is null then
    raise exception 'Book not available for free claim' using errcode = 'P0002';
  end if;

  -- Upsert library entry
  insert into public.user_library (user_id, book_id, access_status)
  values (v_profile_id, p_book_id, 'active')
  on conflict (user_id, book_id) do update set access_status = 'active'
  returning id into v_lib_id;

  -- Log
  insert into public.activity_logs (action, actor_user_id, actor_username, target_type, target_id, details)
  values (
    'book.claim_free',
    v_profile_id, v_username,
    'book', p_book_id::text,
    jsonb_build_object('title', v_book_title)
  );

  return v_lib_id;
end;
$$;

grant execute on function public.claim_free_book(uuid) to authenticated;
