import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {readJsonArtifact, writeJsonArtifact} from '../scripts/lib/json-artifacts.mjs';

function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'arabiclatin-json-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}
function files(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}

test('JSON modules preserve nested values, corpus groups, and order with a 500-line ceiling', t => {
  const dir = workspace(t), file = join(dir, 'report.json');
  const cases = Array.from({length: 800}, (_, i) => ({id: i, group: i < 400 ? 'Arabic' : 'Latin', direction: 'ar2en', input: "عَمَل\n'ā\u0000\ud800", output: 'ʿamal', values: [null, false, i, '']}));
  const original = {summary: {cases: cases.length}, cases, nested: {copies: [cases, cases]}};
  assert.ok(writeJsonArtifact(file, original).modules > 1);
  assert.deepEqual(readJsonArtifact(pathToFileURL(file)), original);
  const generated = files(dir);
  assert.ok(generated.some(name => name.includes('Arabic-ar2en')));
  for (const name of generated) assert.ok(readFileSync(name, 'utf8').trimEnd().split('\n').length <= 500, name);
  const firstWrite = generated.map(name => [name, readFileSync(name, 'utf8')]);
  writeJsonArtifact(file, original);
  assert.deepEqual(files(dir).map(name => [name, readFileSync(name, 'utf8')]), firstWrite);
  writeJsonArtifact(file, {replacement: 'small'});
  assert.deepEqual(readJsonArtifact(file), {replacement: 'small'});
  assert.deepEqual(files(dir), [file]);
});

test('JSON modules support large objects and plain JSON without module metadata', t => {
  const file = join(workspace(t), 'values.json');
  const object = Object.fromEntries(Array.from({length: 1200}, (_, i) => [`key${i}`, i]));
  writeJsonArtifact(file, object);
  assert.deepEqual(readJsonArtifact(file), object);
  for (const value of [[], {}, null, false, 0, 'ع\nʿ']) {
    writeJsonArtifact(file, value);
    assert.deepEqual(readJsonArtifact(file), value);
  }
});

test('broken JSON modules fail clearly rather than dropping saved expectations', t => {
  const dir = workspace(t), file = join(dir, 'data.json');
  const reference = parts => JSON.stringify({$jsonModules: 'arabiclatin/v1', kind: 'array', parts});
  writeFileSync(file, reference(['missing.json']));
  assert.throws(() => readJsonArtifact(file), /ENOENT/);
  writeFileSync(file, reference(['data.json']));
  assert.throws(() => readJsonArtifact(file), /Circular JSON module/);
  writeFileSync(file, reference(['../outside.json']));
  assert.throws(() => readJsonArtifact(file), /escapes its artifact directory/);
  writeFileSync(join(dir, 'wrong.json'), '{}');
  writeFileSync(file, reference(['wrong.json']));
  assert.throws(() => readJsonArtifact(file), /Expected array modules/);
});
