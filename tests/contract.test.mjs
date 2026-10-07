import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadTranslator, root, translatorFiles } from './helpers/load-translator.mjs';
import { readFixture } from './corpus.mjs';

const { MapperTranslator: translator } = loadTranslator();

test('the complete corrected Latin passage produces the reviewed Arabic expectation', () => {
  // Based on the supplied Arabic, with the accepted consonantal j spelling and
  // repaired symbol-boundary leaks. Never rewritten by baseline:update.
  assert.equal(
    translator.en2ar(readFixture('civilization.canonical-latin.txt')),
    readFixture('civilization.accepted-arabic.txt'),
  );
});

test('test harness loads the same scripts in the same order as the browser', () => {
  const html = readFileSync(new URL('ArabicEnglishAlphabetTranslator.html', root), 'utf8');
  const scripts = [...html.matchAll(/<script\s+src="\.\/([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scripts, [...translatorFiles, 'app-utils.js']);
});

// Small independently written expectations complement captured regressions and
// make it easy to see the public API and house alphabet without a huge fixture.
for (const [latin, arabic] of [
  ['b', 'ب'], ['t', 'ت'], ['th', 'ث'], ['J', 'ج'], ['H', 'ح'], ['kh', 'خ'],
  ['d', 'د'], ['dh', 'ذ'], ['r', 'ر'], ['z', 'ز'], ['s', 'س'], ['sh', 'ش'],
  ['S', 'ص'], ['D', 'ض'], ['T', 'ط'], ['Z', 'ظ'], ['-', 'ع'], ['gh', 'غ'],
  ['f', 'ف'], ['q', 'ق'], ['k', 'ك'], ['l', 'ل'], ['m', 'م'], ['n', 'ن'], ['h', 'ه'],
  ['ā', 'ا'], ['á', 'ى'], ['at', 'ة'], ['aN', 'ً'], ['iN', 'ٍ'], ['uN', 'ٌ'],
  [',;?', '،؛؟'], ['', ''], ['123\n🙂', '123\n🙂'],
]) {
  test(`fixed alphabet contract ${JSON.stringify(latin)} ↔ ${JSON.stringify(arabic)}`, () => {
    assert.equal(translator.en2ar(latin), arabic);
    assert.equal(translator.ar2en(arabic), latin);
  });
}

test('multiple successive calls keep no conversion state between inputs or directions', () => {
  const samples = [
    ['ar2en', 'بَ', 'ba'], ['en2ar', 'ba', 'بَ'],
    ['ar2en', 'و', 'v'], ['en2ar', 'vv', 'وّ'],
    ['ar2en', 'ي', 'ī'], ['en2ar', 'jj', 'يّ'],
    ['ar2en', 'ّ', ''], ['en2ar', '', ''], ['ar2en', '', ''],
  ];
  for (let pass = 0; pass < 3; pass++) {
    for (const [direction, input, output] of samples) assert.equal(translator[direction](input), output);
  }
});
