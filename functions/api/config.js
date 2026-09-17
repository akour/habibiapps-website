import { json } from "./_shared.js";

export const onRequestGet = ({ env }) => json({
  configured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
  supabaseUrl: env.SUPABASE_URL || "",
  supabaseAnonKey: env.SUPABASE_ANON_KEY || "",
  billingConfigured: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID),
  plan: { name: "Founding plan", price: "$9/month", trialDays: 14 }
});
