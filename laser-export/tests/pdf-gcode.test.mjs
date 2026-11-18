import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const gc = createRequire(import.meta.url)('../pdf-export/gcode.js');
const flat = p => { const lines = []; gc.flatten(p, (a, b) => lines.push([a, b])); return lines; };
const rectangle = [[0, 0], [10, 0], [10, 10], [0, 10]];

test('straight image spans remain one move each without retracing', () => {
  assert.deepEqual(flat([[0, 1], [20, 1]]), [[[0, 1], [20, 1]]]);
  const writer = gc.writer({feed: 1000, power: 950});
  writer.line([0, 1], [20, 1]); writer.line([20, 1.1], [0, 1.1]);
  const {content, moves} = writer.finish();
  assert.equal(moves, 2);
  assert.match(content, /S0\nG0 X0 Y1\nS950\nG1 X20 Y1 F1000\nS0\nG0 X20 Y1.1\nS950\nG1 X0 Y1.1 F1000/);
});

test('Bezier flattening stays within 0.01mm of independently sampled curve', () => {
  const points = [[2, 3], [2, 80], [120, -60], [100, 3]], lines = flat(points);
  function distance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  for (let i = 0; i <= 2000; i++) {
    const t = i / 2000, u = 1 - t;
    const p = [0, 1].map(k => u ** 3 * points[0][k] + 3 * u * u * t * points[1][k] + 3 * u * t * t * points[2][k] + t ** 3 * points[3][k]);
    assert.ok(Math.min(...lines.map(([a, b]) => distance(p, a, b))) <= gc.toleranceMm);
  }
  assert.deepEqual(lines[0][0], points[0]); assert.deepEqual(lines.at(-1)[1], points.at(-1));
});

test('closed loops and collinear curve reversals are not dropped', () => {
  const loop = flat([[0, 0], [20, 30], [-20, 30], [0, 0]]);
  assert.ok(loop.length > 10); assert.deepEqual(loop.at(-1)[1], [0, 0]);
  const reversal = flat([[0, 0], [20, 0], [-20, 0], [1, 0]]);
  assert.ok(reversal.some(([a, b]) => b[0] < a[0]));
  const quadratic = flat([[0, 0], [10, 20], [20, 0]]);
  assert.ok(quadratic.some(([a]) => a[1] === 10));
});

test('clips crossing strokes without inventing boundary marks', () => {
  assert.deepEqual(gc.clip([-5, 5], [15, 5], rectangle), [[0, 5], [10, 5]]);
  assert.deepEqual(gc.clip([15, 5], [-5, 5], [...rectangle].reverse()), [[10, 5], [0, 5]]);
  assert.equal(gc.clip([-2, -2], [-1, -1], rectangle), null);
  assert.deepEqual(gc.clip([0, 0], [10, 0], rectangle), [[0, 0], [10, 0]]);
  const diamond = [[0, 5], [5, 0], [10, 5], [5, 10]];
  assert.deepEqual(gc.clip([-5, 2], [15, 2], diamond), [[3, 2], [7, 2]]);
});

test('known-working protocol, actual bounds, LF, explicit moves and configured settings', () => {
  const writer = gc.writer({feed: 800, power: 700});
  writer.line([12.123456, 20], [13, 22]); writer.line([13, 22], [15, 21]);
  const {content, bounds, moves} = writer.finish();
  assert.deepEqual(bounds, [12.1235, 20, 15, 22]); assert.equal(moves, 2);
  assert.match(content, /; Bounds: X12.1235 Y20 to X15 Y22\nG00 G17 G40 G21 G54\nG90\nM4\nM8\nS0\n/);
  assert.ok(content.endsWith('M9\nG1 S0\nM5\nG90\nG0 X0 Y0\nM2\n'));
  assert.ok(!content.includes('\r')); assert.ok(!/\bZ[\d-]/.test(content));
  assert.equal((content.match(/S700/g) || []).length, 1);
  assert.equal((content.match(/F800/g) || []).length, 2);
  for (const line of content.split('\n')) if (/[XY][-\d]/.test(line) && !line.startsWith(';')) assert.match(line, /^G[01] X/);
});

test('rounding does not produce tiny zero-length powered moves', () => {
  const writer = gc.writer({feed: 1000, power: 950});
  writer.line([1, 1], [1.000001, 1]); writer.line([1, 1], [2, 1]);
  assert.equal(writer.finish().moves, 1);
});

test('picture power changes apply even on adjoining spans; text returns to full power', () => {
  const writer = gc.writer({feed: 800, power: 950});
  writer.line([0, 1], [2, 1], .5); writer.line([2, 1], [3, 1], .25);
  writer.line([3, 1], [4, 1]); writer.line([4, 1], [5, 1], 0); writer.line([5, 1], [6, 1], .5);
  const result = writer.finish();
  assert.equal(result.moves, 4);
  assert.match(result.content, /S475\nG1 X2 Y1 F800\nS238\nG1 X3 Y1 F800\nS950\nG1 X4 Y1 F800\nS0\nG0 X5 Y1\nS475/);
  assert.throws(() => writer.line([0, 0], [1, 0], NaN), /power/);
  assert.throws(() => writer.line([0, 0], [1, 0], 2), /power/);
});

test('invalid settings, nonfinite geometry and blank pages fail explicitly', () => {
  for (const options of [{feed: 0, power: 950}, {feed: 1e-8, power: 950}, {feed: Infinity, power: 950}, {feed: 1000, power: 1001}, {feed: 1000, power: 0}, {feed: 1000, power: 1.5}]) assert.throws(() => gc.writer(options));
  const writer = gc.writer({feed: 1000, power: 950});
  assert.throws(() => writer.finish(), /no engraving/);
  assert.throws(() => writer.line([NaN, 0], [1, 1]), /Non-finite/);
  assert.throws(() => flat([[Infinity, 0], [1, 1]]), /Non-finite/);
});
