/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserOutput = (() => {
  function mirror(source, enabled) {
    if (!enabled) return source;
    const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (xml.querySelector('parsererror')) throw Error('Invalid SVG while mirroring the page.');
    const root = xml.documentElement;
    const box = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw Error('Missing dimensions for page mirroring.');
    const group = xml.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('transform', `matrix(-1 0 0 1 ${2 * box[0] + box[2]} 0)`);
    group.setAttribute('data-laser-mirror', 'horizontal');
    for (const child of [...root.children]) if (!['defs', 'title', 'desc', 'metadata'].includes(child.localName)) group.append(child);
    root.append(group);
    return new XMLSerializer().serializeToString(root);
  }
  return {mirror};
})();
