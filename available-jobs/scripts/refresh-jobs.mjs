import { readFile, writeFile } from "node:fs/promises";

const dataUrl = new URL("../data/jobs.json", import.meta.url);
const data = JSON.parse(await readFile(dataUrl, "utf8"));
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

async function inspect(job) {
  try {
    const response = await fetch(job.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "user-agent": "HabibiApps-Career-Radar/1.0 (+https://habibiapps.com/available-jobs/)" }
    });
    const body = (await response.text()).toLowerCase().replace(/\s+/g, " ");
    const closed = response.status === 404 || response.status === 410 || closedSignals.some(signal => body.includes(signal));
    return {
      ...job,
      active: !closed && response.ok,
      lastStatus: response.status,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    // A blocked or timed-out careers site is not proof that a role closed.
    return {
      ...job,
      lastChecked: new Date().toISOString(),
      checkNote: error.name === "TimeoutError" ? "timeout" : "unreachable"
    };
  }
}

const checked = [];
for (const job of data.jobs) checked.push(await inspect(job));

const output = {
  checkedAt: new Date().toISOString(),
  jobs: checked.sort((a, b) => Number(b.active) - Number(a.active) || a.company.localeCompare(b.company))
};

await writeFile(dataUrl, `${JSON.stringify(output, null, 2)}\n`);
const active = checked.filter(job => job.active).length;
console.log(`Checked ${checked.length} roles; ${active} remain active.`);
