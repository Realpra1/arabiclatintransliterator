import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const geometry = require('../pdf-export/geometry.js');
const zip = require('../pdf-export/zip.js');

test('reverse cubics and lines retain exactly one original curve, no control polygon', () => {
  const result = geometry.simplify('M0 0 C10 30 20 30 30 0 C20 30 10 30 0 0 M0 50L10 50 0 50Z');
  assert.equal(result.removed, 2);
  assert.deepEqual(geometry.parsePath(result.data), [
    {cmd: 'C', points: [[0, 0], [10, 30], [20, 30], [30, 0]]},
    {cmd: 'L', points: [[0, 50], [10, 50]]}
  ]);
});
test('partial line overlap splits at endpoints without adding travel', () => {
  const result = geometry.simplify('M0 0L10 0M15 0L5 0');
  assert.equal(result.removed, 1);
  const segments = geometry.parsePath(result.data);
  assert.equal(segments.length, 3);
  assert.equal(segments.reduce((n, s) => n + Math.abs(s.points[1][0] - s.points[0][0]), 0), 15);
});
test('nearby lines and distinct Bezier controls survive', () => {
  const result = geometry.simplify('M0 0L100 0M0 .001L100 .001M0 0C10 40 90 40 100 0M100 0C90 40.01 10 40.01 0 0');
  assert.equal(result.kept, 4);
  assert.equal(result.removed, 0);
});
test('even very close curves are preserved when control coordinates differ', () => {
  const d = 'M0 0C.33333333 .8 .66666667 .8 1 0C.66666665 .8 .33333335 .8 0 0';
  assert.equal(geometry.simplify(d).kept, 2);
});
test('off-line endpoints do not bend a straight line', () => {
  const data = 'M0 0L1000 0M500 .0001L500 10';
  assert.deepEqual(geometry.parsePath(geometry.simplify(data).data), geometry.parsePath(data));
});
test('filled open contours acquire their implicit closing edges', () => {
  assert.equal(geometry.simplify('M0 0L10 0L5 10', true).kept, 3);
  assert.equal(geometry.simplify('M0 0L10 0L5 10', false).kept, 2);
  const paths = geometry.parsePath('M0 0L10 0L5 10m10 0l5 0l0 5', true);
  assert.deepEqual(paths[3].points[0], [15, 10]);
});
test('relative commands, smooth curves and nonzero closing edges are resolved', () => {
  const segments = geometry.parsePath('m1 2h3v4l-3 0z m0 10q2 2 4 0t4 0');
  assert.equal(segments.length, 6);
  assert.deepEqual(segments[3].points, [[1, 6], [1, 2]]);
  assert.deepEqual(segments[5].points, [[5, 12], [7, 10], [9, 12]]);
});
test('invalid and unsupported paths fail instead of silently discarding geometry', () => {
  for (const data of ['M0', 'M0 0L1', 'M0 0A1 1 0 0 0 2 2', 'M0 0!L1 2']) assert.throws(() => geometry.simplify(data));
  assert.equal(geometry.simplify('M0 0Z').kept, 0);
});
test('closed circles remain closed geometrically and are traversed once', () => {
  const circle = 'M1 0C1 1 -1 1 -1 0C-1 -1 1 -1 1 0C1 -1 -1 -1 -1 0C-1 1 1 1 1 0';
  const result = geometry.simplify(circle);
  assert.equal(result.kept, 2);
  const segments = geometry.parsePath(result.data);
  assert.deepEqual(segments[0].points[0], segments.at(-1).points.at(-1));
});
test('ZIP CRC and signatures are standard', async () => {
  assert.equal(zip.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bytes = new Uint8Array(await zip.pack([{name: 'page-1.svg', content: '<svg/>'}]).arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [80, 75, 3, 4]);
  assert.deepEqual([...bytes.slice(-22, -18)], [80, 75, 5, 6]);
});
