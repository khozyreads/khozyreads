create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users_profile (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade unique,
  username text unique not null check (username ~ '^[a-zA-Z]+[0-9]+$'),
  role text not null default 'buyer' check (role in ('buyer', 'seller', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  synopsis text,
  cover_url text,
  creator text,
  price numeric not null check (price >= 0),
  currency text not null default 'USD',
  language text not null default 'kh',
  total_episodes integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  is_buy_enabled boolean not null default true,
  buy_disabled_remark text,
  available_from timestamptz,
  available_until timestamptz,
  telegram_group_url text,
  telegram_button_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  episode_title text,
  episode_content text,
  source_file_url text,
  status text not null default 'published' check (status in ('published', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, episode_number)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  currency text not null default 'USD',
  payment_method text not null default 'ABA QR / KHQR',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  proof_url text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.users_profile(id),
  rejected_at timestamptz,
  reject_reason text
);

create table if not exists public.user_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users_profile(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  access_status text not null default 'active' check (access_status in ('active', 'locked')),
  created_at timestamptz not null default now(),
  unique(user_id, book_id)
);

create table if not exists public.payment_approval_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  action text not null check (action in ('approved', 'rejected')),
  action_by text,
  action_source text not null check (action_source in ('telegram', 'dashboard')),
  created_at timestamptz not null default now(),
  remark text
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value text,
  updated_at timestamptz not null default now()
);

create trigger users_profile_touch_updated_at before update on public.users_profile
for each row execute function public.touch_updated_at();
create trigger books_touch_updated_at before update on public.books
for each row execute function public.touch_updated_at();
create trigger episodes_touch_updated_at before update on public.episodes
for each row execute function public.touch_updated_at();
create trigger site_settings_touch_updated_at before update on public.site_settings
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_id()
returns uuid stable language sql security definer set search_path = public as $$
  select id from public.users_profile where auth_user_id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean stable language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.users_profile
    where auth_user_id = auth.uid() and role in ('seller', 'admin')
  )
$$;

create or replace function public.can_purchase(target_book_id uuid)
returns boolean stable language sql as $$
  select exists (
    select 1 from public.books
    where id = target_book_id
      and status = 'active'
      and is_buy_enabled = true
      and (available_from is null or now() >= available_from)
      and (available_until is null or now() <= available_until)
  )
$$;

create or replace function public.refresh_book_episode_count(target_book_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.books
  set total_episodes = (
    select count(*)::integer from public.episodes
    where book_id = target_book_id and status = 'published'
  )
  where id = target_book_id;
end;
$$;

create or replace function public.sync_episode_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  target = coalesce(new.book_id, old.book_id);
  perform public.refresh_book_episode_count(target);
  return coalesce(new, old);
end;
$$;

create trigger episodes_sync_count after insert or update or delete on public.episodes
for each row execute function public.sync_episode_count();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  profile_username text;
begin
  profile_username = lower(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  ));

  insert into public.users_profile (auth_user_id, username, role)
  values (new.id, profile_username, 'buyer')
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.site_settings (setting_key, setting_value) values
  ('website_name', 'KhozyReads'),
  ('default_language', 'kh'),
  ('working_hours_start', '09:00'),
  ('working_hours_end', '19:00'),
  ('payment_notice_en', 'Payment verification is handled manually during working hours only. Payments made outside working hours may experience delay. Please upload a clear payment receipt after completing your payment.'),
  ('payment_notice_kh', 'ការផ្ទៀងផ្ទាត់ការទូទាត់ធ្វើដោយដៃតែក្នុងម៉ោងធ្វើការប៉ុណ្ណោះ។ ការទូទាត់ក្រៅម៉ោងធ្វើការអាចយឺត។ សូមបង្ហោះបង្កាន់ដៃច្បាស់បន្ទាប់ពីទូទាត់រួច។'),
  ('default_currency', 'USD')
on conflict (setting_key) do update set setting_value = excluded.setting_value;

insert into storage.buckets (id, name, public) values
  ('book-covers', 'book-covers', true),
  ('payment-proofs', 'payment-proofs', false),
  ('story-files', 'story-files', false)
on conflict (id) do nothing;

alter table public.users_profile enable row level security;
alter table public.books enable row level security;
alter table public.episodes enable row level security;
alter table public.orders enable row level security;
alter table public.user_library enable row level security;
alter table public.payment_approval_logs enable row level security;
alter table public.site_settings enable row level security;

create policy "profiles_select_own_or_staff" on public.users_profile
for select using (auth_user_id = auth.uid() or public.is_staff());
create policy "profiles_insert_own" on public.users_profile
for insert with check (auth_user_id = auth.uid() and role = 'buyer');
create policy "profiles_update_own_or_staff" on public.users_profile
for update using (auth_user_id = auth.uid() or public.is_staff())
with check (auth_user_id = auth.uid() or public.is_staff());

create policy "books_public_active_read" on public.books
for select using (status = 'active' or public.is_staff());
create policy "books_staff_all" on public.books
for all using (public.is_staff()) with check (public.is_staff());

create policy "episodes_staff_all" on public.episodes
for all using (public.is_staff()) with check (public.is_staff());
create policy "episodes_buyer_read_with_access" on public.episodes
for select using (
  status = 'published' and exists (
    select 1 from public.user_library ul
    where ul.book_id = episodes.book_id
      and ul.user_id = public.current_profile_id()
      and ul.access_status = 'active'
  )
);

create policy "orders_buyer_read_own" on public.orders
for select using (user_id = public.current_profile_id() or public.is_staff());
create policy "orders_buyer_create_own_open_book" on public.orders
for insert with check (
  user_id = public.current_profile_id()
  and status = 'pending'
  and public.can_purchase(book_id)
);
create policy "orders_buyer_update_own_pending_proof" on public.orders
for update using (user_id = public.current_profile_id() and status = 'pending')
with check (user_id = public.current_profile_id() and status = 'pending');
create policy "orders_staff_all" on public.orders
for all using (public.is_staff()) with check (public.is_staff());

create policy "library_read_own_or_staff" on public.user_library
for select using (user_id = public.current_profile_id() or public.is_staff());
create policy "library_staff_all" on public.user_library
for all using (public.is_staff()) with check (public.is_staff());

create policy "logs_staff_read" on public.payment_approval_logs
for select using (public.is_staff());
create policy "logs_staff_insert" on public.payment_approval_logs
for insert with check (public.is_staff());

create policy "settings_public_read" on public.site_settings
for select using (true);
create policy "settings_staff_all" on public.site_settings
for all using (public.is_staff()) with check (public.is_staff());

create policy "covers_public_read" on storage.objects
for select using (bucket_id = 'book-covers');
create policy "covers_staff_write" on storage.objects
for all using (bucket_id = 'book-covers' and public.is_staff())
with check (bucket_id = 'book-covers' and public.is_staff());

create policy "proofs_buyer_upload_own" on storage.objects
for insert with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = public.current_profile_id()::text
);
create policy "proofs_buyer_read_own_or_staff" on storage.objects
for select using (
  bucket_id = 'payment-proofs'
  and ((storage.foldername(name))[1] = public.current_profile_id()::text or public.is_staff())
);
create policy "proofs_staff_all" on storage.objects
for all using (bucket_id = 'payment-proofs' and public.is_staff())
with check (bucket_id = 'payment-proofs' and public.is_staff());

create policy "story_files_staff_all" on storage.objects
for all using (bucket_id = 'story-files' and public.is_staff())
with check (bucket_id = 'story-files' and public.is_staff());
