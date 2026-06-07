-- ============================================================
-- Migration 018: Telegram broadcast logs
-- ============================================================
-- Audit table for admin broadcast notifications. Each row =
-- one broadcast attempt (admin clicked "Send" on dashboard).
-- ============================================================

create table if not exists public.telegram_broadcast_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  recipients_total integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  failed_reasons jsonb,
  sent_by uuid references public.users_profile(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_telegram_broadcast_logs_sent_at
  on public.telegram_broadcast_logs (sent_at desc);

-- RLS: only staff can read/insert
alter table public.telegram_broadcast_logs enable row level security;

create policy "broadcast_logs_staff_all" on public.telegram_broadcast_logs
for all using (public.is_staff()) with check (public.is_staff());

-- Helper RPC: list all telegram_ids that can receive DMs
-- (users who logged in via Telegram and didn't block the bot)
create or replace function public.list_telegram_recipients()
returns table(telegram_id bigint, username text, full_name text)
language sql
security definer
set search_path = public, auth
as $$
  select
    up.telegram_id,
    up.username,
    coalesce(au.raw_user_meta_data->>'full_name', up.username) as full_name
  from public.users_profile up
  left join auth.users au on au.id = up.auth_user_id
  where up.telegram_id is not null
    and up.status = 'active'
  order by up.created_at desc;
$$;

revoke all on function public.list_telegram_recipients() from public;
grant execute on function public.list_telegram_recipients() to service_role;

notify pgrst, 'reload schema';
