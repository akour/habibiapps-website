import { readFile } from "node:fs/promises";
import { scoreJob, toSearchProfile } from "./profile-scoring.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = process.env;
const sender = process.env.JOBS_EMAIL_FROM || "Habibi Jobs <jobs@habibiapps.com>";
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.log("Subscriber emails skipped: Supabase or Resend secrets are missing.");
  process.exit(0);
}

const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, "content-type": "application/json" };
if (!SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_")) headers.authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
async function db(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const normalizeMode = value => String(value || "").toLowerCase().replace(/[^a-z]/g, "");
const card = job => `<div style="border:1px solid #dfe6df;border-left:6px solid #dfff48;border-radius:12px;padding:16px;margin:12px 0;background:#fff"><div style="font-size:12px;font-weight:800;color:#657168;text-transform:uppercase">${escapeHtml(job.company)} · ${escapeHtml(job.source || "Direct")} · ${job.matchScore}% match</div><h3 style="margin:7px 0;color:#10271d">${escapeHtml(job.title)}</h3><div style="font-size:13px;color:#526159">${escapeHtml(job.mode)} · ${escapeHtml(job.location)}</div><p style="font-size:14px;line-height:1.5;color:#526159">${escapeHtml(job.why)}</p><a href="${escapeHtml(job.url)}" style="display:inline-block;background:#10271d;color:#fff;text-decoration:none;border-radius:8px;padding:9px 13px;font-weight:800">Open role →</a></div>`;

const catalog = JSON.parse(await readFile(new URL("../data/jobs.json", import.meta.url), "utf8")).jobs || [];
const subscriptions = await db("subscriptions?status=in.(on_trial,active)&select=user_id,status");
const activeIds = new Set((subscriptions || []).map(item => item.user_id));
const profiles = await db("profiles?email_frequency=eq.daily&select=*");
let sent = 0;
for (const profile of (profiles || []).filter(item => activeIds.has(item.user_id))) {
  const delivered = await db(`job_deliveries?user_id=eq.${encodeURIComponent(profile.user_id)}&select=job_url`);
  const seen = new Set((delivered || []).map(item => item.job_url));
  const searchProfile = toSearchProfile(profile);
  const allowedModes = new Set((profile.work_modes || []).map(normalizeMode));
  const wantedLocation = String(profile.location || "Worldwide").toLowerCase().trim();
  const matches = catalog.filter(job => {
    const jobMode = normalizeMode(job.mode);
    const modeAllowed = !allowedModes.size || allowedModes.has(jobMode);
    const locationAllowed = jobMode === "remote" || !wantedLocation || wantedLocation === "worldwide" || String(job.location || "").toLowerCase().includes(wantedLocation);
    return job.active !== false && !seen.has(job.url) && modeAllowed && locationAllowed;
  }).map(job => {
    const match = scoreJob({ ...job, mode: normalizeMode(job.mode) }, searchProfile);
    const explanation = match.reasons.length ? `Profile match: ${match.reasons.join("; ")}.` : "Potential role match; review the full requirements.";
    return { ...job, matchScore: match.score, fit: match.fit, why: explanation, excludedKeyword: match.excludedKeyword, roleMatch: match.roleMatch, warnings: match.warnings };
  }).filter(job => !job.excludedKeyword && job.roleMatch && job.matchScore >= 55).sort((a, b) => b.matchScore - a.matchScore).slice(0, 8);
  const firstName = profile.name?.split(" ")[0] || "there";
  const html = `<!doctype html><html><body style="margin:0;background:#fffaf0;font-family:Arial,sans-serif;color:#10271d"><div style="max-width:680px;margin:auto;padding:28px 18px"><div style="background:#dfff48;border-radius:16px;padding:24px"><div style="font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase">Your daily career radar</div><h1 style="margin:8px 0 5px">${matches.length ? `${matches.length} new match${matches.length === 1 ? "" : "es"}, ${escapeHtml(firstName)}` : `Nothing new today, ${escapeHtml(firstName)}`}</h1><p style="margin:0">Checked company sources and LinkedIn against your profile.</p></div>${matches.map(card).join("") || '<p style="padding:24px 0">The radar ran successfully. No new roles passed your filters today.</p>'}<p><a href="https://habibiapps.com/available-jobs/dashboard.html" style="color:#10271d;font-weight:800">Open your dashboard →</a></p></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: sender, to: [profile.email], subject: matches.length ? `${matches.length} new Habibi Jobs match${matches.length === 1 ? "" : "es"}` : "Your Habibi Jobs radar checked in", html }) });
  if (!response.ok) { console.warn(`Email failed for ${profile.user_id}: ${response.status} ${await response.text()}`); continue; }
  if (matches.length) await db("job_deliveries?on_conflict=user_id,job_url", { method: "POST", headers: { prefer: "resolution=ignore-duplicates" }, body: JSON.stringify(matches.map(job => ({ user_id: profile.user_id, job_url: job.url }))) });
  sent += 1;
}
console.log(`Sent ${sent} subscriber digest${sent === 1 ? "" : "s"}.`);
