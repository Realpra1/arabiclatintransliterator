import { buildCorpus, documents, readFixture } from '../corpus.mjs';
import { tanwinPairs, tanwinWrappers, tanwinSpecialInputs } from '../alif-tanwin-cases.mjs';

export function stabilityCases() {
  const cases = buildCorpus();
  for (const document of documents) {
    cases.push({ id: document.id, group: 'complete-document', direction: document.direction, input: readFixture(document.file) });
  }
  // Keep all corpus case IDs, and add inputs that previously had only normalizer
  // or targeted tanwin tests. Identical extras need only one stability check.
  const seen = new Set(cases.map(c => JSON.stringify([c.direction, c.input])));
  function extra(group, direction, input) {
    const key = JSON.stringify([direction, input]);
    if (seen.has(key)) return;
    seen.add(key);
    cases.push({ id: `${group}/${direction}/${cases.length + 1}`, group, direction, input });
  }
  for (const c of JSON.parse(readFixture('normalizer.json'))) extra('normalizer-extra', 'en2ar', c.input);
  for (const [latin, arabic] of tanwinPairs) {
    extra('alif-tanwin', 'en2ar', latin);
    extra('alif-tanwin', 'ar2en', arabic);
  }
  for (const [before, after] of tanwinWrappers) {
    extra('alif-tanwin', 'en2ar', before + 'āN' + after);
    extra('alif-tanwin', 'ar2en', before + 'اً' + after.replace('?', '؟').replace(',', '،').replace(';', '؛'));
  }
  for (const c of tanwinSpecialInputs) extra('alif-tanwin', c.direction, c.input);
  return cases;
}

// Number each language's occurrences from 1, counting the original input.
// Return the actual strings: assertions compare exact bytes with no trimming,
// normalization, or snapshots that could approve an unstable round trip.
export function traceRoundTrip(translator, c) {
  if (c.direction === 'en2ar') {
    const L1 = c.input;
    const A1 = translator.en2ar(L1);
    const L2 = translator.ar2en(A1);
    const A2 = translator.en2ar(L2);
    const L3 = translator.ar2en(A2);
    const A3 = translator.en2ar(L3);
    return { L1, A1, L2, A2, L3, A3 };
  }
  if (c.direction === 'ar2en') {
    const A1 = c.input;
    const L1 = translator.ar2en(A1);
    const A2 = translator.en2ar(L1);
    const L2 = translator.ar2en(A2);
    const A3 = translator.en2ar(L2);
    const L3 = translator.ar2en(A3);
    return { A1, L1, A2, L2, A3, L3 };
  }
  throw new Error(`Unknown direction: ${c.direction}`);
}

export function stabilityComparisons(direction) {
  return direction === 'en2ar'
    ? [['Latin input: Latin L2 = L3', 'L2', 'L3'], ['Latin input: Arabic A2 = A3', 'A2', 'A3']]
    : [['Arabic input: Latin L2 = L3', 'L2', 'L3']];
}
