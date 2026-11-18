import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), regions = require('../pdf-export/image-regions.js'), raster = require('../pdf-export/raster-lines.js');
const canonical = lines => lines.map(([y, a, b, power]) => JSON.stringify([y, Math.min(a, b), Math.max(a, b), power])).sort();

test('finishes disconnected shapes separately with identical coverage and much shorter travel', () => {
  const spans = [];
  for (let y = 0; y < 40; y++) spans.push(...(y % 2 ? [[y, 110, 100, 1], [y, 10, 0, 1]] : [[y, 0, 10, 1], [y, 100, 110, 1]]));
  const result = regions.order(spans);
  assert.equal(result.regions, 2);
  assert.deepEqual(canonical(result.spans), canonical(spans));
  assert.ok(result.after < result.before / 10);
  const left = result.spans.map(s => Math.min(s[1], s[2]) < 50);
  assert.equal(left.slice(1).filter((v, i) => v !== left[i]).length, 1);
});

test('holes stay white and bridges join the appropriate region', () => {
  const spans = [[0, 0, 10], [1, 3, 0], [1, 10, 7], [2, 0, 3], [2, 7, 10], [3, 10, 0]];
  const result = regions.order(spans);
  assert.equal(result.regions, 1); assert.deepEqual(canonical(result.spans), canonical(spans));
});

test('separated rows and diagonally touching pixels remain separate', () => {
  assert.equal(regions.order([[0, 0, 1], [1, 1, 2], [3, 1, 2]]).regions, 3);
  assert.equal(regions.order([]).regions, 0);
});

test('adjacent shades are one area and keep their power through route reversal', () => {
  const spans = [[0, 0, 3, 1], [0, 3, 6, .5], [1, 6, 3, .5], [1, 3, 0, 1], [2, 0, 3, 1], [2, 3, 6, .25]];
  const result = regions.order(spans);
  assert.equal(result.regions, 1); assert.deepEqual(canonical(result.spans), canonical(spans));
});

test('shaded pixels use joined reduced-power spans rather than dithered gaps', () => {
  const pixels = Uint8ClampedArray.from(Array.from({length: 8}, (_, i) => [i < 4 ? 128 : 0, i < 4 ? 128 : 0, i < 4 ? 128 : 0, 255]).flat());
  assert.deepEqual([...raster.rows(pixels, 8, 1, 'power')][0].spans, [[0, 4, .5], [4, 8, 1]]);
  const alpha = Uint8ClampedArray.from([0, 0, 0, 128, 255, 255, 255, 255, 0, 0, 0, 0]);
  assert.deepEqual([...raster.rows(alpha, 3, 1, 'power')][0].spans, [[0, 1, .5]]);
});

test('power levels are proportional and do not add white-background marks', () => {
  for (let gray = 0; gray < 256; gray++) {
    const pixels = Uint8ClampedArray.from([gray, gray, gray, 255]);
    const spans = [...raster.rows(pixels, 1, 1, 'power')][0].spans;
    assert.ok(Math.abs((spans[0]?.[2] || 0) - (1 - gray / 255)) <= 1 / 64 + 1e-12);
  }
  assert.throws(() => [...raster.rows(new Uint8ClampedArray(4), 1, 1, 'invalid')]);
});
