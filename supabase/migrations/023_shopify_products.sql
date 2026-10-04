-- Migration 023: map KhozyReads books → auto-created Shopify products
-- (so the Shopify checkout shows the real book cover + clean title)
alter table public.books
  add column if not exists shopify_product_id text,
  add column if not exists shopify_variant_id text,
  add column if not exists shopify_synced_price text;   -- "12300 KHR" last price pushed to Shopify

notify pgrst, 'reload schema';
