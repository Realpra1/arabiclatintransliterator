/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserRegions = (() => {
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const start = s => [s[1], s[0]], end = s => [s[2], s[0]];
  function travel(spans) {
    let total = 0;
    for (let i = 1; i < spans.length; i++) total += distance(end(spans[i - 1]), start(spans[i]));
    return total;
  }
  function order(spans) {
    if (spans.length > 250000) throw Error('Too many image lines for connected-area fill. Choose Scan rows instead.');
    const parents = Int32Array.from(spans, (_, i) => i), sizes = new Int32Array(spans.length).fill(1);
    function find(i) {
      while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
      return i;
    }
    function join(a, b) {
      a = find(a); b = find(b); if (a === b) return;
      if (sizes[a] < sizes[b]) [a, b] = [b, a];
      parents[b] = a; sizes[a] += sizes[b];
    }
    // Runs on adjacent rows connect only when their black pixel columns overlap.
    // Diagonal contact and white gaps do not create new engraving connections.
    let previous = [], previousY = -Infinity;
    for (let i = 0; i < spans.length;) {
      const row = [], y = spans[i][0];
      while (i < spans.length && spans[i][0] === y) row.push(i++);
      row.sort((a, b) => Math.min(spans[a][1], spans[a][2]) - Math.min(spans[b][1], spans[b][2]));
      for (let j = 1; j < row.length; j++) {
        const a = spans[row[j - 1]], b = spans[row[j]];
        if (Math.max(a[1], a[2]) === Math.min(b[1], b[2])) join(row[j - 1], row[j]);
      }
      if (y === previousY + 1) {
        let cursor = 0;
        for (const index of row) {
          const lo = Math.min(spans[index][1], spans[index][2]), hi = Math.max(spans[index][1], spans[index][2]);
          while (cursor < previous.length && Math.max(spans[previous[cursor]][1], spans[previous[cursor]][2]) <= lo) cursor++;
          for (let j = cursor; j < previous.length; j++) {
            const other = previous[j];
            if (Math.min(spans[other][1], spans[other][2]) >= hi) break;
            join(index, other);
          }
        }
      }
      previous = row; previousY = y;
    }
    const groups = new Map();
    for (let i = 0; i < spans.length; i++) {
      const id = find(i);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(spans[i]);
    }
    const regions = [...groups.values()].map((lines, id) => {
      const first = start(lines[0]), last = end(lines.at(-1));
      return {lines, id, first, last, x: (first[0] + last[0]) / 2, y: (first[1] + last[1]) / 2};
    });
    // Bounded spatial sorting keeps tiny dither islands local without quadratic
    // all-pairs routing. Try both split-axis orders and keep the shorter route.
    function spatial(items, axis = 0) {
      if (items.length <= 1) return items;
      const key = axis ? 'y' : 'x';
      items.sort((a, b) => a[key] - b[key] || a.id - b.id);
      const middle = Math.floor(items.length / 2);
      return [...spatial(items.slice(0, middle), 1 - axis), ...spatial(items.slice(middle), 1 - axis).reverse()];
    }
    function route(items) {
      let current = spans.length ? start(spans[0]) : [0, 0];
      const ordered = [];
      for (const item of items) {
        if (distance(current, item.last) < distance(current, item.first)) {
          for (let i = item.lines.length - 1; i >= 0; i--) {
            const [y, a, b, ...attributes] = item.lines[i]; ordered.push([y, b, a, ...attributes]);
          }
        } else for (const line of item.lines) ordered.push(line);
        current = end(ordered.at(-1));
      }
      return ordered;
    }
    const candidates = [regions, spatial([...regions]), spatial([...regions], 1)].map(route);
    candidates.sort((a, b) => travel(a) - travel(b));
    const ordered = candidates[0];
    return {spans: ordered, regions: regions.length, before: travel(spans), after: travel(ordered)};
  }
  return {order, travel};
})();
if (typeof module !== 'undefined') module.exports = LaserRegions;
