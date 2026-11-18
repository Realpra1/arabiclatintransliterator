/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserImages = (() => {
  const NS = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';
  const PITCH_MM = 0.1, MAX_PIXELS = 24000000, MAX_SPANS = 2000000;
  const definition = node => node.closest('defs, mask, clipPath, pattern, symbol, filter');
  const references = node => [...node.attributes].flatMap(a => {
    const refs = [...a.value.matchAll(/url\(["']?#([^\s)"']+)["']?\)/g)].map(m => m[1]);
    if (a.localName === 'href' && a.value.startsWith('#')) refs.push(a.value.slice(1));
    return refs;
  });

  function expandImageUses(root) {
    const ids = new Map([...root.querySelectorAll('[id]')].map(n => [n.id, n]));
    function expand(node, stack = new Set()) {
      if (definition(node)) return;
      if (node.localName === 'use') {
        const href = node.getAttribute('href') || node.getAttributeNS(XLINK, 'href');
        const target = ids.get(href?.slice(1));
        if (!target || (target.localName !== 'image' && !target.querySelector('image'))) return;
        if (stack.has(href)) throw Error('Circular SVG image reference.');
        const group = node.ownerDocument.createElementNS(NS, 'g');
        for (const a of node.attributes) if (!['href', 'id', 'x', 'y'].includes(a.localName)) group.setAttributeNS(a.namespaceURI, a.name, a.value);
        group.setAttribute('transform', (group.getAttribute('transform') || '') + ` translate(${node.getAttribute('x') || 0} ${node.getAttribute('y') || 0})`);
        const copy = target.cloneNode(true); copy.removeAttribute('id');
        group.append(copy); node.replaceWith(group);
        expand(group, new Set([...stack, href])); return;
      }
      for (const child of [...node.children]) expand(child, stack);
    }
    expand(root);
  }

  function imageLayer(root) {
    const copy = root.cloneNode(true);
    function keep(node) {
      if (node.localName === 'defs' || node.localName === 'image') return true;
      if (!['svg', 'g', 'a'].includes(node.localName)) return false;
      for (const child of [...node.children]) if (!keep(child)) child.remove();
      return node.localName === 'svg' || node.children.length > 0;
    }
    keep(copy);
    return copy;
  }

  function pruneDefinitions(root) {
    const ids = new Map([...root.querySelectorAll('[id]')].map(n => [n.id, n])), live = new Set();
    const pending = [...root.querySelectorAll('*')].filter(n => !definition(n)).flatMap(references);
    while (pending.length) {
      const id = pending.pop();
      if (live.has(id)) continue;
      live.add(id);
      const node = ids.get(id);
      if (node) for (const n of [node, ...node.querySelectorAll('*')]) pending.push(...references(n));
    }
    for (const node of root.querySelectorAll('defs > [id]')) if (!live.has(node.id)) node.remove();
    for (const node of root.querySelectorAll('defs')) if (!node.children.length) node.remove();
  }

  async function convert(content, progress = () => {}, options = {}) {
    const fill = options.fill || 'rows';
    if (!['rows', 'regions'].includes(fill)) throw Error('Choose a supported image fill method.');
    const shading = options.shading || 'dither';
    if (!['dither', 'power'].includes(shading)) throw Error('Choose a supported picture shading method.');
    const xml = new DOMParser().parseFromString(content, 'image/svg+xml');
    if (xml.querySelector('parsererror')) throw Error('Invalid SVG while converting pictures.');
    const root = xml.documentElement;
    expandImageUses(root);
    const images = [...root.querySelectorAll('image')].filter(n => !definition(n));
    const stats = {images: images.length, spans: 0, darkPixels: 0, rows: 0, pitchMm: PITCH_MM};
    if (!images.length) return {content, stats};
    for (const img of images) {
      const href = img.getAttribute('href') || img.getAttributeNS(XLINK, 'href') || '';
      if (!href.startsWith('data:image/')) throw Error('A picture is not embedded in this PDF export.');
    }
    const box = root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    const [left, top, pageWidth, pageHeight] = box;
    const width = Math.ceil(pageWidth * 25.4 / 72 / PITCH_MM), height = Math.ceil(pageHeight * 25.4 / 72 / PITCH_MM);
    if (!box.every(Number.isFinite) || width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > MAX_PIXELS) {
      throw Error('This page is too large for picture conversion at 0.1 mm spacing. Export a smaller page.');
    }
    const layer = imageLayer(root);
    layer.setAttribute('width', String(width)); layer.setAttribute('height', String(height));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(layer)], {type: 'image/svg+xml'}));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    try {
      progress('Rendering pictures…');
      const image = new Image(); image.src = url;
      await image.decode();
      const context = canvas.getContext('2d', {willReadFrequently: true});
      if (!context) throw Error('The browser could not allocate a picture canvas.');
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const group = xml.createElementNS(NS, 'g');
      group.setAttribute('data-laser-images', String(images.length));
      group.setAttribute('data-image-pitch-mm', String(PITCH_MM));
      group.setAttribute('fill', 'none'); group.setAttribute('stroke', '#000000');
      const dx = pageWidth / width, dy = pageHeight / height;
      group.setAttribute('stroke-width', String(dy)); group.setAttribute('stroke-linecap', 'butt');
      let commands = [], batch = 0, batchPower = 1;
      const number = v => String(Number(v.toFixed(6)));
      function flush() {
        if (!commands.length) return;
        const path = xml.createElementNS(NS, 'path');
        // Explicit open subpaths: no outlines, closing edges or reverse strokes.
        path.setAttribute('d', commands.join(''));
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#000000');
        if (shading === 'power') {
          path.setAttribute('data-laser-power', String(batchPower));
          const gray = Math.round(255 * (1 - batchPower));
          path.setAttribute('stroke', `rgb(${gray},${gray},${gray})`);
        }
        group.append(path); commands = []; batch = 0;
      }
      const spans = [];
      for (const row of LaserRaster.rows(pixels, width, height, shading)) {
        for (const [start, end, power = 1] of row.spans) {
          spans.push([row.y, start, end, power]);
          stats.spans++;
          if (stats.spans > MAX_SPANS) throw Error('These pictures produce too many engraving lines. Use a smaller page or simpler pictures.');
        }
        stats.darkPixels += row.darkPixels; stats.rows += Number(row.spans.length > 0);
        if (row.y % 128 === 0) {
          progress(`Converting pictures to lines… ${Math.round(row.y / height * 100)}%`);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      let ordered = spans;
      if (fill === 'regions') {
        progress('Grouping connected picture areas…');
        await new Promise(resolve => setTimeout(resolve, 0));
        const result = LaserRegions.order(spans);
        ordered = result.spans; stats.regions = result.regions;
        // Grid pixels are nearly square; use physical coordinates for the report.
        const travelMm = lines => {
          let distance = 0;
          for (let i = 1; i < lines.length; i++) distance += Math.hypot((lines[i][1] - lines[i - 1][2]) * dx, (lines[i][0] - lines[i - 1][0]) * dy) * 25.4 / 72;
          return distance;
        };
        stats.travelBeforeMm = travelMm(spans); stats.travelAfterMm = travelMm(ordered);
      }
      group.setAttribute('data-image-fill', fill);
      group.setAttribute('data-image-shading', shading);
      for (const [row, start, end, power] of ordered) {
        if (power !== batchPower) { flush(); batchPower = power; }
        const y = number(top + (row + 0.5) * dy);
        commands.push(`M${number(left + start * dx)} ${y}L${number(left + end * dx)} ${y}`);
        if (++batch >= 4096) flush();
      }
      flush();
      for (const image of images) {
        let parent = image.parentElement; image.remove();
        while (parent !== root && parent?.localName === 'g' && !parent.children.length) {
          const next = parent.parentElement; parent.remove(); parent = next;
        }
      }
      if (stats.spans) root.append(group);
      pruneDefinitions(root);
      return {content: new XMLSerializer().serializeToString(root), stats};
    } finally { URL.revokeObjectURL(url); canvas.width = canvas.height = 0; }
  }
  return {convert};
})();
