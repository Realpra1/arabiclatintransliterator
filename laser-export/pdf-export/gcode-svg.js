/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserGcodeSvg = (() => {
  const XLINK = 'http://www.w3.org/1999/xlink';
  const ignored = new Set(['defs', 'desc', 'title', 'metadata']);
  const unsupported = detail => Error(`Direct G-code cannot convert ${detail}. Download SVG instead.`);
  function localMatrix(node, parent) {
    let matrix = parent;
    if (node.transform?.baseVal) for (let i = 0; i < node.transform.baseVal.numberOfItems; i++) matrix = matrix.multiply(node.transform.baseVal.getItem(i).matrix);
    return matrix;
  }
  const point = (p, matrix) => [matrix.a * p[0] + matrix.c * p[1] + matrix.e, matrix.b * p[0] + matrix.d * p[1] + matrix.f];
  function path(node, close) {
    if (node.localName === 'path') return LaserGeometry.parsePath(node.getAttribute('d') || '', close);
    if (node.localName === 'rect') {
      if (Number(node.getAttribute('rx')) || Number(node.getAttribute('ry'))) throw unsupported('rounded rectangles');
      const x = Number(node.getAttribute('x')), y = Number(node.getAttribute('y'));
      const w = Number(node.getAttribute('width')), h = Number(node.getAttribute('height'));
      return LaserGeometry.parsePath(`M${x} ${y}h${w}v${h}h${-w}Z`);
    }
    throw unsupported(`SVG ${node.localName} objects`);
  }
  async function convert(content, options, progress = () => {}) {
    const output = LaserGcode.writer(options);
    const xml = new DOMParser().parseFromString(content, 'image/svg+xml');
    if (xml.querySelector('parsererror')) throw Error('Invalid SVG for G-code conversion.');
    const root = xml.documentElement;
    const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw Error('Missing page dimensions for G-code.');
    const [left, top, width, height] = box, scale = 25.4 / 72;
    const matrix = new DOMMatrix([scale, 0, 0, -scale, -left * scale, (top + height) * scale]);
    const pageClip = [[0, 0], [width * scale, 0], [width * scale, height * scale], [0, height * scale]];
    const ids = new Map([...root.querySelectorAll('[id]')].map(n => [n.id, n]));
    let processed = 0;
    function clipPolygon(reference, parent) {
      const id = reference.match(/^url\(["']?#([^\s)"']+)["']?\)$/)?.[1], node = ids.get(id);
      if (!node || node.localName !== 'clipPath' || node.children.length !== 1 ||
          (node.getAttribute('clipPathUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') throw unsupported('this vector clipping shape');
      const child = node.firstElementChild;
      if (child.hasAttribute('clip-path') || child.hasAttribute('style') || node.hasAttribute('clip-path')) throw unsupported('nested vector clipping definitions');
      const transform = localMatrix(child, localMatrix(node, parent)), segments = path(child, true);
      if (segments.length < 3 || segments.some(s => s.cmd !== 'L')) throw unsupported('curved vector clipping shapes');
      const polygon = segments.map(s => point(s.points[0], transform));
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].points.at(-1).some((v, j) => v !== segments[(i + 1) % segments.length].points[0][j])) throw unsupported('multipart vector clipping shapes');
      }
      let sign = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], c = polygon[(i + 2) % polygon.length];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) < 1e-10) continue;
        if (sign && Math.sign(cross) !== sign) throw unsupported('concave vector clipping shapes');
        sign = Math.sign(cross);
      }
      // Same local turn direction alone also accepts self-intersecting stars.
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        if (polygon.some(p => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < -1e-10)) throw unsupported('self-intersecting vector clipping shapes');
      }
      return polygon;
    }
    async function visit(node, parent, inherited, clips, stack = new Set()) {
      if (ignored.has(node.localName)) return;
      if (node.getAttribute('display') === 'none') return;
      const opacity = Number(node.getAttribute('opacity') ?? 1);
      if (opacity <= 0) return;
      if (!Number.isFinite(opacity) || opacity < 1) throw unsupported('partially transparent vector artwork');
      if (node.hasAttribute('style')) throw unsupported('inline SVG styles');
      for (const effect of ['mask', 'filter']) if (node.hasAttribute(effect) && node.getAttribute(effect) !== 'none') throw unsupported(`vector ${effect}s`);
      const paint = {...inherited};
      for (const key of ['fill', 'stroke', 'stroke-dasharray', 'fill-opacity', 'stroke-opacity', 'visibility']) if (node.hasAttribute(key)) paint[key] = node.getAttribute(key);
      const transform = localMatrix(node, parent);
      const reference = node.getAttribute('clip-path');
      if (reference && reference !== 'none') clips = [...clips, clipPolygon(reference, transform)];
      if (node.localName === 'use') {
        const href = node.getAttribute('href') || node.getAttributeNS(XLINK, 'href');
        const target = href?.startsWith('#') && ids.get(href.slice(1));
        if (!target || stack.has(href)) throw Error('Unresolved or circular SVG reference in G-code.');
        await visit(target, transform.translate(Number(node.getAttribute('x')), Number(node.getAttribute('y'))), paint, clips, new Set([...stack, href]));
      } else if (['svg', 'g', 'a'].includes(node.localName)) {
        if (node !== root && node.localName === 'svg') throw unsupported('nested SVG viewports');
        for (const child of node.children) await visit(child, transform, paint, clips, stack);
      } else {
        if (['hidden', 'collapse'].includes(paint.visibility)) return;
        const fillVisible = paint.fill !== 'none' && Number(paint['fill-opacity']) > 0;
        const strokeVisible = paint.stroke !== 'none' && Number(paint['stroke-opacity']) > 0;
        if (!fillVisible && !strokeVisible) return;
        if ((fillVisible && Number(paint['fill-opacity']) < 1) || (strokeVisible && Number(paint['stroke-opacity']) < 1)) throw unsupported('partially transparent vector artwork');
        if (paint['stroke-dasharray'] !== 'none' && paint['stroke-dasharray'].split(/[\s,]+/).some(n => Number(n) !== 0)) throw unsupported('dashed vector paths');
        const segments = path(node, fillVisible);
        const power = Number(node.getAttribute('data-laser-power') ?? 1);
        for (const segment of segments) {
          LaserGcode.flatten(segment.points.map(p => point(p, transform)), (a, b) => {
            let piece = [a, b];
            for (const polygon of clips) { piece = LaserGcode.clip(...piece, polygon); if (!piece) return; }
            output.line(...piece, power);
          });
          if (++processed % 2048 === 0) {
            progress(`Preparing G-code… ${processed.toLocaleString()} strokes`);
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }
    }
    await visit(root, matrix, {fill: 'black', stroke: 'none', 'stroke-dasharray': 'none', 'fill-opacity': '1', 'stroke-opacity': '1', visibility: 'visible'}, [pageClip]);
    return output.finish();
  }
  return {convert};
})();
