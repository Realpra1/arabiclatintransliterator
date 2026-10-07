import { writeJsonArtifact } from './lib/json-artifacts.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { loadTranslator, root, translatorFiles } from '../tests/helpers/load-translator.mjs';
import { stabilityCases, traceRoundTrip, stabilityComparisons } from '../tests/helpers/roundtrip-stability.mjs';

const { MapperTranslator: translator } = loadTranslator();
const cases = stabilityCases();
const summary = { inputCases: cases.length, checks: 0, passed: 0, failed: 0, failingInputCases: 0, byRule: {} };
const failures = [];
const documents = [];
for (const c of cases) {
  const trace = traceRoundTrip(translator, c);
  const failedRules = [];
  for (const [rule, earlier, later] of stabilityComparisons(c.direction)) {
    summary.byRule[rule] ??= { checks: 0, passed: 0, failed: 0 };
    summary.checks++;
    summary.byRule[rule].checks++;
    const result = trace[earlier] === trace[later] ? 'passed' : 'failed';
    summary[result]++;
    summary.byRule[rule][result]++;
    if (result === 'failed') failedRules.push(rule);
  }
  if (failedRules.length) failures.push({ ...c, failedRules, trace });
  if (c.group === 'complete-document') documents.push({ ...c, failedRules, trace });
}
summary.failingInputCases = failures.length;
const sourceSha256 = Object.fromEntries(translatorFiles.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')]));
mkdirSync(new URL('experiments/', root), { recursive: true });
const report = new URL('experiments/roundtrip-stability.json', root);
writeJsonArtifact(report, {
  description: 'Exact stability checks. For Latin input: L1 → A1 → L2 → A2 → L3 → A3. For Arabic input: A1 → L1 → A2 → L2 → A3 → L3. Both starting directions require L2=L3 and A2=A3. Original inputs need not be recovered.',
  sourceSha256, summary, documents, failures,
});
console.log(JSON.stringify(summary, null, 2));
console.log('Full traces: experiments/roundtrip-stability.json');
// This is also usable as a check: generating a report does not mask failures.
if (summary.failed) process.exitCode = 1;
