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

const original = readFileSync(new URL('latin-normalizer.js', root), 'utf8');
const edits = [
  ['pattern += (n % 2 === 0) ? "ī" : "y";', 'pattern += (n % 2 === 0) ? "i" : "y";'],
  ['// after a consonant-like Latin letter, prefer vowel-like ī rather than consonantal j.', '// after a consonant-like Latin letter, prefer short i rather than consonantal j.'],
  ['if (isAsciiLetter(prev) && !isLooseLatinVowelChar(prev)) {\n          rewritten += "ī";', 'if (isAsciiLetter(prev) && !isLooseLatinVowelChar(prev)) {\n          rewritten += "i";'],
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
const stability = { baselineFailed: 0, candidateFailed: 0, newlyFailing: [], fixed: [] };
for (const c of stabilityCases()) {
  const before = traceRoundTrip(baseline.MapperTranslator, c);
  const after = traceRoundTrip(candidate.MapperTranslator, c);
  for (const [rule, a, b] of stabilityComparisons(c.direction)) {
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
const examples = ['city', 'cycle', 'xylophone', 'cat', 'cancer', 'school', 'satasma-', 'happy', 'family', 'sky', 'my', 'rhythm', 'system', 'yes', 'yellow', 'boy', 'day', 'toy', 'alyāf', 'aljāf', 'yuSab', 'juSab', 'yawm', 'byya', 'byyya', 'iyyāka', 'ī', 'j', 'y'].map(input => ({
  input, before: capture(baseline.MapperTranslator, 'en2ar', input), after: capture(candidate.MapperTranslator, 'en2ar', input),
}));

const temporary = mkdtempSync(join(tmpdir(), 'arabiclatin-short-y-'));
let testSummary;
try {
  for (const file of [...translatorFiles, 'ArabicEnglishAlphabetTranslator.html', 'tests']) cpSync(new URL(file, root), join(temporary, file), { recursive: true });
  writeFileSync(join(temporary, 'latin-normalizer.js'), candidateSource);
  const testFiles = readdirSync(new URL('tests/', root)).filter(file => file.endsWith('.test.mjs')).sort().map(file => `tests/${file}`);
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: temporary, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 1, 'Expect existing stability failures');
  testSummary = result.stdout.split('\n').filter(line => /^# (tests |pass |fail |cancelled |skipped |todo |duration_ms )/.test(line));
  assert.ok(!result.stdout.split('\n').some(line => line.startsWith('not ok ') && /consonantal y:|Arabic alif\/ya context|corrected complete passage/.test(line)), 'Consonantal y/j contracts must pass');
  mkdirSync(new URL('experiments/', root), { recursive: true });
  const patch = spawnSync('diff', ['-u', '--label', 'a/latin-normalizer.js', '--label', 'b/latin-normalizer.js', new URL('latin-normalizer.js', root).pathname, join(temporary, 'latin-normalizer.js')], { encoding: 'utf8' });
  assert.equal(patch.status, 1);
  writeFileSync(new URL('experiments/short-y.patch', root), patch.stdout);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
const sourceSha256 = Object.fromEntries(translatorFiles.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')]));
writeFileSync(new URL('experiments/short-y.json', root), JSON.stringify({
  description: 'Isolated experiment: change vowel-like y after an ASCII consonant from ī to i, including the vowel portions of repeated y runs. Preserve consonantal y at word start/after vowels, canonical j/ī, and protected symbols. Production source and fixtures unchanged.',
  sourceSha256, counts, testSummary, stability, documents, examples, changes,
}, null, 2) + '\n');
console.log(JSON.stringify({ counts, testSummary, stability: { baselineFailed: stability.baselineFailed, candidateFailed: stability.candidateFailed, newlyFailing: stability.newlyFailing.length, fixed: stability.fixed.length }, documents: documents.map(d => ({ id: d.id, unchanged: d.unchanged })), examples }, null, 2));
