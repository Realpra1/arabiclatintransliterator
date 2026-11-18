/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserSvgPathInput = (() => {
  // SVG 2 endpoint-to-center conversion, including radii correction:
  // https://www.w3.org/TR/SVG2/implnote.html#ArcImplementationNotes
  // Cubic arc approximation uses slices no wider than 45 degrees.
  function arc(from, to, rx, ry, rotation, large, sweep) {
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (from[0] === to[0] && from[1] === to[1]) return [];
    if (!rx || !ry) return [['L', ...to]];
    const phi = rotation * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi);
    const dx = (from[0] - to[0]) / 2, dy = (from[1] - to[1]) / 2;
    const x = c * dx + s * dy, y = -s * dx + c * dy;
    const correction = Math.hypot(x / rx, y / ry);
    if (correction > 1) { rx *= correction; ry *= correction; }
    const ratio = (x / rx) ** 2 + (y / ry) ** 2;
    const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (1 - ratio) / ratio));
    const cxLocal = k * rx * y / ry, cyLocal = -k * ry * x / rx;
    const cx = c * cxLocal - s * cyLocal + (from[0] + to[0]) / 2;
    const cy = s * cxLocal + c * cyLocal + (from[1] + to[1]) / 2;
    const u = [(x - cxLocal) / rx, (y - cyLocal) / ry];
    const v = [(-x - cxLocal) / rx, (-y - cyLocal) / ry];
    let theta = Math.atan2(u[1], u[0]);
    let delta = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    if (sweep && delta < 0) delta += 2 * Math.PI;
    const count = Math.ceil(Math.abs(delta) / (Math.PI / 4)), step = delta / count;
    const position = t => [cx + rx * c * Math.cos(t) - ry * s * Math.sin(t), cy + rx * s * Math.cos(t) + ry * c * Math.sin(t)];
    const tangent = t => [-rx * c * Math.sin(t) - ry * s * Math.cos(t), -rx * s * Math.sin(t) + ry * c * Math.cos(t)];
    const commands = [];
    for (let i = 0; i < count; i++) {
      const end = theta + step, a = position(theta), b = position(end);
      const da = tangent(theta), db = tangent(end), alpha = 4 / 3 * Math.tan(step / 4);
      commands.push(['C', ...a.map((v, j) => v + alpha * da[j]), ...b.map((v, j) => v - alpha * db[j]), ...(i === count - 1 ? to : b)]);
      theta = end;
    }
    return commands;
  }
  function normalize(data) {
    let index = 0, command = null, current = [0, 0], start = current, previous = '', control = null;
    const commands = [], numeric = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/;
    const skip = () => { while (/[\s,]/.test(data[index] || '') && index < data.length) index++; };
    function number(flag = false) {
      skip();
      const match = data.slice(index).match(flag ? /^[01]/ : numeric);
      if (!match) throw Error('Incomplete or invalid SVG path coordinates.');
      index += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw Error('Non-finite SVG path coordinate.');
      return value;
    }
    const point = relative => [number(), number()].map((v, j) => v + (relative ? current[j] : 0));
    function emit(type, ...points) { commands.push([type, ...points.flat()]); if (points.length) current = points.at(-1); }
    while (true) {
      skip(); if (index >= data.length) break;
      if (/[A-Za-z]/.test(data[index])) command = data[index++];
      if (!command) throw Error('Missing SVG path command.');
      const type = command.toUpperCase(), relative = command !== type;
      if (!commands.length && type !== 'M') throw Error('SVG paths must begin with a move.');
      let nextControl = null;
      if (type === 'M') { emit('M', point(relative)); start = current; command = relative ? 'l' : 'L'; }
      else if (type === 'L') emit('L', point(relative));
      else if (type === 'H') emit('L', [number() + (relative ? current[0] : 0), current[1]]);
      else if (type === 'V') emit('L', [current[0], number() + (relative ? current[1] : 0)]);
      else if (type === 'C') { const a = point(relative); nextControl = point(relative); emit('C', a, nextControl, point(relative)); }
      else if (type === 'Q') { nextControl = point(relative); emit('Q', nextControl, point(relative)); }
      else if (type === 'S' || type === 'T') {
        const compatible = type === 'S' ? /[CS]/.test(previous) : /[QT]/.test(previous);
        const reflected = compatible && control ? current.map((v, j) => 2 * v - control[j]) : current;
        if (type === 'S') { nextControl = point(relative); emit('C', reflected, nextControl, point(relative)); }
        else { nextControl = reflected; emit('Q', reflected, point(relative)); }
      } else if (type === 'A') {
        const rx = number(), ry = number(), angle = number(), large = number(true), sweep = number(true), target = point(relative);
        commands.push(...arc(current, target, rx, ry, angle, large, sweep)); current = target;
      } else if (type === 'Z') { commands.push(['Z']); current = start; command = null; }
      else throw Error(`Unsupported SVG path command: ${type}.`);
      previous = type; control = nextControl;
    }
    return commands.map(([type, ...values]) => {
      if (!values.every(Number.isFinite)) throw Error('SVG arc coordinates exceed the supported range.');
      return type + values.join(' ');
    }).join('');
  }
  return {normalize};
})();
if (typeof module !== 'undefined') module.exports = LaserSvgPathInput;
