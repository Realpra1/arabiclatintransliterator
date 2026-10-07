// Isolated notation trials; production scripts and saved expectations are unchanged.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { loadTranslator, translatorFiles, root } from '../tests/helpers/load-translator.mjs';
import { stabilityCases, traceRoundTrip, stabilityComparisons } from '../tests/helpers/roundtrip-stability.mjs';
const baseline = loadTranslator();
const asTranslator = w => ({ ar2en: s => w.MapperView.convert(s, 'ar2en', true).text, en2ar: s => w.MapperView.convert(s, 'en2ar', true).text });
const before = asTranslator(baseline);
const variants = [
  { name: 'apostrophe-for-ayn', added: { '-': "'" } },
  { name: 'distinct-ayn-mark', added: { '-': 'ʿ' } },
  { name: 'apostrophe-for-ayn-distinct-hamza', added: { '-': "'", "'": 'ʾ' } },
];
const cases = stabilityCases();
const reports = [];
for (const variant of variants) {
  const context = createContext({ window: {} });
  for (const file of translatorFiles) {
    let source = readFileSync(new URL(file, root), 'utf8');
    if (file === 'transliteration-view.js') {
      const needle = 'N: "ṇ" };';
      assert.equal(source.split(needle).length, 2);
      source = source.replace(needle, `N: "ṇ", ${JSON.stringify(variant.added).slice(1, -1)} };`);
    }
    runInContext(source, context, { filename: file });
  }
  const after = asTranslator(context.window);
  const checks = { total: 0, beforeFailed: 0, afterFailed: 0, newlyFailing: [], fixed: [] };
  const changes = [];
  // Compare notation encodings of identical Arabic, in both starting directions.
  // This avoids counting expected spelling changes as failures.
  for (const c of cases) {
    assert.equal(context.window.MapperView.convert(c.input, c.direction).text, baseline.MapperView.convert(c.input, c.direction).text, `MCB must not change: ${c.id}`);
    const arabic = c.direction === 'ar2en' ? c.input : baseline.MapperTranslator.en2ar(c.input);
    for (const direction of ['ar2en', 'en2ar']) {
      const a = traceRoundTrip(before, { direction, input: direction === 'ar2en' ? arabic : before.ar2en(arabic) });
      const b = traceRoundTrip(after, { direction, input: direction === 'ar2en' ? arabic : after.ar2en(arabic) });
      if (a.A2 !== b.A2 || a.A3 !== b.A3) changes.push({ id: c.id, direction, before: a, after: b });
      for (const [rule, l, r] of stabilityComparisons(direction)) {
        const oldFail = a[l] !== a[r], newFail = b[l] !== b[r];
        checks.total++; checks.beforeFailed += oldFail; checks.afterFailed += newFail;
        if (!oldFail && newFail) checks.newlyFailing.push({ id: c.id, direction, rule, before: a, after: b });
        if (oldFail && !newFail) checks.fixed.push({ id: c.id, direction, rule, before: a, after: b });
      }
    }
  }
  const examples = ['ع', 'ء', 'عَمَل', 'أَمَل', 'سَعَلَ', 'سَأَلَ', 'ماء', 'عَيْنٌ', 'آ', "H2O CO2 25°C sīzjūm-133", "don't"].map(input => ({ input, before: traceRoundTrip(before, { direction: 'ar2en', input }), after: traceRoundTrip(after, { direction: 'ar2en', input }) }));
  const documents = cases.filter(c => c.group === 'complete-document').map(c => {
    const arabic = c.direction === 'ar2en' ? c.input : baseline.MapperTranslator.en2ar(c.input);
    const a = traceRoundTrip(before, { direction: 'ar2en', input: arabic });
    const b = traceRoundTrip(after, { direction: 'ar2en', input: arabic });
    return { id: c.id, arabicRoundTripUnchanged: a.A2 === b.A2, arabicThirdPassUnchanged: a.A3 === b.A3, before: a, after: b };
  });
  reports.push({ ...variant, checks, changedArabicTraces: changes.length, changedArabicInputCases: new Set(changes.map(c => c.id)).size, changes, examples, documents });
}
const report = { description: 'Isolated Standard-notation trials. All 5,511 corpus inputs contribute, seeded from identical Arabic for both directions. MCB output is asserted unchanged. Different Latin spelling is expected, but Arabic corruption is reported independently of eventual stability.', sourceSha256: Object.fromEntries(translatorFiles.map(f => [f, createHash('sha256').update(readFileSync(new URL(f, root))).digest('hex')])), reports };
// Keep counts and every changed ID; sample large traces to avoid duplicating the corpus.
const savedReport = { ...report, reports: reports.map(r => ({
  ...r,
  changes: r.changes.slice(0, 12),
  changedCaseIds: [...new Set(r.changes.map(c => c.id))],
  checks: { ...r.checks, fixed: r.checks.fixed.map(({ id, direction, rule }) => ({ id, direction, rule })) },
})) };
writeFileSync(new URL('experiments/ayn-notation.json', root), JSON.stringify(savedReport, null, 2) + '\n');
console.log(JSON.stringify(reports.map(r => ({ name:r.name, checks:{ ...r.checks, newlyFailing:r.checks.newlyFailing.length, fixed:r.checks.fixed.length }, changedArabicTraces:r.changedArabicTraces, changedArabicInputCases:r.changedArabicInputCases, documents:r.documents.map(({id,arabicRoundTripUnchanged,arabicThirdPassUnchanged})=>({id,arabicRoundTripUnchanged,arabicThirdPassUnchanged})), examples:r.examples.map(e=>({input:e.input, oldLatin:e.before.L1, newLatin:e.after.L1, oldArabic:e.before.A2, newArabic:e.after.A2})) })), null, 2));
