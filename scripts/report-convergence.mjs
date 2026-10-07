import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadTranslator, root, translatorFiles } from '../tests/helpers/load-translator.mjs';
import { stabilityCases } from '../tests/helpers/roundtrip-stability.mjs';

const maxRounds = Number(process.argv[2] ?? 200);
if (!Number.isSafeInteger(maxRounds) || maxRounds < 1) throw new Error('Usage: node scripts/report-convergence.mjs [positive maximum round trips]');
const maxLength = 100_000;
const translator = loadTranslator().MapperTranslator;
const cases = stabilityCases();

function follow(c) {
  const forward = translator[c.direction];
  const back = translator[c.direction === 'en2ar' ? 'ar2en' : 'en2ar'];
  const sourceLanguage = c.direction === 'en2ar' ? 'Latin' : 'Arabic';
  const targetLanguage = c.direction === 'en2ar' ? 'Arabic' : 'Latin';
  const seen = new Map([[c.input, 0]]);
  const trace = [{ step: 0, language: sourceLanguage, text: c.input }];
  let source = c.input;
  for (let round = 1; round <= maxRounds; round++) {
    const target = forward(source);
    trace.push({ step: 2 * round - 1, language: targetLanguage, text: target });
    if (target.length > maxLength) return { status: 'length-limit', round, trace };
    const next = back(target);
    trace.push({ step: 2 * round, language: sourceLanguage, text: next });
    if (next.length > maxLength) return { status: 'length-limit', round, trace };
    // Comparing complete strings in the SAME language avoids mistaking the
    // normal alternation between scripts for a cycle. Any exact recurrence is
    // conclusive because both conversion functions are deterministic.
    if (seen.has(next)) {
      const firstRound = seen.get(next);
      const period = round - firstRound;
      if (period !== 1) return { status: 'cycle', cycleStartsAtRoundTrip: firstRound, periodRoundTrips: period, detectedAtRoundTrip: round, trace };
      const finalFormFirstAtStep = {};
      for (const language of ['Latin', 'Arabic']) {
        const states = trace.filter(s => s.language === language);
        let index = states.length - 1;
        while (index > 0 && states[index - 1].text === states.at(-1).text) index--;
        finalFormFirstAtStep[language] = states[index].step;
      }
      return {
        status: 'stable', stableAfterRoundTrips: firstRound, confirmedAtRoundTrip: round,
        finalFormFirstAtStep,
        stablePairReachedAtConversion: Math.max(...Object.values(finalFormFirstAtStep)),
        trace,
      };
    }
    seen.set(next, round);
    source = next;
  }
  return { status: 'round-limit', round: maxRounds, trace };
}

const counts = { inputCases: cases.length, stable: 0, cycles: 0, unresolved: 0 };
const distribution = {};
const results = [];
const cycles = [];
const unresolved = [];
let longest = [];
let longestRounds = -1;
for (const c of cases) {
  const result = follow(c);
  const { trace, ...summary } = result;
  results.push({ id: c.id, direction: c.direction, ...summary });
  if (result.status === 'stable') {
    counts.stable++;
    distribution[result.stableAfterRoundTrips] = (distribution[result.stableAfterRoundTrips] ?? 0) + 1;
    if (result.stableAfterRoundTrips > longestRounds) {
      longestRounds = result.stableAfterRoundTrips;
      longest = [];
    }
    if (result.stableAfterRoundTrips === longestRounds) longest.push({ ...c, ...result });
  } else if (result.status === 'cycle') {
    counts.cycles++;
    cycles.push({ ...c, ...result });
  } else {
    counts.unresolved++;
    unresolved.push({ ...c, ...result });
  }
}

const sourceSha256 = Object.fromEntries(translatorFiles.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')]));
const summary = {
  ...counts, longestStableAfterRoundTrips: longestRounds, longestCaseCount: longest.length,
  longestStablePairReachedAtConversion: Math.max(...results.filter(r => r.status === 'stable').map(r => r.stablePairReachedAtConversion)),
  stableAfterRoundTripsDistribution: distribution,
};
// Probe beyond the saved corpus's eight-letter vowel runs. Keep these separate
// from corpus totals so a corpus maximum is not mistaken for a universal bound.
const stressProbes = [];
for (const vowel of ['e', 'i']) {
  for (const length of [16, 32, 64, 128, 256]) {
    const c = { id: `extended-vowel-run/${vowel}/${length}`, direction: 'en2ar', input: 'a' + vowel.repeat(length) };
    const { trace, ...result } = follow(c);
    stressProbes.push({ ...c, ...result, finalStates: trace.slice(-3) });
  }
}
for (const length of [8, 16, 32, 64, 128]) {
  const c = { id: `extended-arabic-ya-run/${length}`, direction: 'ar2en', input: 'اَ' + 'ِي'.repeat(length) };
  const { trace, ...result } = follow(c);
  stressProbes.push({ ...c, ...result, finalStates: trace.slice(-3) });
}
mkdirSync(new URL('experiments/', root), { recursive: true });
writeFileSync(new URL('experiments/convergence.json', root), JSON.stringify({
  description: 'One round trip is source → other script → source. Round 0 is the original input. stableAfterRoundTrips identifies the first source state that repeats unchanged on the next round trip. A period greater than one proves nonconvergence. A resource limit is inconclusive, not proof of nonconvergence.',
  maxRounds, maxLength, sourceSha256, summary, longest, cycles, unresolved, stressProbes, results,
}, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
for (const c of stressProbes) console.log(`${c.id}: ${c.status}, stable after ${c.stableAfterRoundTrips ?? 'unknown'} round trips`);
for (const c of [...cycles, ...unresolved]) console.log(`${c.status}: ${c.id} ${JSON.stringify(c.input.slice(0, 100))}`);
console.log('Full report: experiments/convergence.json');
