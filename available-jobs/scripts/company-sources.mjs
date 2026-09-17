const USER_AGENT = "HabibiApps-Career-Radar/2.0 (+https://habibiapps.com/available-jobs/)";
const REQUEST_TIMEOUT_MS = 10000;
const POLITE_DELAY_MS = 1000;

const sourcePatterns = [
  ["greenhouse", /https:\/\/boards\.greenhouse\.io\/[A-Za-z0-9_-]+/i],
  ["lever", /https:\/\/jobs\.lever\.co\/[A-Za-z0-9_-]+/i],
  ["ashby", /https:\/\/jobs\.ashbyhq\.com\/[A-Za-z0-9_%.-]+/i],
  ["workable", /https:\/\/apply\.workable\.com\/[A-Za-z0-9_-]+\/?/i],
  ["smartrecruiters", /https:\/\/(?:jobs|careers)\.smartrecruiters\.com\/[A-Za-z0-9_.-]+\/?/i],
  ["workday", /https:\/\/[A-Za-z0-9.-]+\.myworkdayjobs\.com\/[A-Za-z0-9_-]+(?:\?[^"'<> ]*)?/i]
];

const knownJobPath = /\/(?:jobs?|positions?|openings?)\/(?:[^/?#]*[-_])?[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*|\/job-invite\/\d+\/?$|\/j\/[A-Za-z0-9_-]+\/?$/i;
const blockedLink = /privacy|cookie|terms|contact|linkedin|facebook|instagram|twitter|\/departments?\/|\/people\/?$/i;

const decodeEntities = value => String(value || "")
  .replace(/&middot;/gi, "·")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));

const clean = value => decodeEntities(String(value || "")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ")
  .trim();

const firstPathPart = value => new URL(value).pathname.split("/").filter(Boolean)[0];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url, fetchImpl) {
  return JSON.parse(await fetchText(url, fetchImpl));
}

async function fetchJsonPost(url, body, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": USER_AGENT, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return JSON.parse(await response.text());
}

function normalizeJob(job, company, sourceType, sourceUrl) {
  return {
    id: String(job.id || job.url || ""),
    title: clean(job.title),
    company: company.name,
    location: clean(job.location) || "Location not stated",
    url: String(job.url || "").trim(),
    content: clean(job.content),
    sourceType,
    sourceUrl
  };
}

export function detectEmbeddedSource(pageUrl, html) {
  for (const [sourceType, pattern] of sourcePatterns) {
    const match = html.match(pattern);
    if (match) return { sourceType, sourceUrl: match[0].replace(/["'<>].*$/, "").replace(/\/$/, "") };
  }
  const host = new URL(pageUrl).hostname.toLowerCase();
  if (host.includes("greenhouse.io")) return { sourceType: "greenhouse", sourceUrl: pageUrl };
  if (host.includes("lever.co")) return { sourceType: "lever", sourceUrl: pageUrl };
  if (host.includes("ashbyhq.com")) return { sourceType: "ashby", sourceUrl: pageUrl };
  if (host.includes("workable.com")) return { sourceType: "workable", sourceUrl: pageUrl };
  if (host.includes("smartrecruiters.com")) return { sourceType: "smartrecruiters", sourceUrl: pageUrl };
  if (host.includes("myworkdayjobs.com")) return { sourceType: "workday", sourceUrl: pageUrl };
  return { sourceType: "custom", sourceUrl: pageUrl };
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenJsonLd) : [];
  return [value, ...graph];
}

function jsonLdLocation(item) {
  let location = item.jobLocation || item.applicantLocationRequirements;
  if (Array.isArray(location)) location = location[0];
  const address = location?.address;
  if (address && typeof address === "object") {
    return [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(", ");
  }
  return clean(location?.name || location || "");
}

export function parseCustomJobs(company, html, pageUrl = company.sourceUrl) {
  const jobs = [];
  const seen = new Set();
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      for (const item of flattenJsonLd(JSON.parse(match[1]))) {
        const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
        if (!types.some(type => String(type).toLowerCase() === "jobposting")) continue;
        const title = clean(item.title || item.name);
        const url = new URL(item.url || item.sameAs || pageUrl, pageUrl).href;
        if (!title || seen.has(url)) continue;
        seen.add(url);
        jobs.push(normalizeJob({ id: item.identifier?.value || url, title, url, location: jsonLdLocation(item), content: item.description }, company, "custom", pageUrl));
      }
    } catch {}
  }

  const anchorPattern = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    let url;
    try { url = new URL(match[2], pageUrl).href; } catch { continue; }
    const label = clean(match[4]);
    const parts = label.split(/\s*·\s*/).filter(Boolean);
    const title = parts[0];
    const location = parts.slice(1).join(" · ");
    if (!title || title.length > 180 || seen.has(url) || blockedLink.test(url) || !knownJobPath.test(new URL(url).pathname)) continue;
    seen.add(url);
    jobs.push(normalizeJob({ id: url, title, url, location, content: "Discovered on the company careers page." }, company, "custom", pageUrl));
  }
  return jobs;
}

async function fetchGreenhouse(company, sourceUrl, fetchImpl) {
  const token = firstPathPart(sourceUrl);
  const payload = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, fetchImpl);
  return (payload.jobs || []).map(job => normalizeJob({
    id: job.id, title: job.title, url: job.absolute_url,
    location: job.location?.name, content: job.content
  }, company, "greenhouse", sourceUrl));
}

async function fetchLever(company, sourceUrl, fetchImpl) {
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${firstPathPart(sourceUrl)}?mode=json`, fetchImpl);
  return (Array.isArray(payload) ? payload : []).map(job => normalizeJob({
    id: job.id, title: job.text, url: job.hostedUrl || job.applyUrl,
    location: job.categories?.location, content: job.descriptionPlain || job.description
  }, company, "lever", sourceUrl));
}

async function fetchAshby(company, sourceUrl, fetchImpl) {
  const payload = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${firstPathPart(sourceUrl)}`, fetchImpl);
  return (payload.jobs || []).map(job => normalizeJob({
    id: job.id, title: job.title, url: job.jobUrl,
    location: job.location?.name || job.location, content: job.descriptionHtml
  }, company, "ashby", sourceUrl));
}

async function fetchSmartRecruiters(company, sourceUrl, fetchImpl) {
  const token = firstPathPart(sourceUrl);
  const payload = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100`, fetchImpl);
  return (payload.content || []).map(job => normalizeJob({
    id: job.id, title: job.name, url: job.ref || job.url,
    location: [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", ")
  }, company, "smartrecruiters", sourceUrl));
}

async function fetchWorkable(company, sourceUrl, fetchImpl) {
  const token = firstPathPart(sourceUrl);
  try {
    const payload = await fetchJson(`https://apply.workable.com/api/v3/accounts/${token}/jobs`, fetchImpl);
    const rawJobs = Array.isArray(payload) ? payload : payload.results || payload.jobs || [];
    return rawJobs.map(job => {
      const shortcode = String(job.shortcode || job.id || "");
      const location = typeof job.location === "string" ? job.location : job.location?.location_str || job.location?.city || job.location?.country || job.location_str;
      return normalizeJob({
        id: shortcode, title: job.title || job.full_title, location,
        url: job.url || `https://apply.workable.com/${token}/j/${shortcode}/`,
        content: job.description || job.description_html
      }, company, "workable", sourceUrl);
    });
  } catch {
    return fetchCustom(company, sourceUrl, fetchImpl);
  }
}

async function fetchWorkday(company, sourceUrl, fetchImpl) {
  const parsed = new URL(sourceUrl);
  const tenant = parsed.hostname.split(".")[0];
  const site = firstPathPart(sourceUrl);
  const appliedFacets = {};
  for (const [key, value] of parsed.searchParams) appliedFacets[key] = [value];
  const apiUrl = `${parsed.origin}/wday/cxs/${tenant}/${site}/jobs`;
  const jobs = [];
  let offset = 0;
  let total = 1;
  while (offset < total && offset < 200) {
    const payload = await fetchJsonPost(apiUrl, { appliedFacets, limit: 20, offset, searchText: "" }, fetchImpl);
    const postings = Array.isArray(payload.jobPostings) ? payload.jobPostings : [];
    total = Number(payload.total || postings.length);
    jobs.push(...postings.map(job => normalizeJob({
      id: job.externalPath || `${job.title}:${job.locationsText}`,
      title: job.title,
      location: job.locationsText || job.bulletFields?.join(" · "),
      url: `${parsed.origin}/en-US/${site}${job.externalPath || ""}`,
      content: job.bulletFields?.join(" · ")
    }, company, "workday", sourceUrl)));
    if (!postings.length) break;
    offset += postings.length;
  }
  return jobs;
}

async function fetchCustom(company, sourceUrl, fetchImpl) {
  const html = await fetchText(sourceUrl, fetchImpl);
  const detected = detectEmbeddedSource(sourceUrl, html);
  if (detected.sourceType !== "custom" && detected.sourceUrl !== sourceUrl) {
    return fetchJobsForSource(company, detected.sourceType, detected.sourceUrl, fetchImpl);
  }
  return parseCustomJobs(company, html, sourceUrl);
}

export async function fetchJobsForSource(company, sourceType, sourceUrl, fetchImpl = fetch) {
  if (sourceType === "greenhouse") return fetchGreenhouse(company, sourceUrl, fetchImpl);
  if (sourceType === "lever") return fetchLever(company, sourceUrl, fetchImpl);
  if (sourceType === "ashby") return fetchAshby(company, sourceUrl, fetchImpl);
  if (sourceType === "smartrecruiters") return fetchSmartRecruiters(company, sourceUrl, fetchImpl);
  if (sourceType === "workable") return fetchWorkable(company, sourceUrl, fetchImpl);
  if (sourceType === "workday") return fetchWorkday(company, sourceUrl, fetchImpl);
  return fetchCustom(company, sourceUrl, fetchImpl);
}

export async function discoverCompanyJobs(companies, { fetchImpl = fetch, politeDelayMs = POLITE_DELAY_MS, concurrency = 3 } = {}) {
  const jobs = [];
  const results = [];
  const scan = async company => {
    try {
      const companyJobs = (await fetchJobsForSource(company, company.sourceType, company.sourceUrl, fetchImpl)).filter(job => job.title && job.url);
      return { jobs: companyJobs, result: { company: company.name, ok: true, jobs: companyJobs.length, sourceType: companyJobs[0]?.sourceType || company.sourceType } };
    } catch (error) {
      return { jobs: [], result: { company: company.name, ok: false, jobs: 0, sourceType: company.sourceType, error: error.message } };
    }
  };
  for (let index = 0; index < companies.length; index += concurrency) {
    const batch = await Promise.all(companies.slice(index, index + concurrency).map(scan));
    for (const item of batch) {
      jobs.push(...item.jobs);
      results.push(item.result);
    }
    if (politeDelayMs && index + concurrency < companies.length) await sleep(politeDelayMs);
  }

  const deduped = [];
  const seen = new Set();
  for (const job of jobs) {
    const key = (job.url || `${job.company}:${job.title}:${job.location}`).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }
  return {
    jobs: deduped,
    metrics: {
      companiesScanned: companies.length,
      sourcesSucceeded: results.filter(result => result.ok).length,
      companiesWithJobs: results.filter(result => result.jobs > 0).length,
      jobsDiscovered: deduped.length,
      results
    }
  };
}
