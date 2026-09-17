# Habibi Apps Website

Official website and publishing hub for **Habibi Apps**, an independent mobile apps and games studio.

The site showcases released and upcoming products, hosts product pages and privacy policies required for Google Play, and includes the Available Jobs career radar for mobile gaming and ASO roles. It is deployed through Cloudflare Pages and acts as the central home for the Habibi Apps portfolio.

## What lives here

- Habibi Apps homepage and studio information
- Product pages for games and apps
- Privacy and compliance pages
- Portfolio and testimonials
- Mobile games / ASO jobs dashboard and daily refresh automation

## Deployment

Deployed through Cloudflare Pages.

## Habibi Jobs SaaS shell

The `available-jobs/` product now includes:

- Public landing page and founding-plan pricing
- Three-step early-access onboarding
- Local prototype sign-in
- Live job-radar demo
- Draft privacy policy and terms

The production backend uses Cloudflare Pages Functions, Supabase Auth/Postgres,
Stripe Checkout and Resend. See `BACKEND_SETUP.md` for the required database
migration, environment variables, webhook and deployment setup. The public signup
fails safely until those services are configured.
