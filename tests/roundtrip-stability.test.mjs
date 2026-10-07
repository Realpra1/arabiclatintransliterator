import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTranslator } from './helpers/load-translator.mjs';
import { stabilityCases, traceRoundTrip, stabilityComparisons } from './helpers/roundtrip-stability.mjs';

const { MapperTranslator: translator } = loadTranslator();
for (const c of stabilityCases()) {
  let trace;
  for (const [rule, earlier, later] of stabilityComparisons(c.direction)) {
    const preview = JSON.stringify(c.input.length > 70 ? c.input.slice(0, 70) + '…' : c.input);
    test(`${c.id}: ${rule} ${preview}`, () => {
      trace ??= traceRoundTrip(translator, c);
      assert.equal(trace[later], trace[earlier], `${rule} failed for ${c.id}`);
    });
  }
}
