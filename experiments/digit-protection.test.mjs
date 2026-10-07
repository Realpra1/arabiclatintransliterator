// The experiment runner copies these candidate-only assertions into its temporary
// tests directory. They do not change the production suite or its saved mappings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTranslator } from './helpers/load-translator.mjs';

const { MapperTranslator: { en2ar, ar2en }, MapperLatinNormalizer: normalizer } = loadTranslator();

for (const input of ['CO2', 'KU2', '(CO2)', '[Na2CO3]', '12CO', 'CO2Na', 'cat2', '2cat', 'city2',
  'sīzjūm133', 'bā2', 'āb2', 'bī2', 'bū2', 'bá2', 'āN2', 'ch2', 'ee2', 'yy2']) {
  test(`digit protection: preserve ${input} exactly`, () => {
    assert.equal(en2ar(input), input);
    assert.equal(ar2en(en2ar(input)), input);
    assert.equal(en2ar(ar2en(en2ar(input))), input);
    const normalized = normalizer.normalizeInputForLooseAliases(input);
    assert.equal(normalized.replaceAll('\uE000', ''), input);
  });
}

for (const [input, expected] of [
  ['(cat)', '(كة)'], ['(city)', '(سِتِ)'], ['(fī)', '(فِي)'],
  ['/city', '/سِتِ'], ['city+cat', 'سِتِ+كة'], ['city=cat', 'سِتِ=كة'],
  ['cat 2', 'كة 2'], ['2 cat', '2 كة'], ['cat+2', 'كة+2'], ['cat(2)', 'كة(2)'],
  ['P', 'ب'], ['(P)', '(P)'], ['b2', 'ب2'], ['ā2', 'ا2'],
]) {
  test(`digit protection: ordinary transliteration / old protection for ${input}`, () => {
    assert.equal(en2ar(input), expected);
  });
}
