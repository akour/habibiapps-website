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

## 2. Lemon Squeezy

1. Create and activate a Lemon Squeezy store for Habibi Jobs.
2. Create a subscription product named `Habibi Jobs — Founding plan`.
3. Add a JOD 7.100 monthly variant with a 3-day free trial.
4. Copy the store ID and variant ID.
5. Create an API key under Settings → API.
6. Add a webhook endpoint:
   `https://mjmwfocpswpvqtmuxiqv.supabase.co/functions/v1/lemon-squeezy-webhook`
7. Subscribe it to all `subscription_*` events and set a strong signing secret.

Start in Lemon Squeezy test mode. Switch the product and environment setting to live only after an end-to-end test.

## 3. Supabase Edge Function secrets

Add these production secrets to the Supabase project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — encrypted
- `LEMON_SQUEEZY_API_KEY` — encrypted
- `LEMON_SQUEEZY_STORE_ID`
- `LEMON_SQUEEZY_VARIANT_ID`
- `LEMON_SQUEEZY_WEBHOOK_SECRET` — encrypted
- `LEMON_SQUEEZY_TEST_MODE` — `true` while testing, then `false`

Deploy `jobs-api` with JWT verification disabled because it performs its own token validation. Deploy `lemon-squeezy-webhook` with JWT verification disabled because it verifies Lemon Squeezy's HMAC signature.

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
- Complete Lemon Squeezy Checkout in test mode.
- Verify the webhook changes subscription status to `on_trial`.
- Open the billing portal and cancel the test subscription.
- Run the GitHub workflow manually and confirm one subscriber email.
- Request a password reset and set a new password.
- Review the privacy policy and terms with qualified legal counsel.
