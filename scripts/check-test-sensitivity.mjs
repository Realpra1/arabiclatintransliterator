import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, translatorFiles } from '../tests/helpers/load-translator.mjs';

// Break one behavior at a time in a disposable copy and require real assertion
// failures. The working project's implementation and fixtures are never edited.
const mutations = [
  { name: 'Latin b maps to the wrong Arabic letter', file: 'constants.js', from: '["b","ب"]', to: '["b","ت"]' },
  { name: 'Arabic ب maps to the wrong Latin letter', file: 'constants.js', from: '["ب","b"]', to: '["ب","p"]' },
  { name: 'English e normalizes to the wrong vowel', file: 'latin-normalizer.js', from: 'if (ch === "e") {\n        rewritten += "i";', to: 'if (ch === "e") {\n        rewritten += "a";' },
];
const temporary = mkdtempSync(join(tmpdir(), 'arabiclatin-regression-'));
try {
  for (const file of [...translatorFiles, 'ArabicEnglishAlphabetTranslator.html', 'tests', 'scripts/lib']) {
    cpSync(new URL(file, root), join(temporary, file), { recursive: true });
  }
  for (const mutation of mutations) {
    const source = readFileSync(new URL(mutation.file, root), 'utf8');
    assert.equal(source.split(mutation.from).length - 1, 1, `Mutation target changed: ${mutation.name}`);
    writeFileSync(join(temporary, mutation.file), source.replace(mutation.from, mutation.to));
    const result = spawnSync(process.execPath, ['--test', 'tests/contract.test.mjs', 'tests/regression.test.mjs'], {
      cwd: temporary, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60_000,
    });
    writeFileSync(join(temporary, mutation.file), source);
    if (result.error) throw result.error;
    assert.equal(result.status, 1, `Tests did not reject mutation: ${mutation.name}`);
    assert.match(result.stdout, /ERR_ASSERTION/, 'Require an assertion failure, not a crash or syntax error');
    const failures = Number(result.stdout.match(/^# fail (\d+)$/m)?.[1]);
    assert.ok(failures > 0, 'Require at least one failing test');
    console.log(`Caught: ${mutation.name} (${failures} failed tests)`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
