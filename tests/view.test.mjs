import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTranslator } from './helpers/load-translator.mjs';
import { stabilityCases, traceRoundTrip, stabilityComparisons } from './helpers/roundtrip-stability.mjs';
const { MapperView: view, MapperTranslator: core } = loadTranslator();

for (const [arabic, custom, standard] of [
  ['حَصَضَطَظَجَ', 'HaSaDaTaZaJa', 'ḥaṣaḍaṭaẓaja'],
  ['وَيْ', 'vaj', 'way'], ['يَوْم', 'javm', 'yawm'], ['ى', 'á', 'á'],
  ['ج', 'J', 'j'], ['يْ', 'j', 'y'], ['وْ', 'v', 'w'],
  ['ع', '-', 'ʿ'], ['عَمَل', '-amal', 'ʿamal'], ['عَيْنٌ', '-ajnuN', 'ʿaynuṇ'],
  ['ماء', "mā'", "mā'"], ['آ', "'ā", "'ā"],
  ['ن', 'n', 'n'], ['نَ', 'na', 'na'],
  ['بٌ', 'buN', 'buṇ'], ['بٍ', 'biN', 'biṇ'], ['بً', 'baN', 'baṇ'],
  ['باً', 'bāN', 'bāṇ'], ['بَنٌ', 'banuN', 'banuṇ'],
  ['نُونٌ', 'nūnuN', 'nūnuṇ'], ['مِنْ', 'min', 'min'],
]) {
  test(`standard notation keeps distinct mappings: ${arabic}`, () => {
    assert.equal(view.convert(arabic, 'ar2en').text, custom);
    assert.equal(view.convert(arabic, 'ar2en', true).text, standard);
    const returned = view.convert(standard, 'en2ar', true).text;
    assert.equal(returned, core.en2ar(custom));
    assert.equal(view.convert(returned, 'ar2en', true).text, standard);
  });
}

test('notation preserves formula symbols and Celsius in both directions', () => {
  const text = 'H2O CO2 J2 j2 w2 y2 N2 n2 (N) (n) (P) 500°C';
  for (const dir of ['ar2en', 'en2ar']) {
    const result = view.convert(text, dir, true);
    assert.equal(result.text, text);
    assert.equal(result.counts.unmapped, 0);
    for (const token of ['H2O', 'CO2', 'J2', 'j2', 'w2', 'y2', 'N2', 'n2', '500°C']) {
      assert.ok(result.segments.some(s => s.kind === 'protected' && s.text.includes(token)), token);
    }
  }
});

test('actual protected / unmapped output is distinguished from normal text', () => {
  const result = view.convert('city H2O 25°C 🙂 Ω', 'en2ar');
  assert.equal(result.text, core.en2ar('city H2O 25°C 🙂 Ω'));
  assert.ok(result.segments.some(s => s.kind === 'normal' && s.text.includes('سِتِ')));
  assert.ok(result.segments.some(s => s.kind === 'protected' && s.text === 'H2O'));
  assert.ok(result.segments.some(s => s.kind === 'unmapped' && s.text.includes('🙂')));
  assert.ok(result.segments.some(s => s.kind === 'unmapped' && s.text.includes('Ω')));
});

test('missing vowels warn; three consonants highlight but digraphs count once', () => {
  const sparse = view.convert('كتب دمشق علم', 'ar2en');
  assert.equal(sparse.coverage.sparse, true);
  assert.ok(sparse.segments.some(s => s.kind === 'warning' && s.text.includes('ktb')));
  assert.ok(sparse.segments.some(s => s.kind === 'warning' && s.text.includes('dmshq')));
  assert.equal(view.convert('خَبَرٌ كَتَبَ', 'ar2en').coverage.sparse, false);
  assert.equal(view.convert('خش', 'ar2en').counts.warning, 0);
  assert.equal(view.convert('CO2', 'ar2en').counts.warning, 0);
  assert.equal(view.convert('ktb', 'en2ar').counts.warning, 0);
});

test('whole-text diagnostics never change default output on the entire corpus', () => {
  for (const c of stabilityCases()) {
    const result = view.convert(c.input, c.direction);
    assert.equal(result.text, core[c.direction](c.input), c.id);
    assert.equal(result.segments.map(s => s.text).join(''), result.text, c.id);
  }
});

test('standard notation introduces no additional round-trip instability across the corpus', () => {
  const standard = {
    en2ar: input => view.convert(input, 'en2ar', true).text,
    ar2en: input => view.convert(input, 'ar2en', true).text,
  };
  const differences = [];
  const failures = [];
  for (const c of stabilityCases()) {
    // Begin with the same Arabic for both notations, including Arabic generated
    // from every Latin stress-test input. English loose aliases are not standard
    // transliteration; the same initial Arabic isolates notation from that policy.
    const arabic = c.direction === 'ar2en' ? c.input : core.en2ar(c.input);
    for (const direction of ['ar2en', 'en2ar']) {
      const before = traceRoundTrip(core, { direction, input: direction === 'ar2en' ? arabic : core.ar2en(arabic) });
      const after = traceRoundTrip(standard, { direction, input: direction === 'ar2en' ? arabic : standard.ar2en(arabic) });
      const hasLooseLatin = view.convert(arabic, 'ar2en').segments.some(s => s.kind === 'unmapped' && /[A-Za-z]/.test(s.text));
      if (!hasLooseLatin && (before.A2 !== after.A2 || before.A3 !== after.A3)) differences.push({ id: c.id, before, after });
      for (const [rule, a, b] of stabilityComparisons(direction)) {
        if (before[a] === before[b] && after[a] !== after[b]) failures.push({ id: c.id, rule, before, after });
      }
    }
  }
  // Mixed unprotected English is interpreted under the selected input notation,
  // so its Arabic spelling may differ. Its stability checks above still run.
  assert.equal(differences.length, 0, JSON.stringify(differences.slice(0, 4), null, 2));
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 4), null, 2));
});


test('standard ayn stays distinct from every hamza form in context', () => {
  for (const hamza of ['ء', 'أ', 'إ', 'ؤ', 'ئ', 'آ']) {
    for (const vowel of ['', 'َ', 'ِ', 'ُ', 'ً', 'ٍ', 'ٌ', 'ْ']) {
      for (const body of [hamza + vowel, 'عَ' + hamza + vowel, hamza + vowel + 'عَ', 'مَ' + hamza + vowel + 'ع']) {
        for (const [left, right] of [['', ''], ['(', ')'], ['H2O ', ' CO2 25°C'], ['"', '"']]) {
          const arabic = left + body + right;
          const canonical = core.ar2en(arabic);
          const latin = view.convert(arabic, 'ar2en', true).text;
          assert.equal(view.fromStandard(latin), canonical, arabic);
          assert.equal(view.convert(latin, 'en2ar', true).text, core.en2ar(canonical), arabic);
        }
      }
    }
  }
  for (const latin of ["'", "'a", "'i", "'u", "'ā", "mā'", "sa'ala", "don't", 'ʾ', 'ʾā']) {
    assert.equal(view.convert(latin, 'en2ar', true).text, core.en2ar(latin), latin);
  }
  assert.equal(view.convert('ʿamal', 'en2ar', true).text, 'عَمَل');
  assert.equal(view.convert('-amal', 'en2ar', true).text, 'عَمَل');
});
