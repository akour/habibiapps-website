alter table public.profiles
  add column if not exists skills text[] not null default '{}',
  add column if not exists seniority text[] not null default '{}',
  add column if not exists industries text[] not null default '{}',
  add column if not exists resume_path text,
  add column if not exists resume_name text,
  add column if not exists resume_uploaded_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own resumes" on storage.objects;
create policy "Users read own resumes" on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users upload own resumes" on storage.objects;
create policy "Users upload own resumes" on storage.objects for insert to authenticated
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users update own resumes" on storage.objects;
create policy "Users update own resumes" on storage.objects for update to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete own resumes" on storage.objects;
create policy "Users delete own resumes" on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    user_id, email, name, roles, skills, seniority, industries,
    location, work_modes, dealbreakers
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'roles')), '{}'),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'skills')), '{}'),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'seniority')), '{}'),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'industries')), '{}'),
    coalesce(new.raw_user_meta_data ->> 'location', 'Worldwide'),
    coalesce(array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'work_modes')), '{Remote}'),
    coalesce(new.raw_user_meta_data ->> 'dealbreakers', '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
