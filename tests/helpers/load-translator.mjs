import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

export const root = new URL('../../', import.meta.url);
export const translatorFiles = [
  'constants.js',
  'translator-core-utils.js',
  'latin-normalizer.js',
  'translator-ar2en.js',
  'translator-en2ar.js',
  'translator.js',
  'transliteration-view.js',
];

// Execute the unmodified browser scripts in their own window, in browser order.
// No copy of the transliteration implementation lives in the tests.
export function loadTranslator() {
  const context = createContext({ window: {} });
  for (const file of translatorFiles) {
    const url = new URL(file, root);
    runInContext(readFileSync(url, 'utf8'), context, { filename: fileURLToPath(url) });
  }
  return context.window;
}
