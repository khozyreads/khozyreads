-- ============================================================
-- Migration 021: ABA PayWay eCommerce Checkout (KHQR)
-- ============================================================
-- Automated payment: buyer pays via PayWay checkout → our edge function
-- verifies with PayWay's check-transaction API → order auto-approved and
-- library access granted. No manual proof upload / admin approval needed.
--
-- Design notes:
--  * PayWay `tran_id` max 20 chars, must be unique per merchant. One order
--    may get several tran_ids (buyer retries), so we keep a mapping table
--    instead of a single column — any paid tran_id resolves to its order.
--  * Secrets (merchant id / api key) live ONLY in edge function env.
-- ============================================================

-- 1. Mapping table: PayWay tran_id → order
create table if not exists public.payway_transactions (
  tran_id     text primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  amount      numeric not null,
  currency    text not null,
  status      text not null default 'created'
              check (status in ('created','approved','declined','cancelled','expired')),
  apv         text,
  created_at  timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists payway_transactions_order_idx
  on public.payway_transactions (order_id);

-- Only service role (edge functions) touches this table.
alter table public.payway_transactions enable row level security;

-- 2. Order columns for PayWay result
alter table public.orders
  add column if not exists payway_tran_id text,
  add column if not exists payway_apv text,
  add column if not exists paid_at timestamptz;

-- 3. Allow 'payway' as an approval source in the audit table
alter table public.payment_approval_logs
  drop constraint if exists payment_approval_logs_action_source_check;
alter table public.payment_approval_logs
  add constraint payment_approval_logs_action_source_check
  check (action_source in ('telegram', 'dashboard', 'payway'));

-- Reload PostgREST cache
notify pgrst, 'reload schema';
