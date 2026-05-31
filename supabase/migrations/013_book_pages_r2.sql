-- ============================================================
-- 013_book_pages_r2.sql
-- ============================================================
-- Adds infrastructure for the modern image-based reader:
--   1. books.total_pages   — number of pages once extraction is done
--   2. books.pages_status  — 'pending' | 'processing' | 'ready' | 'failed'
--                            so the reader knows whether to use image
--                            mode or fall back to PDF.js
--   3. books.r2_prefix     — folder prefix in R2 (e.g. "abc123/")
--                            so we can build image URLs without an
--                            extra table query per book
--   4. book_pages          — one row per page, holds page number,
--                            R2 object key, and image dimensions for
--                            correct aspect-ratio sizing before image
--                            loads (prevents layout shift)
-- ============================================================

alter table public.books
  add column if not exists total_pages integer,
  add column if not exists pages_status text not null default 'pending'
    check (pages_status in ('pending','processing','ready','failed')),
  add column if not exists r2_prefix text;

create table if not exists public.book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  page_num integer not null check (page_num > 0),
  object_key text not null,           -- e.g. "abc123/page-001.webp"
  width integer,                       -- intrinsic image width in px
  height integer,                      -- intrinsic image height in px
  byte_size integer,
  created_at timestamptz not null default now(),
  unique (book_id, page_num)
);

create index if not exists idx_book_pages_book on public.book_pages (book_id, page_num);

alter table public.book_pages enable row level security;

-- Buyers can read pages of books they have library access to.
-- Admins can read everything.
drop policy if exists "book_pages_buyer_read" on public.book_pages;
create policy "book_pages_buyer_read" on public.book_pages
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_library ul
      where ul.book_id = book_pages.book_id
        and ul.user_id = public.current_profile_id()
        and ul.access_status = 'active'
    )
  );

-- Only admin (via service role / definer functions) writes here
drop policy if exists "book_pages_admin_write" on public.book_pages;
create policy "book_pages_admin_write" on public.book_pages
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- DONE
-- ============================================================
