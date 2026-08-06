import { readFile } from "node:fs/promises";

const apiKey = process.env.RESEND_API_KEY;
const recipient = process.env.JOBS_EMAIL_TO;
const sender = process.env.JOBS_EMAIL_FROM || "Habibi Apps Jobs <onboarding@resend.dev>";

if (!apiKey || !recipient) {
  console.log("Email skipped: add RESEND_API_KEY and JOBS_EMAIL_TO repository secrets.");
  process.exit(0);
}

const digest = JSON.parse(await readFile(new URL("../data/latest-update.json", import.meta.url), "utf8"));
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[character]);

const jobCard = job => `
  <div style="border:1px solid #dfe6df;border-left:6px solid #dfff48;border-radius:12px;padding:16px;margin:12px 0;background:#fff">
    <div style="font-size:12px;font-weight:800;color:#657168;text-transform:uppercase">${escapeHtml(job.company)} · ${escapeHtml(job.source || "Direct")}</div>
    <h3 style="margin:7px 0;color:#10271d">${escapeHtml(job.title)}</h3>
    <div style="font-size:13px;color:#526159">${escapeHtml(job.mode)} · ${escapeHtml(job.location)}</div>
    <p style="font-size:14px;line-height:1.5;color:#526159">${escapeHtml(job.why)}</p>
    <a href="${escapeHtml(job.url)}" style="display:inline-block;background:#10271d;color:#fff;text-decoration:none;border-radius:8px;padding:9px 13px;font-weight:800">Open role →</a>
  </div>`;

const newCount = digest.newJobs.length;
const closedCount = digest.closedJobs.length;
const subject = newCount
  ? `Habibi Apps Jobs: ${newCount} new role${newCount === 1 ? "" : "s"}`
  : "Habibi Apps Jobs: daily check complete";

const html = `<!doctype html><html><body style="margin:0;background:#fffaf0;font-family:Arial,sans-serif;color:#10271d">
  <div style="max-width:680px;margin:auto;padding:28px 18px">
    <div style="background:#dfff48;border-radius:16px;padding:24px">
      <div style="font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase">Daily career radar</div>
      <h1 style="margin:8px 0 5px;font-size:34px">${newCount ? `${newCount} new role${newCount === 1 ? "" : "s"}` : "No new roles today"}</h1>
      <p style="margin:0">${digest.totals.active} active · ${digest.totals.aso} ASO · ${digest.totals.remote} remote · ${digest.totals.linkedIn} from LinkedIn</p>
    </div>
    ${newCount ? `<h2 style="margin-top:28px">New opportunities</h2>${digest.newJobs.map(jobCard).join("")}` : '<p style="padding:22px 0">The search completed successfully. Nothing new passed the filters today.</p>'}
    ${closedCount ? `<h2 style="margin-top:28px">Recently closed</h2><ul>${digest.closedJobs.map(job => `<li>${escapeHtml(job.company)} — ${escapeHtml(job.title)}</li>`).join("")}</ul>` : ""}
    <p style="margin-top:30px"><a href="https://habibiapps.com/available-jobs/" style="color:#10271d;font-weight:800">Open the full jobs radar →</a></p>
    <p style="font-size:11px;color:#7a857e">Checked ${escapeHtml(new Date(digest.checkedAt).toUTCString())}</p>
  </div>
</body></html>`;

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({ from: sender, to: [recipient], subject, html })
});

if (!response.ok) throw new Error(`Email failed (${response.status}): ${await response.text()}`);
console.log(`Daily jobs email sent to ${recipient}.`);
