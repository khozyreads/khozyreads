-- ============================================================
-- Migration 024: Reading subscription ("renting") — all paid books, one pass
-- ============================================================
-- * Free books stay free (claim as before).
-- * Paid books are read with an ACTIVE subscription (daily/weekly/monthly/annual).
-- * No auto-renew: when ends_at passes, access locks until the reader pays again.
-- * Existing per-book purchases (user_library.access_status='active') keep
--   lifetime access — nothing is revoked.
-- ============================================================

-- 1. Plans (prices editable from admin)
create table if not exists public.subscription_plans (
  code          text primary key,                -- daily | weekly | monthly | annual
  name_en       text not null,
  name_kh       text not null,
  duration_days integer not null check (duration_days > 0),
  price         numeric not null check (price > 0),
  currency      text not null default 'KHR' check (currency in ('KHR','USD')),
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  shopify_product_id text,
  shopify_variant_id text,
  shopify_synced_price text,
  updated_at    timestamptz not null default now()
);

insert into public.subscription_plans (code, name_en, name_kh, duration_days, price, currency, sort_order) values
  ('daily',   'Daily',   'ប្រចាំថ្ងៃ',  1,   2000,   'KHR', 1),
  ('weekly',  'Weekly',  'ប្រចាំសប្តាហ៍', 7,   10000,  'KHR', 2),
  ('monthly', 'Monthly', 'ប្រចាំខែ',   30,  50000,  'KHR', 3),
  ('annual',  'Annual',  'ប្រចាំឆ្នាំ',  365, 500000, 'KHR', 4)
on conflict (code) do nothing;

alter table public.subscription_plans enable row level security;
drop policy if exists "plans_public_read" on public.subscription_plans;
create policy "plans_public_read" on public.subscription_plans for select using (true);
drop policy if exists "plans_admin_all" on public.subscription_plans;
create policy "plans_admin_all" on public.subscription_plans for all using (public.is_admin()) with check (public.is_admin());

-- 2. Subscriptions (one row per paid period; renewals append rows)
create table if not exists public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users_profile(id) on delete cascade,
  plan_code  text not null references public.subscription_plans(code),
  order_id   uuid references public.orders(id) on delete set null,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user_ends_idx on public.subscriptions (user_id, ends_at desc);

alter table public.subscriptions enable row level security;
drop policy if exists "subs_read_own_or_admin" on public.subscriptions;
create policy "subs_read_own_or_admin" on public.subscriptions
  for select using (user_id = public.current_profile_id() or public.is_admin());
drop policy if exists "subs_admin_all" on public.subscriptions;
create policy "subs_admin_all" on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());
-- (inserts come from edge functions via service role after payment)

-- 3. Helper: does this user have an active pass right now?
create or replace function public.has_active_subscription(p_user_id uuid default public.current_profile_id())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id and s.ends_at > now()
  );
$$;
grant execute on function public.has_active_subscription(uuid) to authenticated, anon;

-- Current subscription summary for the signed-in user (ends_at of the latest period)
create or replace function public.my_subscription()
returns table(plan_code text, starts_at timestamptz, ends_at timestamptz, is_active boolean)
language sql stable security definer set search_path = public
as $$
  select s.plan_code, s.starts_at, s.ends_at, (s.ends_at > now()) as is_active
  from public.subscriptions s
  where s.user_id = public.current_profile_id()
  order by s.ends_at desc
  limit 1;
$$;
grant execute on function public.my_subscription() to authenticated;

-- 4. Orders can now be subscription orders (no book)
alter table public.orders alter column book_id drop not null;
alter table public.orders
  add column if not exists kind text not null default 'book' check (kind in ('book','subscription')),
  add column if not exists plan_code text references public.subscription_plans(code);

-- Buyers may create pending orders for a purchasable book OR an active plan
drop policy if exists "orders_buyer_create_own" on public.orders;
create policy "orders_buyer_create_own" on public.orders
  for insert with check (
    user_id = public.current_profile_id()
    and status = 'pending'
    and (
      (kind = 'book' and book_id is not null and public.can_purchase(book_id))
      or
      (kind = 'subscription' and plan_code is not null
        and exists (select 1 from public.subscription_plans p where p.code = plan_code and p.is_active))
    )
  );

-- 5. Access: book pages readable by owners OR active subscribers
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
    or public.has_active_subscription()
  );

-- 6. Reading progress for subscribers: keep a 'locked' library row as a bookmark
--    ('locked' never grants access by itself; only 'active' or a live subscription does)
create or replace function public.update_reading_progress(p_book_id uuid, p_last_page integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if p_last_page is null or p_last_page < 1 then return false; end if;
  v_profile_id := public.current_profile_id();
  if v_profile_id is null then return false; end if;

  update public.user_library
  set last_page = p_last_page, last_read_at = now()
  where user_id = v_profile_id and book_id = p_book_id;
  if found then return true; end if;

  -- No row yet: subscribers get a bookmark row (locked = no standalone access)
  if public.has_active_subscription(v_profile_id) then
    insert into public.user_library (user_id, book_id, access_status, last_page, last_read_at)
    values (v_profile_id, p_book_id, 'locked', p_last_page, now())
    on conflict (user_id, book_id) do update set last_page = excluded.last_page, last_read_at = now();
    return true;
  end if;
  return false;
end;
$$;

-- 7. Admin orders view: books optional, show plan
drop view if exists public.admin_orders_view;
create view public.admin_orders_view as
select
  o.id as order_id, o.status, o.amount, o.currency, o.proof_url, o.created_at, o.approved_at, o.approved_by,
  o.rejected_at, o.reject_reason, u.id as user_id, u.username, b.id as book_id, b.title as book_title,
  b.cover_url as book_cover_url, o.original_amount, o.discount_amount, o.promo_code_id,
  pc.code as promo_code, pc.notes as promo_notes, pc.discount_percent as promo_discount_percent,
  o.kind, o.plan_code, o.payment_method
from public.orders o
join public.users_profile u on u.id = o.user_id
left join public.books b on b.id = o.book_id
left join public.promo_codes pc on pc.id = o.promo_code_id;
alter view public.admin_orders_view set (security_invoker = on);

-- 8. Admin helper: grant/extend a subscription from an approved order (also used by edge fns)
create or replace function public.grant_subscription_for_order(p_order_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_order record; v_plan record; v_start timestamptz; v_end timestamptz; v_prev timestamptz;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null or v_order.kind <> 'subscription' or v_order.plan_code is null then return null; end if;
  if exists (select 1 from public.subscriptions where order_id = p_order_id) then
    select ends_at into v_end from public.subscriptions where order_id = p_order_id; return v_end;  -- idempotent
  end if;
  select * into v_plan from public.subscription_plans where code = v_order.plan_code;
  select max(ends_at) into v_prev from public.subscriptions where user_id = v_order.user_id;
  v_start := greatest(now(), coalesce(v_prev, now()));     -- renew early → extend from current end
  v_end := v_start + make_interval(days => v_plan.duration_days);
  insert into public.subscriptions (user_id, plan_code, order_id, starts_at, ends_at)
  values (v_order.user_id, v_order.plan_code, p_order_id, v_start, v_end);
  return v_end;
end;
$$;
revoke all on function public.grant_subscription_for_order(uuid) from public;
grant execute on function public.grant_subscription_for_order(uuid) to service_role;

-- Dashboard approve (existing RPC used by admin.html): now subscription-aware
create or replace function public.admin_approve_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_admin_id uuid; v_admin_username text; v_end timestamptz;
begin
  select id, username into v_admin_id, v_admin_username
  from public.users_profile where auth_user_id = auth.uid() and role = 'admin';
  if v_admin_id is null then raise exception 'Admin only' using errcode = '42501'; end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;

  update public.orders
  set status = 'approved', approved_at = now(), approved_by = v_admin_id, rejected_at = null, reject_reason = null
  where id = p_order_id;

  if v_order.kind = 'subscription' then
    v_end := public.grant_subscription_for_order(p_order_id);
  elsif v_order.book_id is not null then
    insert into public.user_library (user_id, book_id, access_status)
    values (v_order.user_id, v_order.book_id, 'active')
    on conflict (user_id, book_id) do update set access_status = 'active';
  end if;

  insert into public.activity_logs (action, actor_user_id, actor_username, target_type, target_id, details)
  values ('order.approve', v_admin_id, v_admin_username, 'order', p_order_id::text,
    jsonb_build_object('book_id', v_order.book_id, 'plan_code', v_order.plan_code, 'buyer_id', v_order.user_id, 'ends_at', v_end));
end;
$$;

notify pgrst, 'reload schema';
