import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadTranslator } from './helpers/load-translator.mjs';
import { stabilityCases, traceRoundTrip, stabilityComparisons } from './helpers/roundtrip-stability.mjs';

const { MapperTranslator: translator } = loadTranslator();
const cases = stabilityCases();
// Explicitly reviewed backlog, never inferred from whether today's output fails.
const deferred = JSON.parse(readFileSync(new URL('./fixtures/deferred-stability.json', import.meta.url), 'utf8'));
const deferredById = new Map(deferred.map(c => [c.id, c]));
test('deferred stability entries identify exact existing inputs and comparisons', () => {
  assert.equal(deferredById.size, deferred.length, 'Duplicate deferred input');
  const casesById = new Map(cases.map(c => [c.id, c]));
  for (const entry of deferred) {
    const c = casesById.get(entry.id);
    assert.ok(c, `Unknown deferred input: ${entry.id}`);
    assert.equal(createHash('sha256').update(c.input).digest('hex'), entry.inputSha256, `Changed deferred input: ${c.id}`);
    assert.ok(entry.comparisons.length > 0, `Empty deferred entry: ${c.id}`);
    assert.equal(new Set(entry.comparisons).size, entry.comparisons.length);
    for (const earlier of entry.comparisons) {
      assert.ok(stabilityComparisons(c.direction).some(([, key]) => key === earlier), `Unknown comparison: ${c.id}/${earlier}`);
    }
  }
});
for (const c of cases) {
  let trace;
  for (const [rule, earlier, later] of stabilityComparisons(c.direction)) {
    const preview = JSON.stringify(c.input.length > 70 ? c.input.slice(0, 70) + '…' : c.input);
    const todo = deferredById.get(c.id)?.comparisons.includes(earlier)
      ? 'Deferred transliteration standard work; see DEFERRED_WORK.md' : false;
    test(`${c.id}: ${rule} ${preview}`, { todo }, () => {
      trace ??= traceRoundTrip(translator, c);
      assert.equal(trace[later], trace[earlier], `${rule} failed for ${c.id}`);
    });
  }
}
