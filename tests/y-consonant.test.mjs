import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTranslator } from './helpers/load-translator.mjs';
import { readFixture } from './corpus.mjs';

const { en2ar, ar2en } = loadTranslator().MapperTranslator;

// y is a loose input alias; the canonical Latin consonant is always j.
for (const [input, canonical] of [
  ['y', 'j'], ['ya', 'ja'], ['yi', 'ji'], ['yu', 'ju'],
  ['yā', 'jā'], ['yī', 'jī'], ['yū', 'jū'],
  ['ay', 'aj'], ['iy', 'ij'], ['uy', 'uj'],
  ['āy', 'āj'], ['īy', 'īj'], ['ūy', 'ūj'],
  ['yes', 'jis'], ['yellow', 'jilluv'], ['yawm', 'javm'],
  ['yuSab', 'juSab'], ['day', 'daj'], ['boy', 'buj'], ['iyyāka', 'ijjāka'],
  ['aljāf', 'aljāf'],
]) {
  test(`consonantal y: ${input} returns canonical ${canonical}`, () => {
    const arabic = en2ar(input);
    assert.equal(ar2en(arabic), canonical);
    assert.equal(en2ar(canonical), arabic);
    assert.equal(ar2en(en2ar(ar2en(arabic))), canonical);
  });
}

test('Arabic alif/ya context returns the canonical j spelling', () => {
  assert.equal(ar2en('اَلِياف'), 'aljāf');
});

test('corrected complete passage changes only the two erroneous Latin y spellings', () => {
  const historical = readFixture('civilization.latin.txt');
  assert.equal([...historical].filter(c => c === 'y').length, 2);
  const canonical = readFixture('civilization.canonical-latin.txt');
  assert.equal(canonical, historical.replace('yuSab', 'juSab').replace('alyāf', 'aljāf'));
  assert.ok(!canonical.includes('y'));
});
