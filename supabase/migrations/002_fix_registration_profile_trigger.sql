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

drop policy if exists "profiles_insert_own" on public.users_profile;
create policy "profiles_insert_own" on public.users_profile
for insert with check (
  auth_user_id = auth.uid()
  and role = 'buyer'
);
