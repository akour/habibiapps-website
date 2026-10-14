import { readFile } from "node:fs/promises";
import { scoreJob, toSearchProfile } from "./profile-scoring.mjs";

import { db, allRows, loadProfiles } from "./subscriber-profiles.mjs";
import { isRecommended } from "./profile-scoring.mjs";
const { RESEND_API_KEY } = process.env;
const sender = process.env.JOBS_EMAIL_FROM || "Habibi Jobs <jobs@habibiapps.com>";
if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is missing");
const today = new Date().toISOString().slice(0, 10);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const normalizeMode = value => String(value || "").toLowerCase().replace(/[^a-z]/g, "");
const card = job => `<div style="border:1px solid #dfe6df;border-left:6px solid #dfff48;border-radius:12px;padding:16px;margin:12px 0;background:#fff"><div style="font-size:12px;font-weight:800;color:#657168;text-transform:uppercase">${escapeHtml(job.company)} · ${escapeHtml(job.source || "Direct")} · ${job.matchScore}% match</div><h3 style="margin:7px 0;color:#10271d">${escapeHtml(job.title)}</h3><div style="font-size:13px;color:#526159">${escapeHtml(job.mode)} · ${escapeHtml(job.location)}</div><p style="font-size:14px;line-height:1.5;color:#526159">${escapeHtml(job.why)}</p><a href="${escapeHtml(job.url)}" style="display:inline-block;background:#10271d;color:#fff;text-decoration:none;border-radius:8px;padding:9px 13px;font-weight:800">Open role →</a></div>`;

const catalog = JSON.parse(await readFile(new URL("../data/jobs.json", import.meta.url), "utf8")).jobs || [];
const profiles = await loadProfiles();
let sent = 0, failed = 0;
for (const profile of profiles) {
  try {
  if (profile.email_frequency === "weekly" && new Date().getUTCDay() !== 1) continue;
  const runPath = `digest_runs?user_id=eq.${encodeURIComponent(profile.user_id)}&digest_date=eq.${today}`;
  let run = (await db(`${runPath}&select=*`))[0];
  if (run?.sent_at) continue;
  const delivered = await allRows(`job_deliveries?user_id=eq.${encodeURIComponent(profile.user_id)}&select=job_url&order=job_url`);
  const feedback = await allRows(`job_feedback?user_id=eq.${encodeURIComponent(profile.user_id)}&status=in.(applied,dismissed)&select=job_url&order=job_url`);
  const seen = new Set([...delivered, ...feedback].map(item => item.job_url));
  const matches = catalog.filter(job => job.active !== false && !seen.has(job.url) && /^https?:\/\//.test(job.url)).map(job => {
    const match = scoreJob(job, toSearchProfile(profile));
    return { ...job, matchScore: match.score, fit: match.fit, why: match.reasons.join('; '), eligible: isRecommended(match) };
  }).filter(job => job.eligible).sort((a,b) => b.matchScore-a.matchScore).slice(0,8);
  const firstName = profile.name?.split(" ")[0] || "there";
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#fffaf0;font-family:Arial,sans-serif;color:#10271d"><div style="max-width:680px;margin:auto;padding:28px 18px"><div style="background:#dfff48;border-radius:16px;padding:24px"><div style="font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase">Your daily career radar</div><h1 style="margin:8px 0 5px">${matches.length ? `${matches.length} new match${matches.length === 1 ? "" : "es"}, ${escapeHtml(firstName)}` : `Nothing new today, ${escapeHtml(firstName)}`}</h1><p style="margin:0">New roles matching your saved job-search preferences.</p></div>${matches.map(card).join("") || '<p style="padding:24px 0">No new roles in our available sources passed your filters today. Source coverage varies by profession and location.</p>'}<p><a href="https://habibiapps.com/available-jobs/dashboard.html" style="color:#10271d;font-weight:800">Open your dashboard →</a></p><p><a href="https://habibiapps.com/available-jobs/profile.html">Change email frequency or turn emails off</a></p></div></body></html>`;
  if (!run) {
    await db("digest_runs?on_conflict=user_id,digest_date", { method: "POST", headers: { prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({user_id:profile.user_id,digest_date:today,payload:{from:sender,to:[profile.email],subject:matches.length?`${matches.length} new Habibi Jobs matches`:"Your Habibi Jobs radar checked in",html},job_urls:matches.map(job=>job.url)}) });
    run = (await db(`${runPath}&select=*`))[0];
  }
  let response;
  for (let attempt=0; attempt<3; attempt++) {
    response = await fetch("https://api.resend.com/emails", {method:"POST",signal:AbortSignal.timeout(30000),headers:{authorization:`Bearer ${RESEND_API_KEY}`,"content-type":"application/json","Idempotency-Key":`digest/${profile.user_id}/${today}`},body:JSON.stringify(run.payload)});
    if (response.ok || (response.status !== 429 && response.status < 500)) break;
    await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
  }
  if (!response.ok) throw new Error(`Email provider rejected delivery (${response.status})`);
  if (run.job_urls.length) await db("job_deliveries?on_conflict=user_id,job_url", {method:"POST",headers:{prefer:"resolution=ignore-duplicates"},body:JSON.stringify(run.job_urls.map(job_url=>({user_id:profile.user_id,job_url})))});
  await db(runPath, {method:"PATCH",body:JSON.stringify({sent_at:new Date().toISOString()})});
  sent++;
  await new Promise(resolve=>setTimeout(resolve,600));
  } catch(error) { failed++; console.error(`Digest failed for ${profile.user_id}: ${error.message}`); }
}
console.log(`Subscriber digests: ${sent} sent, ${failed} failed.`);
if (failed) process.exitCode=1;
