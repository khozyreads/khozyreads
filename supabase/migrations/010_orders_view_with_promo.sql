-- ============================================================
-- 010_orders_view_with_promo.sql
-- ============================================================
-- Extends admin_orders_view to include promo code info so admins
-- can see at a glance which orders used which promo (great for
-- influencer attribution and approval review).
--
-- security_invoker stays on (from migration 007) so the caller's
-- RLS is enforced — non-admins still can't see other users' orders.
-- ============================================================

-- Postgres can't change column order with CREATE OR REPLACE VIEW, so drop first.
drop view if exists public.admin_orders_view;

create view public.admin_orders_view as
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
  b.cover_url as book_cover_url,
  -- New columns appended at the end
  o.original_amount,
  o.discount_amount,
  o.promo_code_id,
  pc.code as promo_code,
  pc.notes as promo_notes,
  pc.discount_percent as promo_discount_percent
from public.orders o
join public.users_profile u on u.id = o.user_id
join public.books b on b.id = o.book_id
left join public.promo_codes pc on pc.id = o.promo_code_id;

-- Re-apply the security setting since CREATE OR REPLACE resets view options
alter view public.admin_orders_view set (security_invoker = on);

-- ============================================================
-- DONE
-- ============================================================
