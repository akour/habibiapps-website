import { readFile, writeFile } from "node:fs/promises";
import { matchesSeniority, matchesTargetRole, scoreJob } from "./profile-scoring.mjs";
import { discoverCompanyJobs } from "./company-sources.mjs";

const dataUrl = new URL("../data/jobs.json", import.meta.url);
const data = JSON.parse(await readFile(dataUrl, "utf8"));
const profile = JSON.parse(await readFile(new URL("../data/search-profile.json", import.meta.url), "utf8"));
const companySources = JSON.parse(await readFile(new URL("../data/company-sources.json", import.meta.url), "utf8"));
const closedSignals = [
  "position has been filled",
  "job has been filled",
  "job is no longer available",
  "position is no longer available",
  "position not found",
  "job not found",
  "no longer accepting applications",
  "this role is closed",
  "404 not found"
];

const linkedInQueries = profile.searchQueries;

const decode = value => value
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");

const clean = value => decode((value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
const field = (block, className) => clean(block.match(new RegExp(`<[^>]+class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`))?.[1]);
const jobId = url => url.match(/\/jobs\/view\/(?:[^/?]+-)?(\d+)/)?.[1];
const jobKey = job => jobId(job.url) || job.url;
const semanticKey = job => `${job.company || ""}:${job.title || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const previousJobs = new Map(data.jobs.map(job => [jobKey(job), { ...job }]));

function modeFrom(job) {
  const value = `${job.title || ""} ${job.location || ""}`;
  if (/remote|worldwide|anywhere/i.test(value)) return "remote";
  if (/hybrid/i.test(value)) return "hybrid";
  return "onsite";
}

async function discoverDirectCompanyJobs() {
  const discovery = await discoverCompanyJobs(companySources);
  const scannedAt = new Date().toISOString();
  const relevant = discovery.jobs.filter(job => matchesTargetRole(job.title, profile));
  const discoveredKeys = new Set(relevant.map(semanticKey));
  const successfulCompanies = new Set(discovery.metrics.results.filter(result => result.ok).map(result => result.company));

  for (const existing of data.jobs) {
    if (existing.discoverySource !== "company-scanner" || !successfulCompanies.has(existing.company)) continue;
    if (!discoveredKeys.has(semanticKey(existing))) {
      existing.active = false;
      existing.lastChecked = scannedAt;
      existing.checkNote = "missing-from-company-source";
    }
  }

  const bySemanticKey = new Map(data.jobs.map((job, index) => [semanticKey(job), index]));
  let added = 0;
  let refreshed = 0;
  for (const raw of relevant) {
    const candidate = {
      company: raw.company,
      title: raw.title,
      priority: matchesSeniority(raw.title, profile) ? "High" : "Medium",
      category: /\bASO\b|app store optimi/i.test(raw.title) ? "aso" : "general",
      source: "Company careers",
      sourceType: raw.sourceType,
      sourceUrl: raw.sourceUrl,
      discoverySource: "company-scanner",
      mode: modeFrom(raw),
      location: raw.location,
      url: raw.url,
      active: true,
      discoveredAt: scannedAt,
      lastChecked: scannedAt
    };
    const match = scoreJob(candidate, profile);
    if (match.excludedKeyword) continue;
    candidate.matchScore = match.score;
    candidate.fit = match.fit;
    candidate.why = match.reasons.length
      ? `Found on ${raw.company}'s careers source: ${match.reasons.join("; ")}.`
      : `Found directly on ${raw.company}'s careers source.`;

    const existingIndex = bySemanticKey.get(semanticKey(candidate));
    if (existingIndex === undefined) {
      data.jobs.push(candidate);
      bySemanticKey.set(semanticKey(candidate), data.jobs.length - 1);
      added += 1;
    } else {
      const existing = data.jobs[existingIndex];
      data.jobs[existingIndex] = { ...existing, ...candidate, discoveredAt: existing.discoveredAt || candidate.discoveredAt };
      refreshed += 1;
    }
  }

  console.log(`Company sources: ${discovery.metrics.sourcesSucceeded}/${companySources.length} succeeded; ${discovery.jobs.length} jobs found; ${added} relevant jobs added; ${refreshed} refreshed.`);
  return { ...discovery.metrics, relevantJobs: relevant.length, added, refreshed };
}
async function discoverLinkedInAso() {
  const known = new Set(data.jobs.map(job => jobId(job.url)).filter(Boolean));
  const discovered = [];

  for (const keywords of linkedInQueries) {
    try {
      const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
      url.searchParams.set("keywords", keywords);
      url.searchParams.set("location", "Worldwide");
      url.searchParams.set("f_TPR", "r604800");
      url.searchParams.set("start", "0");
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { "user-agent": "Mozilla/5.0 HabibiApps-Career-Radar/1.0" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const blocks = html.match(/<li[\s\S]*?<\/li>/g) || [];

      for (const block of blocks) {
        const rawUrl = decode(block.match(/href="([^"]*linkedin\.com\/jobs\/view\/[^"]+)"/)?.[1] || "");
        const id = jobId(rawUrl);
        if (!id || known.has(id)) continue;
        const title = field(block, "base-search-card__title");
        const company = field(block, "base-search-card__subtitle") || "LinkedIn listing";
        const location = field(block, "job-search-card__location") || "Location not stated";
        if (!matchesTargetRole(title, profile)) continue;
        const remote = /remote|worldwide|anywhere/i.test(`${title} ${location}`);
        const candidate = {
          company,
          title,
          priority: matchesSeniority(title, profile) ? "High" : "Medium",
          category: /\bASO\b|app store optimi/i.test(title) ? "aso" : "general",
          source: "LinkedIn",
          mode: remote ? "remote" : "onsite",
          location,
          url: `https://www.linkedin.com/jobs/view/${id}`,
          active: true,
          discoveredAt: new Date().toISOString()
        };
        const match = scoreJob(candidate, profile);
        if (match.excludedKeyword) continue;
        candidate.matchScore = match.score;
        candidate.fit = match.fit;
        candidate.why = match.reasons.length
          ? `Profile match: ${match.reasons.join("; ")}.`
          : "Potential mobile-growth role. Review the full requirements before applying.";
        discovered.push(candidate);
        known.add(id);
        if (discovered.length >= 24) break;
      }
    } catch (error) {
      console.warn(`LinkedIn discovery failed for ${keywords}: ${error.message}`);
    }
  }

  if (discovered.length) data.jobs.push(...discovered);
  console.log(`Discovered ${discovered.length} new LinkedIn ASO roles.`);
}

async function inspect(job) {
  try {
    const response = await fetch(job.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "user-agent": "HabibiApps-Career-Radar/1.0 (+https://habibiapps.com/available-jobs/)" }
    });
    const body = (await response.text()).toLowerCase().replace(/\s+/g, " ");
    const closed = response.status === 404 || response.status === 410 || closedSignals.some(signal => body.includes(signal));
    const conclusive = response.ok || response.status === 404 || response.status === 410;
    return {
      ...job,
      active: conclusive ? !closed : job.active,
      lastStatus: response.status,
      lastChecked: new Date().toISOString(),
      ...(conclusive ? { checkNote: undefined } : { checkNote: `inconclusive-${response.status}` })
    };
  } catch (error) {
    return {
      ...job,
      lastChecked: new Date().toISOString(),
      checkNote: error.name === "TimeoutError" ? "timeout" : "unreachable"
    };
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const companySourceMetrics = await discoverDirectCompanyJobs();
await discoverLinkedInAso();

const checked = await mapWithConcurrency(data.jobs, 6, inspect);

const priorityRank = { "Top choice": 0, High: 1, Medium: 2, Low: 3 };
const rescored = checked.map(job => {
  const match = scoreJob(job, profile);
  return {
    ...job,
    matchScore: match.score,
    fit: match.fit,
    ...(match.excludedKeyword ? { excludedByProfile: match.excludedKeyword } : {})
  };
});
const output = {
  checkedAt: new Date().toISOString(),
  profileId: profile.id,
  sourceMetrics: companySourceMetrics,
  jobs: rescored.sort((a, b) =>
    Number(b.active) - Number(a.active) ||
    (b.matchScore ?? 0) - (a.matchScore ?? 0) ||
    (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
    a.company.localeCompare(b.company)
  )
};

const active = rescored.filter(job => job.active && !job.excludedByProfile).length;
const newJobs = rescored.filter(job => !previousJobs.has(jobKey(job)) && job.active !== false && !job.excludedByProfile);
const closedJobs = rescored.filter(job => previousJobs.get(jobKey(job))?.active !== false && job.active === false);
const digest = {
  checkedAt: output.checkedAt,
  newJobs,
  closedJobs,
  totals: {
    active,
    aso: rescored.filter(job => job.active !== false && !job.excludedByProfile && job.category === "aso").length,
    remote: rescored.filter(job => job.active !== false && !job.excludedByProfile && job.mode === "remote").length,
    linkedIn: rescored.filter(job => job.active !== false && !job.excludedByProfile && job.source === "LinkedIn").length,
    companySources: rescored.filter(job => job.active !== false && !job.excludedByProfile && job.source === "Company careers").length
  }
};

await Promise.all([
  writeFile(dataUrl, `${JSON.stringify(output, null, 2)}\n`),
  writeFile(new URL("../data/latest-update.json", import.meta.url), `${JSON.stringify(digest, null, 2)}\n`)
]);
console.log(`Checked ${checked.length} roles; ${active} remain active.`);
