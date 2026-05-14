-- ============================================================
-- 008_promo_codes_and_favorites.sql
-- ============================================================
-- Adds two new features:
--   1. Promo codes — admin creates codes, buyers apply at checkout
--      for % discount. Includes usage tracking per code for
--      influencer / partnership analytics.
--   2. Book favorites — buyers can favorite books to purchase later.
-- ============================================================

-- ------------------------------------------------------------
-- 1. promo_codes table
-- ------------------------------------------------------------
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_percent numeric not null check (discount_percent > 0 and discount_percent <= 100),
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users_profile(id)
);

create index if not exists idx_promo_codes_code on public.promo_codes (code);
create index if not exists idx_promo_codes_active on public.promo_codes (is_active) where is_active = true;

-- Normalize codes to uppercase for case-insensitive lookup
create or replace function public.tg_promo_code_upper()
returns trigger language plpgsql as $$
begin
  new.code := upper(trim(new.code));
  return new;
end
$$;

drop trigger if exists promo_code_upper on public.promo_codes;
create trigger promo_code_upper
  before insert or update on public.promo_codes
  for each row execute function public.tg_promo_code_upper();

alter table public.promo_codes enable row level security;

-- Only admin can manage promo codes directly via RLS.
-- Buyers don't read this table; they go through validate_promo_code() function.
drop policy if exists "promo_admin_all" on public.promo_codes;
create policy "promo_admin_all" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 2. promo_code_usages table
-- ------------------------------------------------------------
create table if not exists public.promo_code_usages (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users_profile(id) on delete cascade,
  discount_percent numeric not null,
  discount_amount numeric not null,
  applied_at timestamptz not null default now(),
  unique (order_id)  -- one promo per order
);

create index if not exists idx_promo_usages_promo on public.promo_code_usages (promo_code_id);
create index if not exists idx_promo_usages_user on public.promo_code_usages (user_id);

alter table public.promo_code_usages enable row level security;

-- Buyers can see their own usage rows (so they know what they used);
-- Admin sees all.
drop policy if exists "promo_usage_own_or_admin" on public.promo_code_usages;
create policy "promo_usage_own_or_admin" on public.promo_code_usages
  for select using (user_id = public.current_profile_id() or public.is_admin());

-- Only redeem function (security definer) writes here. No direct insert/update for users.
drop policy if exists "promo_usage_admin_write" on public.promo_code_usages;
create policy "promo_usage_admin_write" on public.promo_code_usages
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 3. Extend orders table with promo + discount fields
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists original_amount numeric,
  add column if not exists discount_amount numeric not null default 0 check (discount_amount >= 0),
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null;

-- For existing orders, set original_amount = amount where null (idempotent backfill)
update public.orders set original_amount = amount where original_amount is null;

-- ------------------------------------------------------------
-- 4. book_favorites table
-- ------------------------------------------------------------
create table if not exists public.book_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index if not exists idx_favorites_user on public.book_favorites (user_id);
create index if not exists idx_favorites_book on public.book_favorites (book_id);

alter table public.book_favorites enable row level security;

drop policy if exists "favorites_select_own_or_admin" on public.book_favorites;
create policy "favorites_select_own_or_admin" on public.book_favorites
  for select using (user_id = public.current_profile_id() or public.is_admin());

drop policy if exists "favorites_insert_own" on public.book_favorites;
create policy "favorites_insert_own" on public.book_favorites
  for insert with check (user_id = public.current_profile_id());

drop policy if exists "favorites_delete_own" on public.book_favorites;
create policy "favorites_delete_own" on public.book_favorites
  for delete using (user_id = public.current_profile_id());

-- ============================================================
-- DONE
-- Next migration (009) will add the RPC functions.
-- ============================================================
