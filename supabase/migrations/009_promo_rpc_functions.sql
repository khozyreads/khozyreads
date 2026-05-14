-- ============================================================
-- 009_promo_rpc_functions.sql
-- ============================================================
-- RPC functions for promo code system + favorite book counters.
-- All sensitive logic (validation, atomic counter increment,
-- admin checks) lives in SECURITY DEFINER functions so it can't
-- be bypassed from the client.
-- ============================================================

-- ------------------------------------------------------------
-- validate_promo_code(p_code, p_amount)
-- ------------------------------------------------------------
-- Used by buyer at checkout to PREVIEW the discount before
-- submitting. Returns the discount percent + computed final
-- amount if the code is valid, otherwise an error message.
-- Read-only — does NOT increment used_count.
-- ------------------------------------------------------------
create or replace function public.validate_promo_code(
  p_code text,
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_promo public.promo_codes%rowtype;
  v_discount numeric;
  v_final numeric;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false, 'error', 'empty');
  end if;

  select * into v_promo from public.promo_codes where code = v_code limit 1;
  if not found then
    return jsonb_build_object('valid', false, 'error', 'not_found');
  end if;
  if not v_promo.is_active then
    return jsonb_build_object('valid', false, 'error', 'inactive');
  end if;
  if v_promo.valid_from is not null and now() < v_promo.valid_from then
    return jsonb_build_object('valid', false, 'error', 'not_started');
  end if;
  if v_promo.valid_until is not null and now() > v_promo.valid_until then
    return jsonb_build_object('valid', false, 'error', 'expired');
  end if;
  if v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then
    return jsonb_build_object('valid', false, 'error', 'maxed_out');
  end if;

  v_final := null;
  v_discount := null;
  if p_amount is not null and p_amount > 0 then
    v_discount := round((p_amount * v_promo.discount_percent / 100.0)::numeric, 2);
    v_final := greatest(0, p_amount - v_discount);
  end if;

  return jsonb_build_object(
    'valid', true,
    'discount_percent', v_promo.discount_percent,
    'discount_amount', v_discount,
    'final_amount', v_final
  );
end
$$;

revoke all on function public.validate_promo_code(text, numeric) from public, anon;
grant execute on function public.validate_promo_code(text, numeric) to authenticated;

-- ------------------------------------------------------------
-- apply_promo_to_order(p_order_id, p_code)
-- ------------------------------------------------------------
-- Called when buyer commits the code to a pending order.
-- Atomically:
--   - validates the code
--   - checks the caller owns the order and it is still pending
--   - increments used_count
--   - inserts promo_code_usages row (UNIQUE on order_id prevents
--     double-apply on the same order)
--   - updates orders.amount, original_amount, discount_amount,
--     promo_code_id
-- Returns the updated discount info.
-- ------------------------------------------------------------
create or replace function public.apply_promo_to_order(
  p_order_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_promo public.promo_codes%rowtype;
  v_order public.orders%rowtype;
  v_profile_id uuid := public.current_profile_id();
  v_base numeric;
  v_discount numeric;
  v_final numeric;
begin
  if v_profile_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_code = '' then
    raise exception 'empty code' using errcode = '22023';
  end if;

  -- Load order, verify ownership and status
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '02000';
  end if;
  if v_order.user_id != v_profile_id then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if v_order.status != 'pending' then
    raise exception 'order not pending' using errcode = '22023';
  end if;
  if v_order.promo_code_id is not null then
    raise exception 'promo already applied' using errcode = '22023';
  end if;

  -- Atomically increment counter only if still under cap
  update public.promo_codes
    set used_count = used_count + 1
    where code = v_code
      and is_active = true
      and (valid_from is null or now() >= valid_from)
      and (valid_until is null or now() <= valid_until)
      and (max_uses is null or used_count < max_uses)
    returning * into v_promo;

  if not found then
    raise exception 'promo code invalid or expired' using errcode = '22023';
  end if;

  -- Compute new amounts
  v_base := coalesce(v_order.original_amount, v_order.amount);
  v_discount := round((v_base * v_promo.discount_percent / 100.0)::numeric, 2);
  v_final := greatest(0, v_base - v_discount);

  -- Insert usage record (unique on order_id; if a concurrent call sneaks in
  -- between, the unique constraint causes a clean rollback)
  insert into public.promo_code_usages
    (promo_code_id, order_id, user_id, discount_percent, discount_amount)
    values (v_promo.id, v_order.id, v_profile_id, v_promo.discount_percent, v_discount);

  -- Update order
  update public.orders set
    original_amount = v_base,
    discount_amount = v_discount,
    amount = v_final,
    promo_code_id = v_promo.id
    where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'discount_percent', v_promo.discount_percent,
    'discount_amount', v_discount,
    'original_amount', v_base,
    'final_amount', v_final
  );
end
$$;

revoke all on function public.apply_promo_to_order(uuid, text) from public, anon;
grant execute on function public.apply_promo_to_order(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- admin_list_promo_codes()
-- ------------------------------------------------------------
-- Admin-only listing with usage stats (total_used, total_revenue).
-- ------------------------------------------------------------
create or replace function public.admin_list_promo_codes()
returns table(
  id uuid,
  code text,
  discount_percent numeric,
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer,
  used_count integer,
  is_active boolean,
  notes text,
  created_at timestamptz,
  total_revenue numeric,
  total_discount_given numeric,
  approved_uses integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'access denied: admin role required' using errcode = '42501';
  end if;

  return query
    select
      pc.id,
      pc.code,
      pc.discount_percent,
      pc.valid_from,
      pc.valid_until,
      pc.max_uses,
      pc.used_count,
      pc.is_active,
      pc.notes,
      pc.created_at,
      coalesce(sum(case when o.status = 'approved' then o.amount end), 0)::numeric as total_revenue,
      coalesce(sum(case when o.status = 'approved' then pcu.discount_amount end), 0)::numeric as total_discount_given,
      coalesce(count(case when o.status = 'approved' then 1 end), 0)::integer as approved_uses
    from public.promo_codes pc
    left join public.promo_code_usages pcu on pcu.promo_code_id = pc.id
    left join public.orders o on o.id = pcu.order_id
    group by pc.id
    order by pc.created_at desc;
end
$$;

revoke all on function public.admin_list_promo_codes() from public, anon;
grant execute on function public.admin_list_promo_codes() to authenticated;

-- ------------------------------------------------------------
-- toggle_favorite(p_book_id) — add or remove favorite, returns new state
-- ------------------------------------------------------------
create or replace function public.toggle_favorite(p_book_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_existing uuid;
begin
  if v_profile_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select id into v_existing
    from public.book_favorites
    where user_id = v_profile_id and book_id = p_book_id
    limit 1;

  if v_existing is not null then
    delete from public.book_favorites where id = v_existing;
    return jsonb_build_object('favorited', false);
  else
    insert into public.book_favorites (user_id, book_id) values (v_profile_id, p_book_id);
    return jsonb_build_object('favorited', true);
  end if;
end
$$;

revoke all on function public.toggle_favorite(uuid) from public, anon;
grant execute on function public.toggle_favorite(uuid) to authenticated;

-- ============================================================
-- DONE
-- ============================================================
