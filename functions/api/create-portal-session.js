import { getUser, handleError, json, stripe, supabase } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    const origin = new URL(request.url).origin;
    const rows = await supabase(env, `subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`);
    const customer = rows?.[0]?.stripe_customer_id;
    if (!customer) return json({ error: "No billing account exists yet." }, 404);
    const session = await stripe(env, "billing_portal/sessions", { customer, return_url: `${origin}/available-jobs/dashboard.html` });
    return json({ url: session.url });
  } catch (error) { return handleError(error); }
}
