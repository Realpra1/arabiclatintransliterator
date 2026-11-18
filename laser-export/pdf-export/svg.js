/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserSvg = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const XLINK = 'http://www.w3.org/1999/xlink';
  function prepare(source, singleStroke) {
    const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (xml.querySelector('parsererror')) throw Error('The PDF engine returned invalid SVG.');
    const root = xml.documentElement;
    const bounds = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!bounds || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= 0 || bounds[3] <= 0) throw Error('SVG page dimensions are missing.');
    // PDF points are 1/72 inch. Explicit mm avoids importers treating bare
    // SVG width numbers as CSS pixels (which would shrink the page by 25%).
    root.setAttribute('width', (bounds[2] * 25.4 / 72) + 'mm');
    root.setAttribute('height', (bounds[3] * 25.4 / 72) + 'mm');
    const stats = {source: 0, normalized: 0, kept: 0, removed: 0, paths: 0, limited: 0, images: 0, clipped: 0, dashed: 0};
    if (singleStroke) {
      const ids = new Map([...xml.querySelectorAll('[id]')].map(n => [n.id, n]));
      const cache = new Map();
      function expand(node, ancestors = new Set(), parentMatrix = new DOMMatrix(), parentFill = 'black', parentDash = 'none') {
        if (node.localName === 'defs') return;
        if (node.localName === 'use') {
          const ref = node.getAttribute('href') || node.getAttributeNS(XLINK, 'href');
          if (!ref?.startsWith('#') || !ids.has(ref.slice(1))) throw Error('Cannot resolve an SVG object reference.');
          if (ancestors.has(ref)) throw Error('Circular SVG object reference.');
          const next = new Set(ancestors); next.add(ref);
          const group = xml.createElementNS(NS, 'g');
          for (const attribute of node.attributes) {
            if (!['href', 'x', 'y', 'id'].includes(attribute.localName)) group.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
          }
          const translation = `translate(${node.getAttribute('x') || 0} ${node.getAttribute('y') || 0})`;
          group.setAttribute('transform', (group.getAttribute('transform') || '') + ' ' + translation);
          const copy = ids.get(ref.slice(1)).cloneNode(true);
          copy.removeAttribute('id');
          group._laserGlyph = node.hasAttribute('data-text') && copy.localName === 'path';
          group.append(copy); node.replaceWith(group);
          expand(group, next, parentMatrix, parentFill, parentDash); return;
        }
        const fill = node.getAttribute('fill') ?? parentFill;
        const dash = node.getAttribute('stroke-dasharray') ?? parentDash;
        let matrix = parentMatrix;
        if (node.transform?.baseVal) for (const item of Array.from({length: node.transform.baseVal.numberOfItems}, (_, i) => node.transform.baseVal.getItem(i))) matrix = matrix.multiply(item.matrix);
        if (node.localName === 'image') stats.images++;
        if (node.hasAttribute('clip-path') || node.hasAttribute('mask')) stats.clipped++;
        if (node.localName === 'path') {
          const data = node.getAttribute('d') || '';
          // Reopening one of our exported SVGs must retain image power and
          // its gray display color. These paths already describe single passes.
          if (node.hasAttribute('data-laser-power') && node.closest('[data-laser-images]')) {
            stats.kept += LaserGeometry.parsePath(data).length;
            return;
          }
          const dashed = dash !== 'none' && dash.trim().split(/[\s,]+/).some(n => Number(n) !== 0);
          if (dashed) {
            // Reordering/subdivision changes dash phase. Keep the original
            // path and its paint intact instead of manufacturing new marks.
            stats.dashed++;
            node._keepDashed = true;
            stats.kept += LaserGeometry.parsePath(data).length;
            return;
          }
          const closeOpen = fill !== 'none';
          const key = closeOpen + ':' + data;
          let result = cache.get(key);
          if (!result) { result = LaserGeometry.simplify(data, closeOpen); cache.set(key, result); }
          node.setAttribute('d', result.data);
          node.setAttribute('fill', 'none');
          node.setAttribute('stroke', '#000000');
          // A 0.1-point pen in page coordinates, even inside a glyph's em-space
          // transform. Works in SVG consumers that ignore vector-effect.
          const sum = matrix.a ** 2 + matrix.b ** 2 + matrix.c ** 2 + matrix.d ** 2;
          const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
          const scale = Math.sqrt((sum + Math.sqrt(Math.max(0, sum ** 2 - 4 * determinant ** 2))) / 2);
          node.setAttribute('stroke-width', String(scale > 0 ? 0.1 / scale : 0.1));
          node.setAttribute('stroke-linecap', 'round');
          node.setAttribute('stroke-linejoin', 'round');
          for (const key of ['source', 'normalized', 'kept', 'removed']) stats[key] += result[key];
          stats.paths++; stats.limited += Number(result.limited);
        }
        for (const child of [...node.children]) expand(child, ancestors, matrix, fill, dash);
      }
      expand(root);
      // Combine adjacent paths only when their complete presentation/transform
      // attributes agree. No movement across clips, masks, images or groups.
      function mergeAdjacent(parent) {
        if (parent.localName === 'defs') return;
        for (const child of [...parent.children]) mergeAdjacent(child);
        const signature = node => JSON.stringify([...node.attributes].filter(a => !['d', 'id'].includes(a.name)).map(a => [a.name, a.value]).sort());
        let run = [];
        function flush() {
          if (run.length > 1) {
            const merged = LaserGeometry.simplify(run.map(p => p.getAttribute('d')).join(' '));
            run[0].setAttribute('d', merged.data);
            stats.removed += merged.removed;
            stats.limited += Number(merged.limited);
            for (const node of run.slice(1)) node.remove();
          }
          run = [];
        }
        for (const child of [...parent.children]) {
          if (child.localName !== 'path' || child._keepDashed) { flush(); continue; }
          if (run.length && signature(child) !== signature(run[0])) flush();
          run.push(child);
        }
        flush();
      }
      // Stats are recomputed from final paths after merging to count splits.
      mergeAdjacent(root);
      // PDF synthetic bold can emit separate fill-text and stroke-text objects.
      // After both become the same thin outline, remove the second glyph object.
      // Only compare sibling glyphs with identical geometry, placement and final
      // paint. Keep separate clip contexts and stop at intervening artwork.
      function removeDuplicateGlyphs(parent, blocked = false) {
        if (parent.localName === 'defs') return;
        const hasEffects = node => ['style', 'filter', 'mask', 'display', 'visibility'].some(a => node.hasAttribute(a)) ||
          ['opacity', 'stroke-opacity', 'fill-opacity'].some(a => node.hasAttribute(a) && Number(node.getAttribute(a)) !== 1);
        blocked ||= hasEffects(parent);
        const overwritten = new Set(['id', 'fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit']);
        const attributes = (node, ignored) => [...node.attributes].filter(a => !ignored.has(a.name)).map(a => [a.name, a.value]).sort();
        const seen = new Set();
        for (const child of [...parent.children]) {
          removeDuplicateGlyphs(child, blocked);
          const path = child.children.length === 1 ? child.firstElementChild : null;
          if (blocked || !child._laserGlyph || !path || path.localName !== 'path' || path._keepDashed ||
              hasEffects(child) || hasEffects(path) || child.hasAttribute('clip-path') || path.hasAttribute('clip-path')) {
            seen.clear(); continue;
          }
          if (!path.getAttribute('d')) continue;
          const key = JSON.stringify([attributes(child, overwritten), attributes(path, new Set(['id']))]);
          if (seen.has(key)) {
            stats.removed += LaserGeometry.parsePath(path.getAttribute('d')).length;
            child.remove();
          } else seen.add(key);
        }
      }
      removeDuplicateGlyphs(root);
      stats.kept = [...root.querySelectorAll('path')].filter(n => !n.closest('defs')).reduce((n, p) => n + LaserGeometry.parsePath(p.getAttribute('d')).length, 0);
      // normalized includes line subdivisions introduced by merging as well.
      stats.normalized = stats.kept + stats.removed;
      // Resolved glyphs no longer need the original double-traced definitions.
      // Keep any path still referenced by a clipping definition or other object.
      const references = new Set();
      for (const element of root.querySelectorAll('*')) for (const attribute of element.attributes) {
        for (const match of attribute.value.matchAll(/#([A-Za-z_][\w.-]*)/g)) references.add(match[1]);
      }
      for (const path of root.querySelectorAll('defs > path[id]')) if (!references.has(path.id)) path.remove();
      const description = xml.createElementNS(NS, 'desc');
      description.textContent = 'Vector boundaries with repeated segments and identical overlapping glyph objects removed. No centerline tracing. Curves and page scale retained.';
      root.prepend(description);
    }
    return {content: new XMLSerializer().serializeToString(root), stats, widthMm: bounds[2] * 25.4 / 72, heightMm: bounds[3] * 25.4 / 72};
  }
  return {prepare};
})();
