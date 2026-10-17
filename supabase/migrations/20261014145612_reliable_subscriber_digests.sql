-- A frozen payload makes retries safe even if the catalog changes between runs.
create table if not exists public.digest_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  digest_date date not null,
  payload jsonb not null,
  job_urls text[] not null default '{}',
  sent_at timestamptz,
  primary key (user_id, digest_date)
);
alter table public.digest_runs enable row level security;
revoke all on public.digest_runs from anon, authenticated;
grant all on public.digest_runs to service_role;
