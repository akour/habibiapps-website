const includesAny = (value, terms = []) => terms.some(term => value.includes(term.toLowerCase()));

export function scoreJob(job, searchProfile) {
  const title = String(job.title || "").toLowerCase();
  const haystack = `${job.company || ""} ${job.title || ""} ${job.location || ""} ${job.why || ""}`.toLowerCase();
  const matchedKeywords = searchProfile.matchKeywords.filter(keyword => title.includes(keyword.toLowerCase()));
  const seniorityMatch = includesAny(title, searchProfile.seniorityKeywords);
  const excludedKeyword = searchProfile.excludedKeywords.find(keyword => haystack.includes(keyword.toLowerCase()));
  const remote = job.mode === "remote" || /remote|worldwide|anywhere/.test(`${title} ${String(job.location || "").toLowerCase()}`);
  const preferredMode = searchProfile.preferredModes.includes(remote ? "remote" : job.mode);
  let score = Math.min(matchedKeywords.length, 2) * 28 + (seniorityMatch ? 18 : 0) + (preferredMode ? 24 : 0);
  if (job.category === "aso") score += 12;
  if (job.priority === "Top choice") score += 12;
  if (job.mode === "onsite") score -= 24;
  if (excludedKeyword) score = 0;
  score = Math.max(0, Math.min(100, score));
  const fit = score >= 70 ? "Strong" : score >= 42 ? "Good" : "Stretch";
  const reasons = [];
  if (matchedKeywords.length) reasons.push(`matches ${matchedKeywords.slice(0, 2).join(" and ")}`);
  if (seniorityMatch) reasons.push("matches the target seniority");
  if (preferredMode) reasons.push(`${remote ? "remote" : job.mode} matches the work preference`);
  if (job.mode === "onsite") reasons.push("on-site location needs review");
  return { score, fit, excludedKeyword, reasons };
}

export function matchesTargetRole(title, searchProfile) {
  return includesAny(String(title || "").toLowerCase(), searchProfile.matchKeywords);
}

export function matchesSeniority(title, searchProfile) {
  return includesAny(String(title || "").toLowerCase(), searchProfile.seniorityKeywords);
}
