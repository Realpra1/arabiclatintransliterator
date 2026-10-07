import { readFileSync } from 'node:fs';
import { buildAdditionalCorpus } from './additional-corpus.mjs';

export const documents = [
  { id: 'civilization-latin', file: 'civilization.latin.txt', direction: 'en2ar' },
  { id: 'civilization-supplied-arabic', file: 'civilization.supplied-arabic.txt', direction: 'ar2en' },
  { id: 'civilization-canonical-latin', file: 'civilization.canonical-latin.txt', direction: 'en2ar' },
];

export const readFixture = (file) => readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');

// Inputs are deliberately independent of the implementation's mapping tables.
// This ensures deleting a production token cannot also delete its test case.
export function buildCorpus() {
  const cases = [];
  const counts = new Map();
  function add(group, direction, inputs) {
    for (const input of inputs) {
      const key = `${group}/${direction}`;
      const index = (counts.get(key) ?? 0) + 1;
      counts.set(key, index);
      cases.push({ id: `${key}/${String(index).padStart(4, '0')}`, group, direction, input });
    }
  }

  const latinTokens = [
    'ā', 'á', 'at', 'b', 't', 'th', 'J', 'H', 'kh', 'd', 'dh', 'r', 'z',
    's', 'sh', 'S', 'D', 'T', 'Z', '-', 'gh', 'f', 'q', 'k', 'l', 'm',
    'n', 'h', 'v', 'j', "'", 'a', 'i', 'u', 'ī', 'ū', 'aN', 'iN', 'uN',
    'ṣ', 'ḍ', 'ṭ', 'ẓ', 'ḥ', 'ʿ', 'ʾ', 'ph', 'ch', 'w', 'y', 'p', 'g', 'x', 'e', 'o',
  ];
  add('latin-tokens', 'en2ar', latinTokens);
  for (const token of latinTokens) {
    add('latin-context', 'en2ar', [token + 'a', 'ba' + token, token + token, `(${token})`, `al${token}āb`]);
  }
  add('capitalization', 'en2ar', [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz']);
  add('capitalization', 'en2ar', ['Hello World', 'HELLO WORLD', 'H S D T Z J N', 'h s d t z j n', 'aN iN uN AN IN UN', 'Arabic ARABIC arabic']);

  const arabicLetters = [...'اىةبتثجحخدذرزسشصضطظعغفقكلمنهويءأإؤئآٱٰ'];
  add('arabic-letters', 'ar2en', arabicLetters);
  for (const letter of arabicLetters) {
    add('arabic-diacritics', 'ar2en', ['َ', 'ِ', 'ُ', 'ْ', 'ّ', 'ً', 'ٍ', 'ٌ', 'َّ', 'َّ', 'ِّ', 'ِّ', 'ُّ', 'ُّ'].map(mark => letter + mark));
  }
  for (const weak of ['و', 'ي']) {
    for (const before of ['', 'ب', 'بَ', 'بِ', 'بُ', 'ال', 'اَل', ' ', '،', 'ـ']) {
      for (const after of ['', 'ا', 'ى', 'ب', 'َب', 'ِب', 'ُب', 'ْب', 'ّ', 'ُّ', 'ِّ']) {
        add('weak-letter-context', 'ar2en', [before + weak + after]);
      }
    }
  }
  add('arabic-words', 'ar2en', [
    'العربية', 'الْعَرَبِيَّةُ', 'السَّلَامُ عَلَيْكُمْ', 'بِسْمِ اللَّهِ',
    'حَضَارَةٌ فِي صَفْحَةٍ وَاحِدَةٍ', 'مَرْحَبًا بِالْعَالَمِ', 'كِتَابٌ', 'كِتَابٍ', 'كِتَابًا',
    'شَدَّة', 'شَدَّة', 'قُوَّة', 'قُوَّة', 'حَيّ', 'عَرَبِيّ', 'عَرَبِيَّة', 'عَرَبِيَّة',
    'وَالْكِتَابُ', 'فَالْكِتَابُ', 'لِلْكِتَابِ', 'للكتاب', 'للناس', 'الْأَمْرُ', 'بِأَمْرٍ',
    'ٱلْكِتَابُ', 'ٱكْتُبْ', 'ٱسْم', 'وَٱكْتُبْ', 'فَٱلْكِتَاب', 'ٱل', 'ٱ', 'ٱُ',
    'آدَم', 'آ', 'أَكَلَ', 'إِنَّ', 'أُمّ', 'أمر', 'إنسان', 'سَأَلَ', 'سُؤَال', 'بِئْر', 'شَيْء',
    'مَاء', 'مَاءٌ', 'هَٰذَا', 'الرَّحْمَٰن', 'كــتــاب', 'ـــ', 'أ إ ؤ ئ ء',
    'وعد', 'نور', 'دور', 'يوم', 'بيت', 'دين', 'بُوُ', 'بِيِ', 'بُوُو', 'بِيِي',
  ]);
  for (const before of ['', 'b', 'ba', 'bi', 'bu', 'bā', 'bī', 'bū', 'va', 'fa', 'li', 'al', ' ']) {
    for (const after of ['', 'a', 'i', 'u', 'e', 'o', 'ā', 'ī', 'ū', 'aN', 'iN', 'uN', 'b']) {
      add('hamza-seating', 'en2ar', [before + "'" + after]);
    }
  }
  add('hamza-maddah', 'en2ar', ["'ā", "'ādam", "'āa", "'āi", "'āu", "'ā ", "('ā)", "b'ā", "ba'ā", "ʾā", "ʾa ʾi ʾu", "mā'", "mā'i", "su'āl", "bi'r"]);
  add('latin-words', 'en2ar', [
    'HaDāratuN fī SafHatiN vāHidatiN', 'al-arabijja', 'alSSiHHa', 'alTTāqa', 'alHaDāra',
    'marHabaN', 'alssalāmu -alajkum', 'bismi allāh', 'kitābuN', 'kitābiN', 'kitābaN',
    'shadda', 'quvva', 'Hajj', 'Haj', 'jaj', 'vav', 'vv', 'jj', 'ww', 'yy', 'vvv', 'jjj',
    'vat', 'wat', 'vāt', 'vā', 'va', 'vi', 'vu', "v'a", 'vba', 'bva', 'bvi', 'bvu',
    'llkitāb', 'lilkitāb', 'alālam', 'allatī', "al'amr", "li'i-āda", 'SafHatiN',
  ]);
  add('english', 'en2ar', [
    'One page civilization', 'one page civilization', 'FOOD & SOIL', 'Health', 'Energy & machines',
    'Knowledge preservation', 'Civilization & scientific practice', 'Scientific foundations',
    'Hello, world!', 'The quick brown fox jumps over the lazy dog.',
    'Pack my box with five dozen liquor jugs.', 'Sphinx of black quartz, judge my vow.',
    "Don't change what's already working.", 'A cat, a city, a cycle, a school, and a machine.',
    'Chemistry: chlorine, charcoal, copper, calcium, carbon.',
    'Rotate agricultural plant families yearly.', 'Move cattle through 12 pasture plots.',
    'Filter water through sand & charcoal columns.', 'Store books cool, dry & dark.',
    'A pendulum swings out and back in 2 seconds.', 'Hydrogen oxygen nitrogen ammonia',
    'electric current resistance voltage power', 'x X x-ray xenon extra box exit',
    'c C ce ci cy ca co cu ch school science', 'yellow yes happy sky rhythm my by toy boy',
    'book moon food see green tree meet seed', 'what where who wood wool wow new law',
    'letter little coffee add success buzz miss hill', 'apple elephant ink orange umbrella',
    'lowercase UPPERCASE MiXeD CaSe', 'pneumonia psychology philosophy photograph phone',
  ]);
  for (const vowel of ['a', 'e', 'i', 'o', 'u', 'w', 'y']) {
    for (const length of [1, 2, 3, 4, 5, 6, 7, 8]) {
      add('alias-runs', 'en2ar', [vowel.repeat(length), 'b' + vowel.repeat(length), 'a' + vowel.repeat(length)]);
    }
  }
  const equations = [
    'C=6.242×10^18', 'A(ambīruN)=1 C/s', 'U(fūltuN/V)=muqāvama(Ω)×I(A)',
    'qudra(W)=E(J) / t(s)=U×I', '1 Hz=1/s', 'E=kutla×c^2', 'E=hp×f',
    'G=6.6743×10^-11×m^3/(kg×s^2)', 'kb=1.380649×10^-23 J/K', 'hp=6.626×10^-34 J×s',
    'K=°C+273.15', 'N=kg×tasāru-', 'CO2 H2O O2 N2 NH3', '500°C 1200°C 1700°C',
    '−23 -23 –23 —23', '0.994 m', '0.1 m', '120° ~1% 101 kPa/1 bār', '10.000.000',
    '9.192.631.770 Hz', 'c=299.792.458 m/s', 'n_Juzaj\'āt×kb×Harāra',
  ];
  add('technical-text', 'en2ar', equations);
  for (const symbol of ['+', '−', '=', '^', '°', '*', '/', '(', ')', '[', ']', '{', '}', '<', '>', '"', '“', '”', '«', '»', '×', '-', ':', ',', ';']) {
    add('technical-symbol-boundaries', 'en2ar', [`C${symbol}`, `${symbol}C`, `x${symbol}`, `${symbol}x`, `a ${symbol} b`, `ab${symbol}cd`]);
  }
  const edgeCases = [
    '', ' ', '   ', '\t', '\n', '\n\n', '\r\n', '  a  b  ', 'a\tb\nc\r\nd',
    ',;?', '،؛؟', '.:!()[]{}<>/\\|+=*^~`_&%#@', '0123456789', '٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹',
    '🙂🌍🚀', '中文 日本語 Ελληνικά кириллица', 'café naïve résumé', 'ā ī ū á Ā Ī Ū',
    'a\u0304 i\u0304 u\u0304 a\u0301', 'ب\u200dت\u200cج', '\u200fالعربية\u200e Latin',
    'Arabic العربية 123', 'سَلام Hello!', '\u00a0a\u00a0b\u00a0', '\u2028a\u2029b',
    "'’ʾ\"“”«»", 'ًٌٍَُِّْٰـ', '،a؛i؟u', 'a\u0000b',
  ];
  for (const direction of ['en2ar', 'ar2en']) add('formatting-and-unicode', direction, edgeCases);

  for (const document of documents) {
    const text = readFixture(document.file);
    // Full paragraphs preserve cross-word context. Lines isolate formulas and
    // headings; unique words give short, useful failures alongside full texts.
    add(`${document.id}-paragraphs`, document.direction, text.split('\n\n'));
    add(`${document.id}-lines`, document.direction, text.split('\n').filter(Boolean));
    add(`${document.id}-words`, document.direction, [...new Set(text.split(/\s+/).filter(Boolean))]);
  }
  return [...cases, ...buildAdditionalCorpus()];
}

export function buildNormalizerCorpus() {
  const corpus = buildCorpus();
  const inputs = new Set(corpus.filter(c => c.direction === 'en2ar' && !c.group.startsWith('civilization') && !c.group.startsWith('expanded-')).map(c => c.input));
  for (const input of ['\uE000a', '\uE000Caa', '\uE000', 'c.', 'c ', 'c\n', 'x2', '2x', 'xy', 'byyy', 'yyyy', 'āy', 'īy', 'ūy']) inputs.add(input);
  // Append new inputs after the original cases to keep existing fixture IDs stable.
  for (const c of corpus.filter(c => c.direction === 'en2ar' && c.group.startsWith('expanded-'))) inputs.add(c.input);
  return [...inputs].map((input, i) => ({ id: `normalizer/${String(i + 1).padStart(4, '0')}`, input }));
}
