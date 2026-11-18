/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserGcode = (() => {
  const TOLERANCE_MM = 0.01, MAX_MOVES = 2000000;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const minus = (a, b) => a.map((v, i) => v - b[i]);
  function distanceToSegment(p, a, b) {
    const d = minus(b, a), length = d[0] ** 2 + d[1] ** 2;
    const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / length)) : 0;
    return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1]);
  }
  function flatten(points, emit, depth = 0) {
    if (!points.flat().every(Number.isFinite)) throw Error('Non-finite engraving coordinate.');
    const a = points[0], b = points.at(-1);
    if (points.length === 2 || points.slice(1, -1).every(p => distanceToSegment(p, a, b) <= TOLERANCE_MM)) {
      if (!same(a, b)) emit(a, b);
      return;
    }
    if (depth >= 20) throw Error('A curve is too complex to convert accurately.');
    const left = [a], right = [b];
    let row = points;
    while (row.length > 1) {
      row = row.slice(1).map((p, i) => p.map((v, j) => (v + row[i][j]) / 2));
      left.push(row[0]); right.unshift(row.at(-1));
    }
    flatten(left, emit, depth + 1); flatten(right, emit, depth + 1);
  }
  // Convex clip polygons, including transformed PDF page rectangles.
  function clip(a, b, polygon) {
    const area = polygon.reduce((s, p, i) => s + cross(p, polygon[(i + 1) % polygon.length]), 0);
    if (Math.abs(area) < 1e-14) return null;
    const sign = Math.sign(area), direction = minus(b, a);
    let enter = 0, leave = 1;
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], edge = minus(polygon[(i + 1) % polygon.length], p);
      const start = sign * cross(edge, minus(a, p)), rate = sign * cross(edge, direction);
      if (Math.abs(rate) < 1e-14) { if (start < -1e-10) return null; continue; }
      const t = -start / rate;
      if (rate > 0) enter = Math.max(enter, t); else leave = Math.min(leave, t);
      if (enter >= leave) return null;
    }
    return [a.map((v, i) => v + enter * direction[i]), a.map((v, i) => v + leave * direction[i])];
  }
  function validate(options) {
    const feed = Number(options.feed), power = Number(options.power);
    if (!Number.isFinite(feed) || feed < 1 || feed > 1000000) throw Error('Enter a speed from 1 to 1000000 mm/min.');
    if (!Number.isInteger(power) || power < 1 || power > 1000) throw Error('Enter laser power as an S value from 1 to 1000.');
    return {feed, power};
  }
  function writer(options) {
    const {feed, power} = validate(options);
    const lines = [], bounds = [Infinity, Infinity, -Infinity, -Infinity];
    let current = null, moves = 0, activePower = 0;
    const rounded = p => p.map(v => Number(v.toFixed(4)));
    const xy = p => `X${p[0]} Y${p[1]}`;
    function line(start, end, fraction = 1) {
      if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw Error('Picture power must be between zero and one.');
      const requestedPower = Math.round(power * fraction);
      if (requestedPower === 0) return;
      if (![...start, ...end].every(Number.isFinite)) throw Error('Non-finite engraving coordinate.');
      const a = rounded(start), b = rounded(end);
      if (same(a, b)) return;
      if (++moves > MAX_MOVES) throw Error('This page produces too many G-code moves. Export a smaller page.');
      if (!current || !same(current, a)) { lines.push('S0', `G0 ${xy(a)}`); activePower = 0; }
      if (activePower !== requestedPower) { lines.push(`S${requestedPower}`); activePower = requestedPower; }
      lines.push(`G1 ${xy(b)} F${feed}`);
      current = b;
      for (const p of [a, b]) {
        bounds[0] = Math.min(bounds[0], p[0]); bounds[1] = Math.min(bounds[1], p[1]);
        bounds[2] = Math.max(bounds[2], p[0]); bounds[3] = Math.max(bounds[3], p[1]);
      }
    }
    function finish() {
      if (!moves) throw Error('This page has no engraving lines.');
      const [left, bottom, right, top] = bounds;
      const header = ['; PDF to SVG - direct G-code export', `; Bounds: X${left} Y${bottom} to X${right} Y${top}`,
        'G00 G17 G40 G21 G54', 'G90', 'M4', 'M8', 'S0'];
      const footer = ['M9', 'G1 S0', 'M5', 'G90', 'G0 X0 Y0', 'M2'];
      return {content: [...header, ...lines, ...footer, ''].join('\n'), moves, bounds, feed, power};
    }
    return {line, finish};
  }
  return {flatten, clip, validate, writer, toleranceMm: TOLERANCE_MM};
})();
if (typeof module !== 'undefined') module.exports = LaserGcode;
