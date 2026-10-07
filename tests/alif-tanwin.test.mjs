import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTranslator } from './helpers/load-translator.mjs';
import { tanwinPairs, tanwinWrappers } from './alif-tanwin-cases.mjs';

const { en2ar, ar2en } = loadTranslator().MapperTranslator;

// Accepted alif + fathatan mapping. Stability requirements are tested separately
// so updating saved mappings cannot hide unresolved round-trip issues.
for (const [latin, arabic] of tanwinPairs) {
  test(`alif tanwin: ${JSON.stringify(latin)} ↔ ${JSON.stringify(arabic)}`, () => {
    assert.equal(en2ar(latin), arabic);
    assert.equal(ar2en(arabic), latin);
    assert.equal(en2ar(ar2en(arabic)), arabic);
  });
}

for (const [before, after] of tanwinWrappers) {
  test(`alif tanwin stays a token inside ${JSON.stringify(before + 'āN' + after)}`, () => {
    const input = before + 'āN' + after;
    const expected = before + 'اً' + after.replace('?', '؟').replace(',', '،').replace(';', '؛');
    assert.equal(en2ar(input), expected);
    assert.equal(ar2en(expected), input);
  });
}

test('a separate technical N remains protected', () => {
  assert.equal(en2ar('N=2 (N) ā N'), 'N=2 (N) ا N');
});

test('fatha before alif plus tanwin follows the existing long-vowel collapse', () => {
  assert.equal(ar2en('بَاً'), 'bāN');
  assert.equal(en2ar(ar2en('بَاً')), 'باً');
});

test('tanwin before alif keeps its existing separate encoding', () => {
  assert.equal(ar2en('كتابًا'), 'ktābaNā');
  assert.equal(en2ar('ktābaNā'), 'كتابًا');
});
