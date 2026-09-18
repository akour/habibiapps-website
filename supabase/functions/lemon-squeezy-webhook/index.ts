const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

function envJson(name: string, legacyName: string) {
  const value = Deno.env.get(name);
  if (value) return JSON.parse(value).default as string;
  const legacy = Deno.env.get(legacyName);
  if (!legacy) throw new Error(`Missing ${name}`);
  return legacy;
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function verifySignature(body: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected, signature.toLowerCase());
}

async function database(path: string, init: RequestInit = {}) {
  const secretKey = envJson("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const headers: Record<string, string> = {
    apikey: secretKey,
    "content-type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (!secretKey.startsWith("sb_secret_")) headers.authorization = `Bearer ${secretKey}`;
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  if (!result.ok) throw new Error(`Database ${result.status}: ${await result.text()}`);
  const text = await result.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve(async request => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  try {
    const secret = Deno.env.get("LEMON_SQUEEZY_WEBHOOK_SECRET");
    const signature = request.headers.get("x-signature") ?? "";
    if (!secret) return response({ error: "Webhook is not configured" }, 503);
    const rawBody = await request.text();
    if (!signature || !(await verifySignature(rawBody, signature, secret))) return response({ error: "Invalid signature" }, 401);

    const payload = JSON.parse(rawBody);
    if (payload?.data?.type !== "subscriptions") return response({ received: true });
    const attributes = payload.data.attributes ?? {};
    const subscriptionId = String(payload.data.id ?? "");
    let userId = payload?.meta?.custom_data?.user_id ? String(payload.meta.custom_data.user_id) : "";
    if (!userId && subscriptionId) {
      const existing = await database(`subscriptions?lemon_squeezy_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=user_id`);
      userId = existing?.[0]?.user_id ?? "";
    }
    if (!userId || !subscriptionId) return response({ error: "Subscription is not linked to a user" }, 422);

    await database("subscriptions?on_conflict=user_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: userId,
        billing_provider: "lemon_squeezy",
        lemon_squeezy_customer_id: attributes.customer_id ? String(attributes.customer_id) : null,
        lemon_squeezy_subscription_id: subscriptionId,
        status: attributes.status ?? "incomplete",
        current_period_end: attributes.renews_at ?? attributes.ends_at ?? null,
        trial_ends_at: attributes.trial_ends_at ?? null,
        billing_test_mode: Boolean(attributes.test_mode),
        updated_at: new Date().toISOString(),
      }),
    });
    return response({ received: true });
  } catch (error) {
    console.error(error);
    return response({ error: "Webhook processing failed" }, 500);
  }
});
