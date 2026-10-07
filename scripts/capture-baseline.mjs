import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCorpus, buildNormalizerCorpus, documents, readFixture } from '../tests/corpus.mjs';
import { loadTranslator, root, translatorFiles } from '../tests/helpers/load-translator.mjs';

if (process.argv.slice(2).join(' ') !== '--accept-current-behavior') {
  console.error('Explicit opt-in required: node scripts/capture-baseline.mjs --accept-current-behavior\nThis replaces saved expected outputs. Review every diff; never run it just to make failing tests pass.');
  process.exit(1);
}

const { MapperTranslator: translator, MapperLatinNormalizer: normalizer } = loadTranslator();
const fixtureUrl = file => new URL(`../tests/fixtures/${file}`, import.meta.url);
const saveJSON = (file, value) => writeFileSync(fixtureUrl(file), JSON.stringify(value, null, 2) + '\n');
const opposite = direction => direction === 'en2ar' ? 'ar2en' : 'en2ar';
const hash = text => createHash('sha256').update(text).digest('hex');

function capture(direction, input) {
  const output = translator[direction](input);
  const roundTrip = translator[opposite(direction)](output);
  return { output, roundTrip, secondPass: translator[direction](roundTrip) };
}

const regressions = buildCorpus().map(c => ({ ...c, ...capture(c.direction, c.input) }));
saveJSON('regressions.json', regressions);
saveJSON('normalizer.json', buildNormalizerCorpus().map(c => ({
  ...c,
  normalized: normalizer.normalizeInputForLooseAliases(c.input),
  collapsed: normalizer.collapseLatinVowelRuns(c.input),
})));

const documentManifest = documents.map(document => {
  const input = readFixture(document.file);
  const captured = capture(document.direction, input);
  const outputs = {};
  for (const [stage, text] of Object.entries(captured)) {
    const file = `${document.id}.${stage}.txt`;
    writeFileSync(fixtureUrl(file), text);
    outputs[stage] = { file, sha256: hash(text) };
  }
  return { ...document, inputSha256: hash(input), ...outputs };
});
saveJSON('documents.json', documentManifest);

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceSha256 = Object.fromEntries(translatorFiles.map(file => [file, hash(readFileSync(new URL(file, root)))]));
const sourceMatchesCommit = translatorFiles.every(file => hash(execFileSync('git', ['show', `${commit}:${file}`], { cwd: root })) === sourceSha256[file]);
saveJSON('baseline.json', {
  repository: 'https://github.com/Realpra1/arabiclatintransliterator',
  commit,
  sourceMatchesCommit,
  note: 'Observed behavior, including lossy round trips and quirks. Commit identifies the checkout base; source hashes identify the actual working files captured, which may include uncommitted changes. They do not prohibit later code changes.',
  sourceSha256,
  regressionCases: regressions.length,
  normalizerCases: buildNormalizerCorpus().length,
  documentCases: documentManifest.length,
  suppliedTextsMapToEachOther: translator.en2ar(readFixture(documents[0].file)) === readFixture(documents[1].file),
});
console.log(`Saved ${regressions.length} regression cases, ${buildNormalizerCorpus().length} normalizer cases, and ${documentManifest.length} complete documents. Review the fixture diffs before accepting them.`);
