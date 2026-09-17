import { getUser, handleError, json, supabase } from "./_shared.js";

const allowed = ["name", "roles", "location", "work_modes", "dealbreakers", "excluded_companies", "email_frequency"];

export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    const profiles = await supabase(env, `profiles?user_id=eq.${encodeURIComponent(user.id)}&select=*`);
    const subscriptions = await supabase(env, `subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=status,current_period_end,trial_ends_at`);
    return json({ user: { id: user.id, email: user.email }, profile: profiles?.[0] || null, subscription: subscriptions?.[0] || null });
  } catch (error) { return handleError(error); }
}

export async function onRequestPut({ request, env }) {
  try {
    const user = await getUser(request, env);
    const input = await request.json();
    const profile = { user_id: user.id, email: user.email, updated_at: new Date().toISOString() };
    for (const key of allowed) if (input[key] !== undefined) profile[key] = input[key];
    const saved = await supabase(env, "profiles?on_conflict=user_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(profile)
    });
    return json({ profile: saved?.[0] || profile });
  } catch (error) { return handleError(error); }
}
