const normalize = value => String(value ?? "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const unique = values => [...new Set((values || []).map(normalize).filter(Boolean))];
const list = value => Array.isArray(value) ? value : [];
const containsTerm = (text, term) => {
  const haystack = ` ${normalize(text)} `;
  const needle = ` ${normalize(term)} `;
  return Boolean(needle.trim()) && haystack.includes(needle);
};
const normalizeMode = value => normalize(value).replace(/\s+/g, "");

const roleAliases = [
  ["aso", ["aso", "app store optimization"]],
  ["product marketing", ["product marketing"]],
  ["growth", ["growth", "acquisition"]],
  ["liveops", ["liveops", "live ops"]],
  ["product", ["product manager", "product owner"]]
];

const seniorityAliases = {
  "entry": ["intern", "internship", "junior", "entry", "graduate", "trainee"],
  "mid-level": ["mid", "intermediate", "associate"],
  "senior": ["senior", "sr"],
  "lead / manager": ["lead", "manager", "head"],
  "director / executive": ["director", "vp", "vice president", "chief", "executive"]
};

const juniorMarkers = ["intern", "internship", "junior", "entry", "graduate", "trainee"];
const seniorMarkers = ["senior", "sr", "lead", "manager", "head", "director", "vp", "vice president", "chief", "executive"];

function aliasesForRole(role) {
  const value = normalize(role);
  const aliases = new Set([value]);
  for (const [key, terms] of roleAliases) {
    if (value === key || value.includes(key)) terms.forEach(term => aliases.add(normalize(term)));
  }
  return [...aliases];
}

function seniorityTerms(profile) {
  if (Array.isArray(profile.seniorityKeywords) && profile.seniorityKeywords.length) {
    return unique(profile.seniorityKeywords);
  }
  return unique(list(profile.seniority).flatMap(level => seniorityAliases[normalize(level)] || []));
}

/** Convert the public demo profile or an account profile to one scoring shape. */
export function toSearchProfile(profile = {}) {
  const profileRoles = list(profile.roles).length ? list(profile.roles) : list(profile.desiredRoles);
  const legacyKeywords = list(profile.matchKeywords);
  const excludedCompanyLabels = list(profile.excluded_companies || profile.excludedCompanies).map(value => String(value).trim()).filter(Boolean);
  const roles = profileRoles.length ? profileRoles : legacyKeywords;
  const roleKeywords = unique([
    ...roles.flatMap(aliasesForRole),
    ...legacyKeywords
  ]);
  return {
    roleKeywords,
    skillKeywords: unique(profile.skills),
    industryKeywords: unique(profile.industries || profile.preferredIndustries),
    seniorityKeywords: seniorityTerms(profile),
    preferredModes: unique(profile.work_modes || profile.preferredModes).map(normalizeMode),
    location: normalize(profile.location),
    excludedKeywords: unique(profile.dealbreakers ? String(profile.dealbreakers).split(/[,\n]/) : profile.excludedKeywords),
    excludedCompanies: unique(excludedCompanyLabels),
    excludedCompanyLabels
  };
}

function seniorityMatch(title, profile) {
  const normalizedTitle = normalize(title);
  const hasJuniorMarker = juniorMarkers.some(marker => containsTerm(normalizedTitle, marker));
  const hasSeniorMarker = seniorMarkers.some(marker => containsTerm(normalizedTitle, marker));
  const targetEntry = profile.seniorityKeywords.some(term => juniorMarkers.includes(term));
  const targetSenior = profile.seniorityKeywords.some(term => seniorMarkers.includes(term));
  if (hasJuniorMarker && targetSenior && !targetEntry) return false;
  if (!profile.seniorityKeywords.length) return true;
  if (targetSenior && hasSeniorMarker && !hasJuniorMarker) return true;
  return profile.seniorityKeywords.some(term => containsTerm(normalizedTitle, term)) || (!hasJuniorMarker && !hasSeniorMarker);
}

function roleMatches(title, profile) {
  return profile.roleKeywords.filter(term => containsTerm(title, term));
}

function jobLocationMatch(job, profile, remote) {
  if (!profile.location || profile.location === "worldwide" || profile.location === "anywhere") return true;
  if (remote) return true;
  const jobLocation = normalize(job.location);
  return jobLocation.includes(profile.location) || profile.location.includes(jobLocation);
}

export function scoreJob(job, rawProfile) {
  const profile = rawProfile?.roleKeywords ? rawProfile : toSearchProfile(rawProfile);
  const title = normalize(job.title);
  const company = normalize(job.company);
  const location = normalize(job.location);
  const industry = normalize(job.industry);
  const description = normalize(`${job.description || ""} ${job.why || ""}`);
  const searchable = `${company} ${title} ${location} ${industry} ${description}`;
  const remote = normalizeMode(job.mode) === "remote" || /\b(remote|worldwide|anywhere)\b/.test(`${title} ${location}`);
  const mode = remote ? "remote" : normalizeMode(job.mode);
  const matchedRoles = roleMatches(title, profile);
  const roleMatch = matchedRoles.length > 0;
  const matchedSkills = profile.skillKeywords.filter(term => containsTerm(searchable, term));
  const matchedIndustry = profile.industryKeywords.find(term => industry && containsTerm(industry, term));
  const seniorityMatches = seniorityMatch(title, profile);
  const modeMatch = !profile.preferredModes.length || profile.preferredModes.includes(mode);
  const locationMatch = jobLocationMatch(job, profile, remote);
  const excludedCompanyIndex = profile.excludedCompanies.findIndex(blocked => company === blocked || company.startsWith(`${blocked} `));
  const excludedCompany = excludedCompanyIndex >= 0 ? (profile.excludedCompanyLabels?.[excludedCompanyIndex] || profile.excludedCompanies[excludedCompanyIndex]) : undefined;
  const excludedKeyword = profile.excludedKeywords.find(keyword => containsTerm(searchable, keyword)) || (excludedCompany ? `company:${excludedCompany}` : undefined);

  let score = 0;
  if (roleMatch) score += 45;
  score += Math.min(matchedSkills.length, 3) * 5;
  if (profile.seniorityKeywords.length) score += seniorityMatches ? 15 : -10;
  if (profile.preferredModes.length) score += modeMatch ? 15 : -15;
  if (profile.industryKeywords.length && industry) score += matchedIndustry ? 10 : -5;
  if (profile.location && profile.location !== "worldwide" && profile.location !== "anywhere") score += locationMatch ? 5 : -5;
  if (excludedKeyword) score = 0;
  score = Math.max(0, Math.min(100, score));

  const fit = score >= 75 ? "Strong" : score >= 55 ? "Good" : "Stretch";
  const reasons = [];
  const warnings = [];
  if (roleMatch) reasons.push(`matches ${matchedRoles.slice(0, 2).join(" and ")}`);
  else warnings.push("no direct target-role match");
  if (matchedSkills.length) reasons.push(`matches ${matchedSkills.slice(0, 3).join(", ")} skill${matchedSkills.length === 1 ? "" : "s"}`);
  if (profile.seniorityKeywords.length && seniorityMatches) reasons.push("matches the target seniority");
  if (profile.seniorityKeywords.length && !seniorityMatches) warnings.push("seniority may not match");
  if (profile.preferredModes.length && modeMatch) reasons.push(`${mode} matches the work preference`);
  if (profile.preferredModes.length && !modeMatch) warnings.push(`${mode || "unknown"} does not match the work preference`);
  if (matchedIndustry) reasons.push(`matches the ${matchedIndustry} industry preference`);
  if (profile.location && !locationMatch) warnings.push("location may not match");
  if (excludedKeyword) warnings.push(`blocked by ${excludedKeyword}`);
  return {
    score,
    fit,
    excludedKeyword,
    roleMatch,
    matchedRoles,
    matchedSkills,
    seniorityMatch: seniorityMatches,
    modeMatch,
    locationMatch,
    industryMatch: Boolean(matchedIndustry),
    reasons,
    warnings
  };
}

export function matchesTargetRole(title, searchProfile) {
  return scoreJob({ title }, searchProfile).roleMatch;
}

export function matchesSeniority(title, searchProfile) {
  const profile = searchProfile?.roleKeywords ? searchProfile : toSearchProfile(searchProfile);
  return seniorityMatch(title, profile);
}
