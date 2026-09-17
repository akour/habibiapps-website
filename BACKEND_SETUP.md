# Habibi Jobs backend setup

The backend code is included, but external services must be configured before signup and billing work.

## 1. Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Authentication → URL Configuration, set:
   - Site URL: `https://habibiapps.com`
   - Redirect URLs: `https://habibiapps.com/available-jobs/**`
4. Keep email confirmation enabled for public launch.
5. Copy the project URL, anon key and service-role key.

Never expose the service-role key in browser code.

## 2. Stripe

1. Create a recurring product named `Habibi Jobs — Founding plan`.
2. Create a USD $9 monthly price and copy its `price_...` ID.
3. Enable the Stripe customer portal.
4. Add a webhook endpoint:
   `https://habibiapps.com/api/stripe-webhook`
5. Subscribe it to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Copy the webhook signing secret.

Start with Stripe test-mode keys. Switch to live keys only after an end-to-end test.

## 3. Cloudflare Pages variables

Add these production environment variables to the existing Pages project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — encrypted
- `STRIPE_SECRET_KEY` — encrypted
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET` — encrypted

Cloudflare deploys the root `functions/` directory as Pages Functions.

## 4. GitHub Actions secrets

Add these repository secrets for personalized daily emails:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` (already used by the personal digest)
- `JOBS_EMAIL_FROM`

The daily workflow refreshes the shared mobile-career job catalog, sends the original personal digest, then sends one personalized digest to every active or trialing subscriber.

## 5. Resend

Verify the sending domain and set `JOBS_EMAIL_FROM`, for example:

`Habibi Jobs <jobs@habibiapps.com>`

## Required launch checks

- Create a new account and confirm its email.
- Verify the profile row is created in Supabase.
- Complete Stripe Checkout in test mode.
- Verify the webhook changes subscription status to `trialing`.
- Open the billing portal and cancel the test subscription.
- Run the GitHub workflow manually and confirm one subscriber email.
- Request a password reset and set a new password.
- Review the privacy policy and terms with qualified legal counsel.
