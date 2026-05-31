-- ============================================================
-- 012_genres_and_creator_apply.sql
-- ============================================================
-- Adds:
--   1. books.genre — text[] array so a book can have multiple genres
--      (e.g. ['Romance', 'Historical', 'Drama']). Free text per user
--      choice, normalised to lowercase for consistent filtering.
--   2. site_settings.apply_creator_link — Telegram URL for the
--      "Apply as Creator" CTA on the homepage. Admin sets it once.
-- ============================================================

-- 1. Add genre column to books
alter table public.books
  add column if not exists genre text[] default '{}';

-- Index for fast filtering by genre (GIN supports array contains queries)
create index if not exists idx_books_genre on public.books using gin (genre);

-- 2. Seed the apply_creator_link setting (empty by default — admin will fill in)
insert into public.site_settings (setting_key, setting_value)
values ('apply_creator_link', '')
on conflict (setting_key) do nothing;

-- ============================================================
-- DONE
-- ============================================================
