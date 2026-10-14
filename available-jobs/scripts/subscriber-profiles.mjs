export async function db(path, init = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Subscriber database settings are missing. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json', ...init.headers };
  if (!SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')) headers.authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Subscriber database request failed (${response.status})`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function allRows(path) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await db(`${path}&limit=500&offset=${offset}`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export async function loadProfiles() {
  const subscriptions = await allRows('subscriptions?status=in.(on_trial,active)&select=user_id&order=user_id');
  const eligible = new Set(subscriptions.map(row => row.user_id));
  const profiles = await allRows('profiles?email_frequency=neq.off&select=*&order=user_id');
  return profiles.filter(profile => eligible.has(profile.user_id) && profile.roles?.length);
}

export function buildSearchQueries(profiles, demo = {}) {
  const queries = new Map();
  for (const profile of [...profiles, { roles: demo.searchQueries, location: 'Worldwide', work_modes: demo.preferredModes }]) {
    const location = String(profile.location || 'Worldwide').trim();
    const modes = (profile.work_modes || []).map(mode => mode.toLowerCase().replace(/[^a-z]/g, ''));
    for (const role of profile.roles || []) {
      const keywords = String(role).replace(/\s+/g, ' ').trim();
      if (keywords.length < 2) continue;
      const remoteOnly = modes.length === 1 && modes[0] === 'remote';
      queries.set(`${keywords.toLowerCase()}|${location.toLowerCase()}|${remoteOnly}`, { keywords, location, remoteOnly });
    }
  }
  return [...queries.values()];
}
