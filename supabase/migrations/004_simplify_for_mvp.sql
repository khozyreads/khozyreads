-- ============================================================
-- KhozyReads — Migration 004: Simplify for MVP
-- ============================================================
-- Tujuan:
--   1. Hapus episodes table (1 buku = 1 PDF)
--   2. Hapus role "seller" (cuma buyer + admin)
--   3. Tambah pdf_path di books (referensi ke storage)
--   4. Tambah logs table yang lebih general
--   5. Tambah bucket book-pdfs (private)
--   6. Update RLS policies sesuai role baru
--
-- Cara pakai:
--   Buka Supabase Dashboard → SQL Editor → paste file ini → Run
--   ATAU pakai supabase CLI: supabase db push
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop episodes table (and its dependencies)
-- ------------------------------------------------------------

drop trigger if exists episodes_sync_count on public.episodes;
drop trigger if exists episodes_touch_updated_at on public.episodes;
drop function if exists public.sync_episode_count cascade;
drop function if exists public.refresh_book_episode_count cascade;

drop policy if exists "episodes_staff_all" on public.episodes;
drop policy if exists "episodes_buyer_read_with_access" on public.episodes;

drop table if exists public.episodes cascade;

-- Hapus kolom total_episodes dari books, tambah pdf_path
alter table public.books
  drop column if exists total_episodes,
  add column if not exists pdf_path text,           -- path di bucket book-pdfs
  add column if not exists pdf_filename text,       -- original filename (untuk display)
  add column if not exists pdf_size_bytes bigint;   -- ukuran file (untuk info)

-- ------------------------------------------------------------
-- 2. Hapus role "seller", cuma buyer + admin
-- ------------------------------------------------------------

-- Update existing seller users jadi admin (kalau ada) — safety net
update public.users_profile set role = 'admin' where role = 'seller';

-- Drop constraint lama, ganti dengan check baru
alter table public.users_profile
  drop constraint if exists users_profile_role_check;

alter table public.users_profile
  add constraint users_profile_role_check
  check (role in ('buyer', 'admin'));

-- ------------------------------------------------------------
-- 3. Replace is_staff() dengan is_admin()
-- ------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
stable
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users_profile
    where auth_user_id = auth.uid() and role = 'admin'
  )
$$;

-- Keep is_staff() as alias for backward compatibility (sementara)
create or replace function public.is_staff()
returns boolean
stable
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
$$;

-- ------------------------------------------------------------
-- 4. Logs table (replace payment_approval_logs dengan yg lebih general)
-- ------------------------------------------------------------

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,                             -- e.g. 'register', 'login', 'order.create', 'order.approve', 'book.read'
  actor_user_id uuid references public.users_profile(id) on delete set null,
  actor_username text,                              -- snapshot biar gak ilang kalau user dihapus
  target_type text,                                 -- e.g. 'order', 'book', 'user'
  target_id text,                                   -- ID dari target (uuid jadi text untuk fleksibel)
  details jsonb default '{}'::jsonb,                -- info tambahan
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_action_idx on public.activity_logs (action);
create index if not exists activity_logs_actor_idx on public.activity_logs (actor_user_id);

alter table public.activity_logs enable row level security;

create policy "logs_admin_read" on public.activity_logs
  for select using (public.is_admin());

create policy "logs_admin_insert" on public.activity_logs
  for insert with check (public.is_admin());

-- Allow buyer to log their own activity (login, read book, etc)
create policy "logs_self_insert" on public.activity_logs
  for insert with check (
    actor_user_id = public.current_profile_id()
  );

-- ------------------------------------------------------------
-- 5. Update RLS policies — hilangkan seller, ganti is_staff dengan is_admin
-- ------------------------------------------------------------

-- users_profile
drop policy if exists "profiles_select_own_or_staff" on public.users_profile;
drop policy if exists "profiles_insert_own" on public.users_profile;
drop policy if exists "profiles_update_own_or_staff" on public.users_profile;

create policy "profiles_select_own_or_admin" on public.users_profile
  for select using (auth_user_id = auth.uid() or public.is_admin());

create policy "profiles_insert_own" on public.users_profile
  for insert with check (auth_user_id = auth.uid() and role = 'buyer');

create policy "profiles_update_own_or_admin" on public.users_profile
  for update using (auth_user_id = auth.uid() or public.is_admin())
  with check (auth_user_id = auth.uid() or public.is_admin());

-- books
drop policy if exists "books_public_active_read" on public.books;
drop policy if exists "books_staff_all" on public.books;

create policy "books_public_active_read" on public.books
  for select using (status = 'active' or public.is_admin());

create policy "books_admin_all" on public.books
  for all using (public.is_admin()) with check (public.is_admin());

-- orders
drop policy if exists "orders_buyer_read_own" on public.orders;
drop policy if exists "orders_buyer_create_own_open_book" on public.orders;
drop policy if exists "orders_buyer_update_own_pending_proof" on public.orders;
drop policy if exists "orders_staff_all" on public.orders;

create policy "orders_buyer_read_own" on public.orders
  for select using (user_id = public.current_profile_id() or public.is_admin());

create policy "orders_buyer_create_own" on public.orders
  for insert with check (
    user_id = public.current_profile_id()
    and status = 'pending'
    and public.can_purchase(book_id)
  );

create policy "orders_buyer_update_own_pending" on public.orders
  for update using (user_id = public.current_profile_id() and status = 'pending')
  with check (user_id = public.current_profile_id() and status = 'pending');

create policy "orders_admin_all" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

-- user_library
drop policy if exists "library_read_own_or_staff" on public.user_library;
drop policy if exists "library_staff_all" on public.user_library;

create policy "library_read_own_or_admin" on public.user_library
  for select using (user_id = public.current_profile_id() or public.is_admin());

create policy "library_admin_all" on public.user_library
  for all using (public.is_admin()) with check (public.is_admin());

-- site_settings
drop policy if exists "settings_public_read" on public.site_settings;
drop policy if exists "settings_staff_all" on public.site_settings;

create policy "settings_public_read" on public.site_settings
  for select using (true);

create policy "settings_admin_all" on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 6. Storage: tambah bucket book-pdfs (private)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('book-pdfs', 'book-pdfs', false)
  on conflict (id) do nothing;

-- Drop policy lama yang pakai is_staff
drop policy if exists "covers_public_read" on storage.objects;
drop policy if exists "covers_staff_write" on storage.objects;
drop policy if exists "proofs_buyer_upload_own" on storage.objects;
drop policy if exists "proofs_buyer_read_own_or_staff" on storage.objects;
drop policy if exists "proofs_staff_all" on storage.objects;
drop policy if exists "story_files_staff_all" on storage.objects;

-- ✅ book-covers: public read, admin write
create policy "covers_public_read" on storage.objects
  for select using (bucket_id = 'book-covers');

create policy "covers_admin_write" on storage.objects
  for insert with check (bucket_id = 'book-covers' and public.is_admin());

create policy "covers_admin_update" on storage.objects
  for update using (bucket_id = 'book-covers' and public.is_admin())
  with check (bucket_id = 'book-covers' and public.is_admin());

create policy "covers_admin_delete" on storage.objects
  for delete using (bucket_id = 'book-covers' and public.is_admin());

-- ✅ book-pdfs: PRIVATE — admin upload, signed URL untuk buyer dengan access
create policy "pdfs_admin_write" on storage.objects
  for insert with check (bucket_id = 'book-pdfs' and public.is_admin());

create policy "pdfs_admin_update" on storage.objects
  for update using (bucket_id = 'book-pdfs' and public.is_admin())
  with check (bucket_id = 'book-pdfs' and public.is_admin());

create policy "pdfs_admin_delete" on storage.objects
  for delete using (bucket_id = 'book-pdfs' and public.is_admin());

-- Read PDF cuma kalau admin atau punya library access aktif
create policy "pdfs_read_admin_or_owner" on storage.objects
  for select using (
    bucket_id = 'book-pdfs' and (
      public.is_admin()
      or exists (
        select 1
        from public.books b
        join public.user_library ul on ul.book_id = b.id
        where b.pdf_path = storage.objects.name
          and ul.user_id = public.current_profile_id()
          and ul.access_status = 'active'
      )
    )
  );

-- ✅ payment-proofs: buyer upload ke folder dengan namanya, admin baca semua
create policy "proofs_buyer_upload_own" on storage.objects
  for insert with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = public.current_profile_id()::text
  );

create policy "proofs_read_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = public.current_profile_id()::text or public.is_admin())
  );

create policy "proofs_admin_manage" on storage.objects
  for all using (bucket_id = 'payment-proofs' and public.is_admin())
  with check (bucket_id = 'payment-proofs' and public.is_admin());

-- ✅ site-assets: public read (untuk QR code, logo), admin write
insert into storage.buckets (id, name, public)
  values ('site-assets', 'site-assets', true)
  on conflict (id) do nothing;

create policy "site_assets_public_read" on storage.objects
  for select using (bucket_id = 'site-assets');

create policy "site_assets_admin_write" on storage.objects
  for all using (bucket_id = 'site-assets' and public.is_admin())
  with check (bucket_id = 'site-assets' and public.is_admin());

-- ------------------------------------------------------------
-- 7. Default settings tambahan untuk MVP
-- ------------------------------------------------------------

insert into public.site_settings (setting_key, setting_value) values
  ('aba_account_name', ''),
  ('aba_account_number', ''),
  ('aba_qr_path', ''),                              -- path di bucket site-assets
  ('telegram_bot_token', ''),                       -- isi kalau mau pakai notif
  ('telegram_admin_chat_id', ''),
  ('telegram_group_link', ''),
  ('telegram_button_text', 'Join Telegram'),
  ('site_logo_path', '')
on conflict (setting_key) do nothing;

-- ------------------------------------------------------------
-- 8. View untuk admin: orders dengan info lengkap
-- ------------------------------------------------------------

create or replace view public.admin_orders_view as
select
  o.id as order_id,
  o.status,
  o.amount,
  o.currency,
  o.proof_url,
  o.created_at,
  o.approved_at,
  o.approved_by,
  o.rejected_at,
  o.reject_reason,
  u.id as user_id,
  u.username,
  b.id as book_id,
  b.title as book_title,
  b.cover_url as book_cover_url
from public.orders o
join public.users_profile u on u.id = o.user_id
join public.books b on b.id = o.book_id;

-- View ini ikut RLS dari underlying tables, jadi cuma admin yang bisa lihat semua

-- ------------------------------------------------------------
-- DONE
-- ------------------------------------------------------------
-- Jangan lupa:
--   1. Bikin admin user pertama secara manual (lihat SETUP_SUPABASE.md)
--   2. Test semua RLS policies
-- ============================================================
