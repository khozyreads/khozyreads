-- ============================================================
-- Migration 005: Admin RPC functions for atomic order ops
-- ============================================================
-- Tujuan:
--   Bikin function yang dipanggil dari admin.html supaya
--   approve/reject order jadi 1 transaction (atomic).
-- ============================================================

-- Approve order: update status + grant library access + log (atomic)
create or replace function public.admin_approve_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_admin_id uuid;
  v_admin_username text;
begin
  select id, username into v_admin_id, v_admin_username
  from public.users_profile
  where auth_user_id = auth.uid() and role = 'admin';

  if v_admin_id is null then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  update public.orders
  set status = 'approved',
      approved_at = now(),
      approved_by = v_admin_id,
      rejected_at = null,
      reject_reason = null
  where id = p_order_id;

  insert into public.user_library (user_id, book_id, access_status)
  values (v_order.user_id, v_order.book_id, 'active')
  on conflict (user_id, book_id) do update set access_status = 'active';

  insert into public.activity_logs (action, actor_user_id, actor_username, target_type, target_id, details)
  values ('order.approve', v_admin_id, v_admin_username, 'order', p_order_id::text,
    jsonb_build_object('book_id', v_order.book_id, 'buyer_id', v_order.user_id));
end;
$$;

-- Reject order: update status + log (atomic)
create or replace function public.admin_reject_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_admin_username text;
begin
  select id, username into v_admin_id, v_admin_username
  from public.users_profile
  where auth_user_id = auth.uid() and role = 'admin';

  if v_admin_id is null then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  update public.orders
  set status = 'rejected',
      rejected_at = now(),
      reject_reason = p_reason
  where id = p_order_id;

  insert into public.activity_logs (action, actor_user_id, actor_username, target_type, target_id, details)
  values ('order.reject', v_admin_id, v_admin_username, 'order', p_order_id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

-- Allow authenticated users to call these (server-side check enforces admin role)
grant execute on function public.admin_approve_order(uuid) to authenticated;
grant execute on function public.admin_reject_order(uuid, text) to authenticated;

-- ============================================================
-- Done
-- ============================================================
