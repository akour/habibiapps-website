export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});

export const envReady = env => Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);

export async function getUser(request, env) {
  if (!envReady(env)) throw new Response("Backend is not configured", { status: 503 });
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization, apikey: env.SUPABASE_ANON_KEY }
  });
  if (!response.ok) throw new Response("Unauthorized", { status: 401 });
  return response.json();
}

export async function supabase(env, path, init = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function stripe(env, path, values = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new Response("Billing is not configured", { status: 503 });
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error(`Stripe ${response.status}: ${await response.text()}`);
  return response.json();
}

export async function stripeGet(env, path) {
  if (!env.STRIPE_SECRET_KEY) throw new Response("Billing is not configured", { status: 503 });
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
  });
  if (!response.ok) throw new Error(`Stripe ${response.status}: ${await response.text()}`);
  return response.json();
}

export const handleError = error => {
  if (error instanceof Response) return error;
  console.error(error);
  return json({ error: "The request could not be completed." }, 500);
};
