// Keep the owner's saved searches even when subscriber searches are available.
export function mergeSearchQueries(ownerQueries, subscriberQueries) {
  const unique = new Map();
  for (const query of [...ownerQueries, ...subscriberQueries.slice(0, 50)]) {
    const key = `${query.keywords.toLowerCase()}|${query.location.toLowerCase()}|${query.remoteOnly}`;
    if (!unique.has(key)) unique.set(key, query);
  }
  return [...unique.values()];
}
