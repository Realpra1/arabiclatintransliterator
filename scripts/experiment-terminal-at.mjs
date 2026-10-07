// Isolated trials: never edit runtime files or approve new snapshot expectations.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { loadTranslator, translatorFiles, root } from '../tests/helpers/load-translator.mjs';
import { stabilityCases, traceRoundTrip, stabilityComparisons } from '../tests/helpers/roundtrip-stability.mjs';
import { readFixture } from '../tests/corpus.mjs';
const baseline = loadTranslator();
const before = baseline.MapperTranslator;
const cases = stabilityCases();
const original = readFileSync(new URL('translator-en2ar.js', root), 'utf8');
const fingerprint = () => Object.fromEntries(translatorFiles.map(f => [f, createHash('sha256').update(readFileSync(new URL(f, root))).digest('hex')]));
const sourceSha256 = fingerprint();
const reports = [];
for (const mode of ['literal-marks', 'latin-diacritics']) {
  const marks = mode === 'literal-marks' ? String.raw`\p{M}` : String.raw`aN|iN|uN|[aiueo]|\p{M}`;
  const helper = `    function isTerminalAt(pos) {
      // Digits and transliteration consonants (including - and ') continue words.
      // Unicode punctuation, symbols, whitespace, or end of input end words.
      const tail = input.slice(pos + 2).replace(/^(?:${marks})*/u, "");
      return !tail || !/^[\\p{L}\\p{N}\\p{M}'ʾʿ-]/u.test(tail);
    }

`;
  assert.equal(original.split('    function matchTokenAt(pos) {').length, 2);
  assert.equal(original.split('        if (input.startsWith(tok, pos)) return { tok, ar };').length, 2);
  const source = original.replace('    function matchTokenAt(pos) {', helper + '    function matchTokenAt(pos) {').replace('        if (input.startsWith(tok, pos)) return { tok, ar };', '        if (tok === "at" && input.startsWith(tok, pos) && !isTerminalAt(pos)) continue;\n        if (input.startsWith(tok, pos)) return { tok, ar };');
  const context = createContext({ window: {} });
  for (const f of translatorFiles) runInContext(f === 'translator-en2ar.js' ? source : readFileSync(new URL(f, root), 'utf8'), context, { filename: f });
  const after = context.window.MapperTranslator;
  const changes = [];
  const snapshotCounts = { cases: 0, changedCases: 0, output: 0, roundTrip: 0, secondPass: 0 };
  const capture = (translator, direction, input) => {
    const opposite = direction === 'ar2en' ? 'en2ar' : 'ar2en';
    const output = translator[direction](input), roundTrip = translator[opposite](output);
    return { output, roundTrip, secondPass: translator[direction](roundTrip) };
  };
  for (const c of JSON.parse(readFixture('regressions.json'))) {
    snapshotCounts.cases++;
    const a = capture(before, c.direction, c.input), b = capture(after, c.direction, c.input);
    for (const stage of ['output','roundTrip','secondPass']) {
      assert.equal(a[stage], c[stage], `Baseline drift: ${c.id}/${stage}`);
      snapshotCounts[stage] += a[stage] !== b[stage];
    }
    if (Object.keys(a).some(k => a[k] !== b[k])) changes.push({ id: c.id, direction: c.direction, input: c.input, before: a, after: b });
  }
  snapshotCounts.changedCases = changes.length;
  const stability = { checks: 0, beforeFailed: 0, afterFailed: 0, newlyFailing: [], fixed: [] };
  for (const c of cases) {
    const a = traceRoundTrip(before, c), b = traceRoundTrip(after, c);
    // The forward Arabic reader and the sanitizer must remain exactly unchanged.
    assert.equal(context.window.MapperTranslator.ar2en(c.input), before.ar2en(c.input), c.id);
    assert.equal(context.window.MapperLatinNormalizer.normalizeInputForLooseAliases(c.input), baseline.MapperLatinNormalizer.normalizeInputForLooseAliases(c.input), c.id);
    for (const [rule,l,r] of stabilityComparisons(c.direction)) {
      const oldFail = a[l] !== a[r], newFail = b[l] !== b[r];
      stability.checks++; stability.beforeFailed += oldFail; stability.afterFailed += newFail;
      if (!oldFail && newFail) stability.newlyFailing.push({ id: c.id, rule, before: a, after: b });
      if (oldFail && !newFail) stability.fixed.push({ id: c.id, rule });
    }
  }
  const latinExamples = ['at','cat','bat','fat','that','cat.','(cat)','cat/','cat+cat','cat\ncat','catَ','catٌ','catْ','catَُ','cat́','catu','cati','cata','catuN','catiN','cataN','catāN','cats','cater','atlas','satasma-','cat-a','catʿa',"cat'a",'cat2','H2O','CO2','HaDāratuN fī SafHatiN vāHidatiN','qavvihi','qavvijat'];
  const arabicExamples = ['ة','ةٌ','مَدْرَسَة','مَدْرَسَةٌ','حَياة','قُوَّة','بَت','بَتُ','بَتٌ'];
  const examples = [...latinExamples.map(input => ({direction:'en2ar',input})),...arabicExamples.map(input => ({direction:'ar2en',input}))].map(c => ({ ...c, before:traceRoundTrip(before,c), after:traceRoundTrip(after,c) }));
  assert.equal(after.en2ar('cat'), before.en2ar('cat'));
  assert.equal(after.en2ar('catَ'), before.en2ar('catَ'));
  assert.equal(after.en2ar('cats'), 'كَتس');
  assert.equal(after.en2ar('catu'), mode === 'literal-marks' ? 'كَتُ' : before.en2ar('catu'));
  assert.equal(after.en2ar('catuN'), mode === 'literal-marks' ? 'كَتٌ' : before.en2ar('catuN'));
  for (const text of ['H2O','CO2','cat2']) assert.equal(after.en2ar(text),before.en2ar(text));
  for (const latin of ['ʿatuṇ',"mā'",'ḥaḍāratuṇ fī ṣafḥatiṇ wāḥidatiṇ']) {
    const decoded = baseline.MapperView.fromStandard(latin);
    assert.equal(context.window.MapperView.convert(latin,'en2ar',true).text,after.en2ar(decoded));
  }
  const documents = cases.filter(c => c.group === 'complete-document').map(c => {
    const a = capture(before,c.direction,c.input), b = capture(after,c.direction,c.input);
    const oldWords = a.output.split(/\s+/), newWords=b.output.split(/\s+/);
    assert.equal(oldWords.length,newWords.length);
    return { id:c.id, direction:c.direction, unchanged:Object.fromEntries(Object.keys(a).map(k=>[k,a[k]===b[k]])), changedOutputWords:oldWords.flatMap((word,i)=>word===newWords[i]?[]:[{index:i,before:word,after:newWords[i]}]), before:a,after:b };
  });
  const standardStability = { checks: 0, beforeFailed: 0, afterFailed: 0, newlyFailing: [], fixed: [] };
  const viewTranslator = w => ({ ar2en: s => w.MapperView.convert(s,'ar2en',true).text, en2ar:s => w.MapperView.convert(s,'en2ar',true).text });
  if (mode === 'latin-diacritics') {
    const oldStandard = viewTranslator(baseline), newStandard = viewTranslator(context.window);
    for (const c of cases) {
      const arabic = c.direction === 'ar2en' ? c.input : before.en2ar(c.input);
      for (const direction of ['ar2en','en2ar']) {
        const input = direction === 'ar2en' ? arabic : oldStandard.ar2en(arabic);
        const a=traceRoundTrip(oldStandard,{direction,input}),b=traceRoundTrip(newStandard,{direction,input});
        for (const [rule,l,r] of stabilityComparisons(direction)) {
          const oldFail=a[l]!==a[r],newFail=b[l]!==b[r];
          standardStability.checks++;standardStability.beforeFailed+=oldFail;standardStability.afterFailed+=newFail;
          if (!oldFail&&newFail) standardStability.newlyFailing.push({id:c.id,direction,rule,before:a,after:b});
          if (oldFail&&!newFail) standardStability.fixed.push({id:c.id,direction,rule});
        }
      }
    }
  }
  const reducedFailureExamples = ['شآـةذ','آةذ','آةء'].map(input => ({ input, before:traceRoundTrip(before,{direction:'ar2en',input}),after:traceRoundTrip(after,{direction:'ar2en',input}) }));
  reports.push({ mode, rule: 'Allow at→ة only when followed by the selected diacritics and a word boundary; otherwise match a and t separately.', skippedSuffixPattern:marks, candidateSource:source, snapshotCounts, stability, standardStability, reducedFailureExamples, documents, examples, changedCaseIds:changes.map(c=>c.id), changedExamples:changes.slice(0,35) });
}
assert.deepEqual(fingerprint(),sourceSha256,'Runtime source must remain unchanged');
const report = {selectedMode:'latin-diacritics',description:"Word-final-only at→ة trial, following the user's clarification. Two interpretations of diacritics: literal Unicode combining marks only; or those marks plus Latin short vowels a/i/u/e/o and tanwin aN/iN/uN. Hyphen/ain and apostrophe/hamza count as word letters. Long vowels are letters, not skipped marks. Production source and snapshots unchanged.",sourceSha256,reports};
writeFileSync(new URL('experiments/terminal-at.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(reports.map(r=>({mode:r.mode,standardStability:{...r.standardStability,newlyFailing:r.standardStability.newlyFailing.length,fixed:r.standardStability.fixed.length},snapshotCounts:r.snapshotCounts,stability:{...r.stability,newlyFailing:r.stability.newlyFailing.length,fixed:r.stability.fixed.length},documents:r.documents.map(d=>({id:d.id,unchanged:d.unchanged,changedOutputWords:d.changedOutputWords})),examples:r.examples.map(e=>({input:e.input,direction:e.direction,before:e.before,after:e.after})),newFailures:r.stability.newlyFailing.slice(0,4)})),null,2));
