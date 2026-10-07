// Split oversized artifacts without changing their reconstructed JSON values.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {readJsonArtifact, writeJsonArtifact, MAX_JSON_LINES} from './lib/json-artifacts.mjs';
for (const directory of ['experiments', 'tests/fixtures']) {
  for (const name of readdirSync(new URL(`../${directory}/`, import.meta.url))) {
    if (!name.endsWith('.json')) continue;
    const path = new URL(`../${directory}/${name}`, import.meta.url);
    if (readFileSync(path, 'utf8').trimEnd().split('\n').length <= MAX_JSON_LINES) continue;
    const original = readJsonArtifact(path);
    const {modules} = writeJsonArtifact(path, original);
    assert.deepEqual(readJsonArtifact(path), original, `${directory}/${name}`);
    console.log(`${directory}/${name}: ${modules} modules; exact JSON values preserved`);
  }
}
