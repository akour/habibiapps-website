alter table public.subscriptions
  add column if not exists billing_provider text not null default 'lemon_squeezy',
  add column if not exists lemon_squeezy_customer_id text,
  add column if not exists lemon_squeezy_subscription_id text,
  add column if not exists billing_test_mode boolean not null default false;

create unique index if not exists subscriptions_lemon_squeezy_customer_id_idx
  on public.subscriptions (lemon_squeezy_customer_id)
  where lemon_squeezy_customer_id is not null;

create unique index if not exists subscriptions_lemon_squeezy_subscription_id_idx
  on public.subscriptions (lemon_squeezy_subscription_id)
  where lemon_squeezy_subscription_id is not null;

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_provider_check;

alter table public.subscriptions
  add constraint subscriptions_billing_provider_check
  check (billing_provider in ('lemon_squeezy', 'stripe'));
