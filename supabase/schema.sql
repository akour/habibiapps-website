create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  roles text[] not null default '{}',
  skills text[] not null default '{}',
  seniority text[] not null default '{}',
  industries text[] not null default '{}',
  location text not null default 'Worldwide',
  work_modes text[] not null default '{Remote}',
  dealbreakers text not null default '',
  excluded_companies text[] not null default '{}',
  resume_path text,
  resume_name text,
  resume_uploaded_at timestamptz,
  email_frequency text not null default 'daily' check (email_frequency in ('daily','weekly','off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  billing_provider text not null default 'lemon_squeezy' check (billing_provider in ('lemon_squeezy', 'stripe')),
  lemon_squeezy_customer_id text unique,
  lemon_squeezy_subscription_id text unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  billing_test_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.job_deliveries (
  user_id uuid references auth.users(id) on delete cascade,
  job_url text not null,
  delivered_at timestamptz not null default now(),
  primary key (user_id, job_url)
);

create table if not exists public.job_feedback (
  user_id uuid references auth.users(id) on delete cascade,
  job_url text not null,
  status text not null check (status in ('opened','applied','dismissed')),
  company text not null default '',
  title text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, job_url)
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.job_deliveries enable row level security;
alter table public.job_feedback enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = user_id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update using (auth.uid() = user_id);
drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription" on public.subscriptions for select using (auth.uid() = user_id);
drop policy if exists "Users read own deliveries" on public.job_deliveries;
create policy "Users read own deliveries" on public.job_deliveries for select using (auth.uid() = user_id);
drop policy if exists "Users manage own feedback" on public.job_feedback;
create policy "Users manage own feedback" on public.job_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists deliveries_user_date_idx on public.job_deliveries(user_id, delivered_at desc);
create index if not exists feedback_user_date_idx on public.job_feedback(user_id, updated_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, name, roles, skills, seniority, industries, location, work_modes, dealbreakers)
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

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
