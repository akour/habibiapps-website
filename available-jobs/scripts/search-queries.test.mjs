import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSearchQueries } from './search-queries.mjs';
const query = (keywords, location = 'Worldwide', remoteOnly = true) => ({ keywords, location, remoteOnly });
test('subscriber searches do not replace owner searches', () => {
  const owner = [query('App Store Optimization'), query('Mobile Growth Manager')];
  const result = mergeSearchQueries(owner, [query('Nurse')]);
  assert.deepEqual(result, [...owner, query('Nurse')]);
});
test('deduplicates equivalent searches but preserves distinct location and work preferences', () => {
  assert.equal(mergeSearchQueries([query('ASO')], [query('aso'), query('ASO', 'London'), query('ASO', 'Worldwide', false)]).length, 3);
});
test('subscriber cap never displaces owner searches', () => {
  assert.equal(mergeSearchQueries([query('ASO')], Array.from({length: 60}, (_, i) => query(`Role ${i}`))).length, 51);
});
