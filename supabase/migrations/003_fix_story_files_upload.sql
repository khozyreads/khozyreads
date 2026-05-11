alter table public.episodes
add column if not exists source_file_url text;

insert into storage.buckets (id, name, public)
values ('story-files', 'story-files', false)
on conflict (id) do nothing;

drop policy if exists "story_files_staff_all" on storage.objects;
create policy "story_files_staff_all" on storage.objects
for all using (
  bucket_id = 'story-files'
  and public.is_staff()
)
with check (
  bucket_id = 'story-files'
  and public.is_staff()
);
