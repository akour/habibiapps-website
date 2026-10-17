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

The daily workflow builds search queries from active subscriber profiles, refreshes the shared job catalog, sends the original personal digest, then sends one personalized digest to every active or trialing subscriber.

Resume files are stored in the private Supabase Storage bucket named `resumes`. Users can only access objects inside their own user-ID folder, and uploads are limited to PDF, DOCX or TXT files up to 5 MB.

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

## Personalized delivery reliability

Apply `supabase/migrations/20261014145612_reliable_subscriber_digests.sql` before deploying the subscriber worker. It stores one frozen email payload per user per UTC day, accessible only to the server role. Retries use the same Resend idempotency key and payload. Successful daily sends (including empty digests) are skipped on rerun. Weekly profiles send on Mondays UTC; paused profiles are excluded. Applied and dismissed roles are excluded from emails.

Both Supabase secrets are required: missing configuration now fails the search instead of silently falling back to the owner's profile. The personal/demo queries remain in discovery, but their exclusions no longer remove jobs from other users' catalog. Subscriber queries are deduplicated without a global user/title cutoff. The remaining sequential discovery pipeline is bounded by the workflow timeout, so large-scale traffic requires a queued discovery worker. LinkedIn failures and limited company-source coverage still require monitoring; a niche with no results does not establish that no suitable jobs exist.

Only scheduled or manually requested runs send email. Pushes refresh data without sending email. Test with `node --test available-jobs/scripts/*.test.mjs`; the delivery test mocks the network and never sends email.

Release gate: configure the two backend GitHub secrets, verify signup and email confirmation with a test account, activate a test subscription, and run the daily workflow to check real delivery. Do not describe public launch as verified before these checks pass.
