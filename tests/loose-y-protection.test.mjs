import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTranslator } from './helpers/load-translator.mjs';

const { MapperTranslator: { en2ar, ar2en }, MapperLatinNormalizer: normalizer } = loadTranslator();

for (const [input, arabic, latin] of [
  ['city', 'سِتِ', 'siti'],
  ['cycle', 'سِكلِ', 'sikli'],
  ['xylophone', 'سِلُفُنِ', 'silufuni'],
  ['byya', 'بِيَ', 'bija'],
  ['/by', '/بِ', '/bi'],
  ['/bā', '/با', '/bā'],
  ['/bī', '/بِي', '/bī'],
  ['/bū', '/بُو', '/bū'],
  ['/bá', '/بى', '/bá'],
  ['āb/', 'اب/', 'āb/'],
  ['(fī)', '(فِي)', '(fī)'],
  ['Hadīd+Hajar', 'حَدِيد+حَيَر', 'Hadīd+Hajar'],
  ['ramal+Jīr+ramād', 'رَمَل+جِير+رَماد', 'ramal+Jīr+ramād'],
]) {
  test(`short y / vowel boundaries: ${input}`, () => {
    assert.equal(en2ar(input), arabic);
    assert.equal(ar2en(arabic), latin);
    assert.equal(en2ar(latin), arabic);
    assert.equal(ar2en(en2ar(latin)), latin);
  });
}

// Exercise both sides of each house vowel and both capitalization passes.
// Explicit alphabet/symbol lists keep these checks independent of production policy.
for (const vowel of ['ā', 'ī', 'ū', 'á']) {
  for (const symbol of ['+', '−', '=', '^', '°', '*', '/', '(', ')', '[', ']', '{', '}', '<', '>', '"', '“', '”', '«', '»']) {
    test(`protector treats ${vowel} as a word letter beside ${symbol}`, () => {
      for (const input of [symbol + 'b' + vowel, vowel + 'b' + symbol,
        symbol + 'B' + vowel, vowel + 'B' + symbol]) {
        assert.equal(normalizer.normalizeInputForLooseAliases(input), input.replace('B', 'b'));
      }
      // A space still separates words from isolated technical symbols.
      assert.equal(normalizer.normalizeInputForLooseAliases(vowel + ' B' + symbol), vowel + ' \uE000B' + symbol);
      assert.equal(normalizer.normalizeInputForLooseAliases(symbol + 'B ' + vowel), symbol + '\uE000B ' + vowel);
    });
  }
}

for (const input of ['C/s', 'U*I', '(P)', '(N)', 'A=B', 'J/K', 'm/s', '0°C', '/b', 'b/']) {
  test(`isolated technical symbols stay protected: ${input}`, () => {
    assert.equal(en2ar(input), input);
    assert.equal(ar2en(en2ar(input)), input);
  });
}
