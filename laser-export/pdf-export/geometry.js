/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Bezier controls remain controls. Never turn them into line vertices.
const LaserGeometry = (() => {
  function parsePath(data, closeOpen = false) {
    const token = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
    if (data.replace(token, '').replace(/[\s,]/g, '')) throw Error('Unrecognized SVG path syntax.');
    const tokens = data.match(token) || [];
    const segments = [];
    let i = 0, command, current = [0, 0], start = current, lastControl = null, previous = '', hasSubpath = false;
    const point = relative => {
      const p = [number(), number()];
      return relative ? p.map((v, j) => v + current[j]) : p;
    };
    function number() {
      if (i >= tokens.length || /^[a-z]$/i.test(tokens[i])) throw Error('Incomplete SVG path.');
      const value = Number(tokens[i++]);
      if (!Number.isFinite(value)) throw Error('Non-finite SVG coordinate.');
      return value;
    }
    const add = (cmd, points) => {
      segments.push({cmd, points: [current, ...points]});
      current = points.at(-1);
    };
    while (i < tokens.length) {
      if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
      if (!command) throw Error('Missing SVG path command.');
      const type = command.toUpperCase(), relative = command !== type;
      let control = null;
      if (type === 'M') {
        const next = point(relative);
        if (closeOpen && hasSubpath && !equal(current, start, 0)) add('L', [start]);
        current = next; start = current;
        hasSubpath = true;
        command = relative ? 'l' : 'L';
      } else if (type === 'L') add('L', [point(relative)]);
      else if (type === 'H') add('L', [[number() + (relative ? current[0] : 0), current[1]]]);
      else if (type === 'V') add('L', [[current[0], number() + (relative ? current[1] : 0)]]);
      else if (type === 'C') {
        const c1 = point(relative); control = point(relative);
        add('C', [c1, control, point(relative)]);
      } else if (type === 'Q') {
        control = point(relative); add('Q', [control, point(relative)]);
      } else if (type === 'S' || type === 'T') {
        const compatible = type === 'S' ? /[CS]/.test(previous) : /[QT]/.test(previous);
        const reflected = compatible && lastControl ? current.map((v, j) => 2 * v - lastControl[j]) : current;
        if (type === 'S') { control = point(relative); add('C', [reflected, control, point(relative)]); }
        else { control = reflected; add('Q', [control, point(relative)]); }
      } else if (type === 'Z') { add('L', [start]); command = null; }
      else throw Error(`Unsupported SVG path command: ${type}. Use ordinary SVG export for this PDF.`);
      previous = type; lastControl = control;
    }
    if (closeOpen && hasSubpath && !equal(current, start, 0)) add('L', [start]);
    return segments.filter(s => !s.points.every(p => equal(p, s.points[0], 0)));
  }
  const equal = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
  function uniqueSegments(segments) {
    const seen = new Set(), unique = [];
    for (const s of segments) {
      const key = s.cmd + [JSON.stringify(s.points), JSON.stringify([...s.points].reverse())].sort()[0];
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(s);
    }
    return unique;
  }
  function splitLines(segments) {
    const endpoints = [...new Map(segments.flatMap(s => [s.points[0], s.points.at(-1)]).map(p => [p.join(','), p])).values()];
    const comparisons = segments.filter(s => s.cmd === 'L').length * endpoints.length;
    // Avoid quadratic work on very large illustrations; exact duplicates are
    // still removed. This limit is surfaced in the conversion result.
    if (comparisons > 2000000) return {segments, limited: true};
    const result = [];
    for (const s of segments) {
      if (s.cmd !== 'L') { result.push(s); continue; }
      const [a, b] = s.points, dx = b[0] - a[0], dy = b[1] - a[1], lengthSquared = dx * dx + dy * dy;
      const interior = [];
      for (const p of endpoints) {
        const px = p[0] - a[0], py = p[1] - a[1];
        const t = (px * dx + py * dy) / lengthSquared;
        if (t > 0 && t < 1 && px * dy === py * dx) interior.push([t, p]);
      }
      interior.sort((a, b) => a[0] - b[0]);
      const chain = [a];
      for (const [, p] of interior) if (!equal(p, chain.at(-1), 0)) chain.push(p);
      chain.push(b);
      for (let j = 1; j < chain.length; j++) result.push({cmd: 'L', points: [chain[j - 1], chain[j]]});
    }
    return {segments: result, limited: false};
  }
  function pathData(segments) {
    // Join exact endpoints only. A new M never introduces an engraving edge.
    let data = '', current = null;
    for (const s of segments) {
      if (!current || !equal(current, s.points[0], 0)) data += 'M' + s.points[0].join(' ');
      data += s.cmd + s.points.slice(1).map(p => p.join(' ')).join(' ');
      current = s.points.at(-1);
    }
    return data;
  }
  function simplify(data, closeOpen = false) {
    const source = parsePath(data, closeOpen);
    const split = splitLines(source), unique = uniqueSegments(split.segments);
    return {data: pathData(unique), source: source.length, normalized: split.segments.length,
      kept: unique.length, removed: split.segments.length - unique.length, limited: split.limited};
  }
  return {parsePath, simplify, pathData, uniqueSegments};
})();
if (typeof module !== 'undefined') module.exports = LaserGeometry;
