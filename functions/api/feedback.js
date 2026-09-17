import { getUser, handleError, json, supabase } from "./_shared.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    const rows = await supabase(env, `job_feedback?user_id=eq.${encodeURIComponent(user.id)}&select=job_url,status,company,title,updated_at`);
    return json({ feedback: rows || [] });
  } catch (error) { return handleError(error); }
}

export async function onRequestPut({ request, env }) {
  try {
    const user = await getUser(request, env);
    const input = await request.json();
    if (!input.job_url || !["opened", "applied", "dismissed", "unseen"].includes(input.status)) return json({ error: "Invalid feedback" }, 400);
    if (input.status === "unseen") {
      await supabase(env, `job_feedback?user_id=eq.${encodeURIComponent(user.id)}&job_url=eq.${encodeURIComponent(input.job_url)}`, { method: "DELETE" });
      return json({ removed: true });
    }
    await supabase(env, "job_feedback?on_conflict=user_id,job_url", {
      method: "POST", headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: user.id, job_url: input.job_url, status: input.status, company: input.company || "", title: input.title || "", updated_at: new Date().toISOString() })
    });
    return json({ saved: true });
  } catch (error) { return handleError(error); }
}
