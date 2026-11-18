import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const raster = createRequire(import.meta.url)('../pdf-export/raster-lines.js');

function pixels(width, height, sample) {
  return Uint8ClampedArray.from(Array.from({length: width * height}, (_, i) => sample(i % width, Math.floor(i / width))).flat());
}

test('solid black rows use one open span each, alternating direction', () => {
  const result = [...raster.rows(pixels(5, 3, () => [0, 0, 0, 255]), 5, 3)];
  assert.deepEqual(result.map(r => r.spans), [[[0, 5]], [[5, 0]], [[0, 5]]]);
  assert.equal(result.reduce((n, r) => n + r.darkPixels, 0), 15);
});

test('white and fully transparent pixels cause no engraving', () => {
  for (const color of [[255, 255, 255, 255], [0, 0, 0, 0]]) {
    assert.ok([...raster.rows(pixels(12, 8, () => color), 12, 8)].every(r => !r.spans.length));
  }
});

test('runs stop at white gaps and never join disconnected marks', () => {
  const result = [...raster.rows(pixels(8, 2, x => [0, 0, 0, [0, 1, 4, 6, 7].includes(x) ? 255 : 0]), 8, 2)];
  assert.deepEqual(result.map(r => r.spans), [[[0, 2], [4, 5], [6, 8]], [[8, 6], [5, 4], [2, 0]]]);
});

test('gray levels preserve average ink coverage to within one percent', () => {
  for (const gray of [32, 64, 128, 192, 224]) {
    const rows = [...raster.rows(pixels(160, 160, () => [gray, gray, gray, 255]), 160, 160)];
    const coverage = rows.reduce((n, r) => n + r.darkPixels, 0) / (160 * 160);
    assert.ok(Math.abs(coverage - (1 - gray / 255)) < 0.01, `${gray}: ${coverage}`);
    assert.deepEqual(rows, [...raster.rows(pixels(160, 160, () => [gray, gray, gray, 255]), 160, 160)]);
  }
});

test('half-transparent black matches half-gray on white, without background speckles', () => {
  const transparent = [...raster.rows(pixels(80, 80, x => [0, 0, 0, x < 40 ? 128 : 0]), 80, 80)];
  const gray = [...raster.rows(pixels(80, 80, x => x < 40 ? [127, 127, 127, 255] : [255, 255, 255, 255]), 80, 80)];
  assert.deepEqual(transparent, gray);
  for (const row of transparent) for (const span of row.spans) assert.ok(Math.max(...span) <= 40);
});

test('every dark pixel belongs to exactly one nonzero span', () => {
  const width = 31, height = 17;
  const rows = [...raster.rows(pixels(width, height, (x, y) => [(x * 17 + y * 11) % 256, 90, 150, 200]), width, height)];
  for (const row of rows) {
    const covered = new Set();
    for (const [a, b] of row.spans) {
      assert.notEqual(a, b);
      assert.equal(Math.sign(b - a), row.y % 2 ? -1 : 1);
      for (let x = Math.min(a, b); x < Math.max(a, b); x++) {
        assert.ok(!covered.has(x)); covered.add(x);
      }
    }
    assert.equal(covered.size, row.darkPixels);
  }
});

test('invalid pixel buffers are rejected', () => {
  assert.throws(() => [...raster.rows(new Uint8Array(3), 1, 1)], /dimensions/);
  assert.throws(() => [...raster.rows(new Uint8Array(0), 0, 0)], /dimensions/);
});
