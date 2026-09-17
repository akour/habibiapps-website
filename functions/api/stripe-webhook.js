import { handleError, json, stripeGet, supabase } from "./_shared.js";

const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
const safeEqual = (a, b) => a.length === b.length && [...a].every((value, index) => value === b[index]);

async function verify(payload, signature, secret) {
  const parts = Object.fromEntries(signature.split(",").map(part => part.split("=")));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${parts.t}.${payload}`)));
  return safeEqual(digest, parts.v1);
}

async function persistSubscription(env, subscription, fallbackUserId) {
  let userId = subscription.metadata?.user_id || fallbackUserId;
  if (!userId && subscription.customer) {
    const rows = await supabase(env, `subscriptions?stripe_customer_id=eq.${encodeURIComponent(subscription.customer)}&select=user_id`);
    userId = rows?.[0]?.user_id;
  }
  if (!userId) return;
  await supabase(env, "subscriptions?on_conflict=user_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: userId,
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    })
  });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new Response("Webhook is not configured", { status: 503 });
    const payload = await request.text();
    if (!await verify(payload, request.headers.get("stripe-signature") || "", env.STRIPE_WEBHOOK_SECRET)) return json({ error: "Invalid signature" }, 400);
    const event = JSON.parse(payload);
    if (event.type.startsWith("customer.subscription.")) await persistSubscription(env, event.data.object);
    if (event.type === "checkout.session.completed" && event.data.object.subscription) {
      const subscription = await stripeGet(env, `subscriptions/${event.data.object.subscription}`);
      await persistSubscription(env, subscription, event.data.object.client_reference_id);
    }
    return json({ received: true });
  } catch (error) { return handleError(error); }
}
