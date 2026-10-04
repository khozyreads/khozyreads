-- ============================================================
-- Migration 022: Shopify checkout bridge (ABA PayWay via Shopify)
-- ============================================================
-- Buyer pays on a Shopify checkout (ABA PayWay KHQR enabled there).
-- Shopify posts an orders/paid webhook → shopify-webhook edge function
-- verifies HMAC → order auto-approved + library access granted.
-- ============================================================

alter table public.orders
  add column if not exists shopify_draft_order_id text,
  add column if not exists shopify_order_id text,
  add column if not exists shopify_order_name text,
  add column if not exists shopify_checkout_url text;

create index if not exists orders_shopify_order_idx on public.orders (shopify_order_id);

-- Allow 'shopify' as an approval source in the audit table
alter table public.payment_approval_logs
  drop constraint if exists payment_approval_logs_action_source_check;
alter table public.payment_approval_logs
  add constraint payment_approval_logs_action_source_check
  check (action_source in ('telegram', 'dashboard', 'payway', 'shopify'));

-- Which checkout the buyer sees: 'shopify' (via Shopify) or 'payway' (direct PayWay API)
insert into public.site_settings (setting_key, setting_value)
values ('payment_provider', 'shopify')
on conflict (setting_key) do nothing;

notify pgrst, 'reload schema';
