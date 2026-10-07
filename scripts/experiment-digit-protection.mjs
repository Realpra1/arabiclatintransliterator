import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { loadTranslator, root, translatorFiles } from '../tests/helpers/load-translator.mjs';
import { readFixture } from '../tests/corpus.mjs';
import { stabilityCases, traceRoundTrip, stabilityComparisons } from '../tests/helpers/roundtrip-stability.mjs';

const includeSingle = process.argv.includes('--include-single');
assert.ok(process.argv.slice(2).every(arg => arg === '--include-single'), 'Only --include-single is supported');
const experimentName = includeSingle ? 'digit-single-protection' : 'digit-protection';
const minimumLetters = includeSingle ? 1 : 2;

const original = readFileSync(new URL('latin-normalizer.js', root), 'utf8');
// Protect letter runs, not whole punctuation-delimited tokens. Digits are ASCII
// 0-9; house vowels count as letters, as they do in single-symbol protection.
const edits = [
  ['  function normalizeInputForLooseAliases(str) {', `  function findNumberAdjacentLetters(str) {
    const positions = new Set();
    for (let start = 0; start < str.length; ) {
      if (!isLatinWordLetter(str[start])) {
        start++;
        continue;
      }
      let end = start + 1;
      while (end < str.length && isLatinWordLetter(str[end])) end++;
      if (end - start >= ${minimumLetters} &&
          (/[0-9]/.test(str[start - 1] || "") || /[0-9]/.test(str[end] || ""))) {
        for (let pos = start; pos < end; pos++) positions.add(pos);
      }
      start = end;
    }
    return positions;
  }

  function normalizeInputForLooseAliases(str) {
    // Compute before lowercasing so protected formulas retain their exact case.
    const numberAdjacentLetters = findNumberAdjacentLetters(str);`],
  ['const isProtected = isProtectedSingleCharAt(k, str);',
   'const isProtected = numberAdjacentLetters.has(k) || isProtectedSingleCharAt(k, str);'],
  ['if (isProtectedSingleCharAt(k, normalized)) {',
   'if (numberAdjacentLetters.has(k) || isProtectedSingleCharAt(k, normalized)) {'],
];
let candidateSource = original;
for (const [before, after] of edits) {
  assert.equal(candidateSource.split(before).length - 1, 1, 'Experiment target changed');
  candidateSource = candidateSource.replace(before, after);
}
const context = createContext({ window: {} });
for (const file of translatorFiles) {
  runInContext(file === 'latin-normalizer.js' ? candidateSource : readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
}
const baseline = loadTranslator();
const candidate = context.window;
const opposite = direction => direction === 'en2ar' ? 'ar2en' : 'en2ar';
function capture(translator, direction, input) {
  const output = translator[direction](input);
  const roundTrip = translator[opposite(direction)](output);
  return { output, roundTrip, secondPass: translator[direction](roundTrip) };
}
const counts = { changedInputCases: 0, output: 0, roundTrip: 0, secondPass: 0, normalizer: 0 };
const changes = [];
for (const c of JSON.parse(readFixture('regressions.json'))) {
  const result = capture(candidate.MapperTranslator, c.direction, c.input);
  const changed = {};
  for (const [stage, text] of Object.entries(result)) {
    if (text !== c[stage]) {
      counts[stage]++;
      changed[stage] = { before: c[stage], after: text };
    }
  }
  if (Object.keys(changed).length) changes.push({ id: c.id, direction: c.direction, input: c.input, changes: changed });
}
counts.changedInputCases = changes.length;
for (const c of JSON.parse(readFixture('normalizer.json'))) {
  if (candidate.MapperLatinNormalizer.normalizeInputForLooseAliases(c.input) !== c.normalized) counts.normalizer++;
}
const stability = { checks: 0, baselineFailed: 0, candidateFailed: 0, newlyFailing: [], fixed: [] };
for (const c of stabilityCases()) {
  const before = traceRoundTrip(baseline.MapperTranslator, c);
  const after = traceRoundTrip(candidate.MapperTranslator, c);
  for (const [rule, a, b] of stabilityComparisons(c.direction)) {
    stability.checks++;
    const oldFailure = before[a] !== before[b];
    const newFailure = after[a] !== after[b];
    if (oldFailure) stability.baselineFailed++;
    if (newFailure) stability.candidateFailed++;
    if (!oldFailure && newFailure) stability.newlyFailing.push({ id: c.id, input: c.input, rule, before, after });
    if (oldFailure && !newFailure) stability.fixed.push({ id: c.id, input: c.input, rule, before, after });
  }
}
const documents = JSON.parse(readFixture('documents.json')).map(d => {
  const input = readFixture(d.file);
  const before = capture(baseline.MapperTranslator, d.direction, input);
  const after = capture(candidate.MapperTranslator, d.direction, input);
  return { id: d.id, direction: d.direction, before, after,
    unchanged: Object.fromEntries(Object.keys(before).map(stage => [stage, before[stage] === after[stage]])),
  };
});
const examples = ['CO2', '(CO2)', 'KU2', '12CO', 'CO2Na', 'Na2CO3', 'H2O', 'H2SO4', 'O2', 'P', '(P)', '(cat)', '(city)', '(school)', '(fī)', '/city', 'city+cat', 'city=cat', 'cat2', '2cat', 'cat 2', '2 cat', 'cat+2', 'cat(2)', 'CO₂', 'CO٢', 'CO۲', 'sīzjūm133', 'sīzjūm-133', 'sīzjūm 133', 'sīzjūm–133', 'sīzjūm−133', '(sīzjūm-133)', 'v2', 'm1', 'm2', 'āN2', 'bā2', 'āb2', 'ā2', 'H2CO3', 'city2', 'ch2', 'see2', 'aa2', 'ii2', 'uu2' ].map(input => ({
  input, before: capture(baseline.MapperTranslator, 'en2ar', input), after: capture(candidate.MapperTranslator, 'en2ar', input),
}));

const temporary = mkdtempSync(join(tmpdir(), 'arabiclatin-digit-protection-'));
let testSummary;
try {
  for (const file of [...translatorFiles, 'ArabicEnglishAlphabetTranslator.html', 'tests']) cpSync(new URL(file, root), join(temporary, file), { recursive: true });
  writeFileSync(join(temporary, 'latin-normalizer.js'), candidateSource);
  cpSync(new URL(`experiments/${experimentName}.test.mjs`, root), join(temporary, 'tests/digit-protection.test.mjs'));
  const testFiles = readdirSync(join(temporary, 'tests')).filter(file => file.endsWith('.test.mjs')).sort().map(file => `tests/${file}`);
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: temporary, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 1, 'Expect existing stability failures');
  const focusedFailures = result.stdout.split('\n').filter(line => line.startsWith('not ok ') && /digit protection:/.test(line));
  assert.deepEqual(focusedFailures, [], 'Focused digit-protection checks must pass');
  testSummary = result.stdout.split('\n').filter(line => /^# (tests |pass |fail |cancelled |skipped |todo |duration_ms )/.test(line));
  assert.ok(!result.stdout.split('\n').some(line => line.startsWith('not ok ') && /consonantal y:|Arabic alif\/ya context|corrected complete passage/.test(line)), 'Consonantal y/j contracts must pass');
  mkdirSync(new URL('experiments/', root), { recursive: true });
  const patch = spawnSync('diff', ['-u', '--label', 'a/latin-normalizer.js', '--label', 'b/latin-normalizer.js', new URL('latin-normalizer.js', root).pathname, join(temporary, 'latin-normalizer.js')], { encoding: 'utf8' });
  assert.equal(patch.status, 1);
  writeFileSync(new URL(`experiments/${experimentName}.patch`, root), patch.stdout);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
const sourceSha256 = Object.fromEntries(translatorFiles.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')]));
writeFileSync(new URL(`experiments/${experimentName}.json`, root), JSON.stringify({
  description: `Isolated trial: protect each run of at least ${minimumLetters} Latin letters (ASCII plus ā/ī/ū/á) immediately before or after an ASCII digit, before case folding and alias normalization. Other symbols do not activate this new rule; existing single-letter protection remains. Production source and fixtures unchanged.`,
  sourceSha256, counts, testSummary, stability, documents, examples, changes,
}, null, 2) + '\n');
console.log(JSON.stringify({ counts, testSummary, stability: { checks: stability.checks, baselineFailed: stability.baselineFailed, candidateFailed: stability.candidateFailed, newlyFailing: stability.newlyFailing.length, fixed: stability.fixed.length }, documents: documents.map(d => ({ id: d.id, unchanged: d.unchanged })), examples }, null, 2));
