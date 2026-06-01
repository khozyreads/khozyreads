-- ============================================================
-- Migration 014: Continue Reading feature
-- ============================================================
-- Adds two columns to the existing `user_library` table:
--   - last_page: which page the buyer was on (default 1 = start)
--   - last_read_at: when they last opened the book (null = never)
--
-- Plus an index for "recently read" queries on the library page.
-- ============================================================

alter table public.user_library
  add column if not exists last_page integer not null default 1
    check (last_page >= 1),
  add column if not exists last_read_at timestamptz;

-- Index: fetch a user's library sorted by most-recently-read.
create index if not exists idx_user_library_last_read
  on public.user_library (user_id, last_read_at desc nulls last);

-- Reload PostgREST so the new columns are visible to clients
notify pgrst, 'reload schema';
