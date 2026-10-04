-- ============================================================
-- Migration 025: Book ratings (1–5 stars) + comments
-- ============================================================
create table if not exists public.book_reviews (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references public.books(id) on delete cascade,
  user_id       uuid not null references public.users_profile(id) on delete cascade,
  rating        integer not null check (rating between 1 and 5),
  comment       text check (comment is null or char_length(comment) <= 1000),
  reviewer_name text,                       -- snapshot (display name) so public can read without profile access
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (book_id, user_id)                 -- one review per reader per book (editable)
);
create index if not exists book_reviews_book_idx on public.book_reviews (book_id, created_at desc);

-- Fill reviewer_name from the profile on insert/update (security definer: profiles are private)
create or replace function public.book_reviews_fill_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(nullif(trim(p.display_name), ''), '@' || p.username)
    into new.reviewer_name
  from public.users_profile p where p.id = new.user_id;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_book_reviews_fill_name on public.book_reviews;
create trigger trg_book_reviews_fill_name before insert or update on public.book_reviews
  for each row execute function public.book_reviews_fill_name();

-- Can this user review the book? (has read access: owns it, claimed it, or active pass)
create or replace function public.can_review_book(p_book_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_profile_id() is not null and (
    exists (select 1 from public.user_library ul
            where ul.user_id = public.current_profile_id() and ul.book_id = p_book_id)
    or public.has_active_subscription()
    or exists (select 1 from public.books b where b.id = p_book_id and b.is_free)
  );
$$;
grant execute on function public.can_review_book(uuid) to authenticated, anon;

alter table public.book_reviews enable row level security;
drop policy if exists "reviews_public_read" on public.book_reviews;
create policy "reviews_public_read" on public.book_reviews for select using (true);
drop policy if exists "reviews_insert_own" on public.book_reviews;
create policy "reviews_insert_own" on public.book_reviews for insert
  with check (user_id = public.current_profile_id() and public.can_review_book(book_id));
drop policy if exists "reviews_update_own" on public.book_reviews;
create policy "reviews_update_own" on public.book_reviews for update
  using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());
drop policy if exists "reviews_delete_own_or_admin" on public.book_reviews;
create policy "reviews_delete_own_or_admin" on public.book_reviews for delete
  using (user_id = public.current_profile_id() or public.is_admin());
drop policy if exists "reviews_admin_all" on public.book_reviews;
create policy "reviews_admin_all" on public.book_reviews for all using (public.is_admin()) with check (public.is_admin());

-- Aggregates per book (public)
create or replace view public.book_rating_stats as
select book_id, round(avg(rating)::numeric, 1) as avg_rating, count(*)::int as review_count
from public.book_reviews group by book_id;
alter view public.book_rating_stats set (security_invoker = on);

notify pgrst, 'reload schema';
