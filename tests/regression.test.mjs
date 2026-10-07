import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildCorpus, buildNormalizerCorpus, documents, readFixture } from './corpus.mjs';
import { loadTranslator } from './helpers/load-translator.mjs';

const { MapperTranslator: translator, MapperLatinNormalizer: normalizer } = loadTranslator();
const regressions = JSON.parse(readFixture('regressions.json'));
const normalization = JSON.parse(readFixture('normalizer.json'));
const documentManifest = JSON.parse(readFixture('documents.json'));
const baseline = JSON.parse(readFixture('baseline.json'));
const opposite = direction => direction === 'en2ar' ? 'ar2en' : 'en2ar';
const sha256 = text => createHash('sha256').update(text).digest('hex');
const preview = text => JSON.stringify(text.length > 65 ? text.slice(0, 65) + '…' : text);

test('saved baselines cover every declared input without duplicates or missing expectations', () => {
  assert.deepEqual(regressions.map(({ id, group, direction, input }) => ({ id, group, direction, input })), buildCorpus());
  assert.deepEqual(normalization.map(({ id, input }) => ({ id, input })), buildNormalizerCorpus());
  assert.equal(new Set(regressions.map(c => c.id)).size, regressions.length);
  assert.equal(regressions.length, baseline.regressionCases);
  assert.equal(normalization.length, baseline.normalizerCases);
  assert.deepEqual(documentManifest.map(({ id, file, direction }) => ({ id, file, direction })), documents);
  for (const c of regressions) {
    for (const stage of ['output', 'roundTrip', 'secondPass']) assert.equal(typeof c[stage], 'string', `${c.id}/${stage}`);
  }
});

for (const c of regressions) {
  const label = `${c.id} ${preview(c.input)}`;
  test(`${label} → saved output`, () => {
    assert.equal(translator[c.direction](c.input), c.output);
  });
  test(`${label} → back`, () => {
    assert.equal(translator[opposite(c.direction)](translator[c.direction](c.input)), c.roundTrip);
  });
  test(`${label} → forward again`, () => {
    assert.equal(translator[c.direction](translator[opposite(c.direction)](translator[c.direction](c.input))), c.secondPass);
  });
}

for (const c of normalization) {
  test(`${c.id} ${preview(c.input)} loose aliases`, () => {
    assert.equal(normalizer.normalizeInputForLooseAliases(c.input), c.normalized);
  });
  test(`${c.id} ${preview(c.input)} vowel runs`, () => {
    assert.equal(normalizer.collapseLatinVowelRuns(c.input), c.collapsed);
  });
}

for (const document of documentManifest) {
  const input = readFixture(document.file);
  test(`${document.id}: exact source and expected fixture bytes`, () => {
    assert.equal(sha256(input), document.inputSha256);
    for (const stage of ['output', 'roundTrip', 'secondPass']) {
      assert.equal(sha256(readFixture(document[stage].file)), document[stage].sha256);
    }
  });
  test(`${document.id}: complete document forward`, () => {
    assert.equal(translator[document.direction](input), readFixture(document.output.file));
  });
  test(`${document.id}: complete document back`, () => {
    assert.equal(translator[opposite(document.direction)](translator[document.direction](input)), readFixture(document.roundTrip.file));
  });
  test(`${document.id}: complete document forward again`, () => {
    assert.equal(translator[document.direction](translator[opposite(document.direction)](translator[document.direction](input))), readFixture(document.secondPass.file));
  });
}
