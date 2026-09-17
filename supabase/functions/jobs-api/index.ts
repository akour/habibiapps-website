const SITE_URL = "https://habibiapps.com";
const ALLOWED_ORIGINS = new Set([SITE_URL, "https://www.habibiapps.com"]);
function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : SITE_URL;
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
    vary: "Origin",
  };
}
function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function envJson(name: string, legacyName: string) {
  const value = Deno.env.get(name);
  if (value) return JSON.parse(value).default as string;
  const legacy = Deno.env.get(legacyName);
  if (!legacy) throw new Error(`Missing ${name}`);
  return legacy;
}
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = envJson("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const secretKey = envJson("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
async function getUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { authorization, apikey: publishableKey },
  });
  if (!response.ok) throw new Response("Unauthorized", { status: 401 });
  return response.json();
}
async function database(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    apikey: secretKey,
    "content-type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (!secretKey.startsWith("sb_secret_")) headers.authorization = `Bearer ${secretKey}`;
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Database ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function stripe(path: string, values: Record<string, unknown>) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Response("Billing is not active yet", { status: 503 });
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) if (value !== undefined && value !== null) body.set(name, String(value));
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Stripe ${response.status}: ${await response.text()}`);
  return response.json();
}
function routeFor(request: Request) {
  const marker = "/jobs-api";
  const pathname = new URL(request.url).pathname;
  return pathname.slice(pathname.indexOf(marker) + marker.length) || "/";
}
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  try {
    const route = routeFor(request);
    const user = await getUser(request);
    if (route === "/profile" && request.method === "GET") {
      const profiles = await database(`profiles?user_id=eq.${encodeURIComponent(user.id)}&select=*`);
      const subscriptions = await database(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=status,current_period_end,trial_ends_at`);
      return json({ user: { id: user.id, email: user.email }, profile: profiles?.[0] ?? null, subscription: subscriptions?.[0] ?? null }, 200, origin);
    }
    if (route === "/profile" && request.method === "PUT") {
      const input = await request.json();
      const allowed = ["name", "roles", "location", "work_modes", "dealbreakers", "excluded_companies", "email_frequency"];
      const profile: Record<string, unknown> = { user_id: user.id, email: user.email, updated_at: new Date().toISOString() };
      for (const key of allowed) if (input[key] !== undefined) profile[key] = input[key];
      const saved = await database("profiles?on_conflict=user_id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(profile),
      });
      return json({ profile: saved?.[0] ?? profile }, 200, origin);
    }
    if (route === "/feedback" && request.method === "GET") {
      const feedback = await database(`job_feedback?user_id=eq.${encodeURIComponent(user.id)}&select=job_url,status,company,title,updated_at`);
      return json({ feedback: feedback ?? [] }, 200, origin);
    }
    if (route === "/feedback" && request.method === "PUT") {
      const input = await request.json();
      if (!input.job_url || !["opened", "applied", "dismissed", "unseen"].includes(input.status)) return json({ error: "Invalid feedback" }, 400, origin);
      if (input.status === "unseen") {
        await database(`job_feedback?user_id=eq.${encodeURIComponent(user.id)}&job_url=eq.${encodeURIComponent(input.job_url)}`, { method: "DELETE" });
        return json({ removed: true }, 200, origin);
      }
      await database("job_feedback?on_conflict=user_id,job_url", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: user.id, job_url: input.job_url, status: input.status, company: input.company ?? "", title: input.title ?? "", updated_at: new Date().toISOString() }),
      });
      return json({ saved: true }, 200, origin);
    }
    if (route === "/create-checkout-session" && request.method === "POST") {
      const priceId = Deno.env.get("STRIPE_PRICE_ID");
      if (!priceId) throw new Response("Billing is not active yet", { status: 503 });
      const existing = await database(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,status`);
      let customerId = existing?.[0]?.stripe_customer_id;
      if (!customerId) customerId = (await stripe("customers", { email: user.email, "metadata[user_id]": user.id })).id;
      const session = await stripe("checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        client_reference_id: user.id,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": 1,
        "subscription_data[trial_period_days]": 14,
        "subscription_data[metadata][user_id]": user.id,
        success_url: `${SITE_URL}/available-jobs/dashboard.html?checkout=success`,
        cancel_url: `${SITE_URL}/available-jobs/signup.html?checkout=cancelled`,
        allow_promotion_codes: "true",
      });
      return json({ url: session.url }, 200, origin);
    }
    if (route === "/create-portal-session" && request.method === "POST") {
      const rows = await database(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`);
      const customer = rows?.[0]?.stripe_customer_id;
      if (!customer) return json({ error: "No billing account exists yet." }, 404, origin);
      const session = await stripe("billing_portal/sessions", { customer, return_url: `${SITE_URL}/available-jobs/dashboard.html` });
      return json({ url: session.url }, 200, origin);
    }
    return json({ error: "Not found" }, 404, origin);
  } catch (error) {
    if (error instanceof Response) return json({ error: await error.text() }, error.status, origin);
    console.error(error);
    return json({ error: "The request could not be completed." }, 500, origin);
  }
});