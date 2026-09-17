import { getUser, handleError, json, stripe, supabase } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.STRIPE_PRICE_ID) throw new Response("Billing is not configured", { status: 503 });
    const user = await getUser(request, env);
    const origin = new URL(request.url).origin;
    const existing = await supabase(env, `subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,status`);
    let customerId = existing?.[0]?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe(env, "customers", { email: user.email, "metadata[user_id]": user.id });
      customerId = customer.id;
    }
    const session = await stripe(env, "checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      "line_items[0][price]": env.STRIPE_PRICE_ID,
      "line_items[0][quantity]": 1,
      "subscription_data[trial_period_days]": 14,
      "subscription_data[metadata][user_id]": user.id,
      success_url: `${origin}/available-jobs/dashboard.html?checkout=success`,
      cancel_url: `${origin}/available-jobs/signup.html?checkout=cancelled`,
      allow_promotion_codes: "true"
    });
    return json({ url: session.url });
  } catch (error) { return handleError(error); }
}
