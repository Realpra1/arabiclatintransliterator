export const tanwinPairs = [
  ['āN', 'اً'], ['bāN', 'باً'], ['shukrāN', 'شُكراً'], ['kitābāN', 'كِتاباً'],
  ['āNāN', 'اًاً'], ['bāN bāN', 'باً باً'], ['aN', 'ً'], ['iN', 'ٍ'], ['uN', 'ٌ'],
  ['baNā', 'بًا'], ['kitābaN', 'كِتابً'], ["'āaN", 'آً'],
];

export const tanwinWrappers = [
  ['(', ')'], ['[', ']'], ['{', '}'], ['«', '»'], ['"', '"'],
  ['', '+'], ['', '=2'], ['', '/'], ['', '^2'], ['', '°'],
  [' ', ' '], ['\n', '\n'], ['', '?'], ['', ','], ['', ';'],
];

export const tanwinSpecialInputs = [
  { direction: 'en2ar', input: 'N=2 (N) ā N' },
  { direction: 'ar2en', input: 'بَاً' },
  { direction: 'ar2en', input: 'كتابًا' },
  { direction: 'en2ar', input: 'ktābaNā' },
];
