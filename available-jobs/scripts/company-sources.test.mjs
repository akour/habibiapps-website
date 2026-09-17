import test from "node:test";
import assert from "node:assert/strict";
import { detectEmbeddedSource, discoverCompanyJobs, fetchJobsForSource, parseCustomJobs } from "./company-sources.mjs";

test("detects an ATS embedded in a company careers page", () => {
  const result = detectEmbeddedSource(
    "https://example.com/careers",
    '<a href="https://jobs.ashbyhq.com/example">Open roles</a>'
  );
  assert.deepEqual(result, { sourceType: "ashby", sourceUrl: "https://jobs.ashbyhq.com/example" });
});

test("extracts structured JobPosting data from a custom careers page", () => {
  const company = { name: "Example", sourceUrl: "https://example.com/careers" };
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    title: "Senior Product Marketing Manager",
    url: "/jobs/123-product-marketing",
    jobLocation: { address: { addressLocality: "Remote", addressCountry: "EU" } },
    description: "Own product positioning and launches."
  })}</script>`;
  const [job] = parseCustomJobs(company, html);
  assert.equal(job.title, "Senior Product Marketing Manager");
  assert.equal(job.url, "https://example.com/jobs/123-product-marketing");
  assert.equal(job.location, "Remote, EU");
});

test("separates HTML-encoded location details from custom job titles", () => {
  const company = { name: "Example", sourceUrl: "https://example.com/jobs" };
  const [job] = parseCustomJobs(company, '<a href="/jobs/123-growth">Growth Marketing Manager &middot; Berlin &middot; Hybrid</a>');
  assert.equal(job.title, "Growth Marketing Manager");
  assert.equal(job.location, "Berlin · Hybrid");
});

test("queries a Greenhouse source and returns source metrics", async () => {
  const companies = [{ name: "Example", sourceType: "greenhouse", sourceUrl: "https://boards.greenhouse.io/example" }];
  const fetchImpl = async url => ({
    ok: true,
    text: async () => JSON.stringify({ jobs: [{ id: 7, title: "ASO Manager", absolute_url: "https://example.com/jobs/7", location: { name: "Remote" } }] })
  });
  const result = await discoverCompanyJobs(companies, { fetchImpl, politeDelayMs: 0 });
  assert.equal(result.jobs[0].title, "ASO Manager");
  assert.equal(result.metrics.sourcesSucceeded, 1);
  assert.equal(result.metrics.jobsDiscovered, 1);
});

test("keeps scanning when one company source fails", async () => {
  const companies = [
    { name: "Broken", sourceType: "custom", sourceUrl: "https://broken.example/jobs" },
    { name: "Working", sourceType: "custom", sourceUrl: "https://working.example/jobs" }
  ];
  const fetchImpl = async url => {
    if (url.includes("broken")) return { ok: false, status: 503, text: async () => "" };
    return { ok: true, text: async () => '<a href="/jobs/123-aso-manager">ASO Manager</a>' };
  };
  const result = await discoverCompanyJobs(companies, { fetchImpl, politeDelayMs: 0 });
  assert.equal(result.metrics.sourcesSucceeded, 1);
  assert.equal(result.jobs.length, 1);
});

test("queries a filtered Workday board", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, text: async () => JSON.stringify({ total: 1, jobPostings: [{ title: "Product Marketing Manager", externalPath: "/job/London/PMM_R1", locationsText: "London · Hybrid" }] }) };
  };
  const company = { name: "Example", sourceType: "workday", sourceUrl: "https://example.wd3.myworkdayjobs.com/External?hiringCompany=abc" };
  const [job] = await fetchJobsForSource(company, "workday", company.sourceUrl, fetchImpl);
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body).appliedFacets, { hiringCompany: ["abc"] });
  assert.equal(job.url, "https://example.wd3.myworkdayjobs.com/en-US/External/job/London/PMM_R1");
});
