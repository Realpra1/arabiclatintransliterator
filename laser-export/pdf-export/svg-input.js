/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserSvgInput = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const units = {'': 1, px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16};
  const shapes = new Set(['line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);
  const allowed = new Set(['svg', 'g', 'defs', 'path', 'use', 'clipPath', 'mask', 'image', 'title', 'desc', 'metadata', ...shapes]);
  const presentation = new Set(['fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'display', 'visibility', 'color', 'clip-path', 'clip-rule', 'mask', 'mask-type', 'vector-effect', 'overflow']);
  const fail = detail => { throw Error(`SVG input: ${detail}`); };
  function length(value, fallback = 0) {
    if (value === null || value === undefined) return fallback;
    const match = value.trim().match(/^([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?)\s*(px|mm|cm|in|pt|pc)?$/);
    if (!match) fail(`unsupported length "${value}". Use absolute units instead of percentages or font-relative units.`);
    const number = Number(match[1]) * units[match[2] || ''];
    if (!Number.isFinite(number)) fail('non-finite length.');
    return number;
  }
  function numbers(value) {
    const token = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
    if (value.replace(token, '').replace(/[\s,]/g, '')) fail('invalid numeric list.');
    const result = (value.match(token) || []).map(Number);
    if (!result.every(Number.isFinite)) fail('non-finite coordinate.');
    return result;
  }
  function style(node) {
    if (!node.hasAttribute('style')) return;
    for (const part of node.getAttribute('style').split(';')) {
      if (!part.trim()) continue;
      const colon = part.indexOf(':'), name = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).trim().replace(/\s*!important\s*$/i, '');
      if (colon < 1 || !value || (!presentation.has(name) && !(node.localName === 'svg' && ['width', 'height'].includes(name)))) fail(`unsupported inline style "${name}".`);
      if (/\\|\/\*|var\(|calc\(/i.test(value)) fail('unsupported CSS expression.');
      node.setAttribute(name, value);
    }
    node.removeAttribute('style');
  }
  function shape(node) {
    const get = (key, fallback = 0) => length(node.getAttribute(key), fallback);
    let data;
    if (node.localName === 'line') data = `M${get('x1')} ${get('y1')}L${get('x2')} ${get('y2')}`;
    else if (['polygon', 'polyline'].includes(node.localName)) {
      const points = numbers(node.getAttribute('points') || '');
      if (points.length % 2) fail('an odd number of polygon/polyline coordinates.');
      data = points.length ? `M${points.slice(0, 2).join(' ')}${points.length > 2 ? 'L' + points.slice(2).join(' ') : ''}${node.localName === 'polygon' ? 'Z' : ''}` : '';
    } else if (node.localName === 'rect') {
      const x = get('x'), y = get('y'), w = get('width'), h = get('height');
      let rx = get('rx', get('ry')), ry = get('ry', rx);
      if ([w, h, rx, ry].some(v => v < 0)) fail('negative rectangle dimensions.');
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      data = !w || !h ? '' : !rx || !ry ? `M${x} ${y}h${w}v${h}h${-w}Z` :
        `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    } else {
      const x = get('cx'), y = get('cy'), rx = node.localName === 'circle' ? get('r') : get('rx'), ry = node.localName === 'circle' ? rx : get('ry');
      if (rx < 0 || ry < 0) fail('negative ellipse radius.');
      data = !rx || !ry ? '' : `M${x + rx} ${y}A${rx} ${ry} 0 1 1 ${x - rx} ${y}A${rx} ${ry} 0 1 1 ${x + rx} ${y}Z`;
    }
    const path = node.ownerDocument.createElementNS(NS, 'path');
    const geometry = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points']);
    for (const attribute of node.attributes) if (!geometry.has(attribute.localName)) path.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
    path.setAttribute('d', LaserSvgPathInput.normalize(data));
    if (node.localName === 'line') path.setAttribute('fill', 'none');
    node.replaceWith(path);
  }
  function prepare(source) {
    if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source)) fail('document types, entities and external stylesheets are unsupported.');
    const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (xml.querySelector('parsererror')) fail('invalid SVG XML.');
    const root = xml.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== NS) fail('the file must have an SVG root element.');
    // Authoring metadata has no rendered geometry and may contain RDF namespaces.
    for (const metadata of root.querySelectorAll('metadata')) metadata.remove();
    for (const node of root.querySelectorAll('*')) if (node.localName === 'namedview' && node.namespaceURI === 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd') node.remove();
    // Validate before producing any content for an image element or browser DOM.
    for (const node of [root, ...root.querySelectorAll('*')]) {
      if (['text', 'tspan', 'textPath'].includes(node.localName)) fail('convert text to paths in your drawing application before importing.');
      if (node.localName === 'style') fail('global CSS stylesheets are unsupported. Export presentation attributes or inline styles.');
      if (node.namespaceURI !== NS || !allowed.has(node.localName)) fail(`unsupported element "${node.localName}".`);
      if (node !== root && node.localName === 'svg') fail('nested SVG viewports are unsupported. Flatten the drawing first.');
      style(node);
      for (const attribute of node.attributes) {
        const name = attribute.localName.toLowerCase(), value = attribute.value.trim();
        if (presentation.has(name) && /^(inherit|initial|unset|revert|revert-layer)$/i.test(value)) fail('CSS inheritance keywords are unsupported. Use explicit presentation values.');
        if (name.startsWith('on') || ['base', 'src'].includes(name)) fail('scripts, event handlers and external resources are not allowed.');
        if (name === 'href') {
          const local = node.localName === 'use' && /^#[^\s]+$/.test(value);
          const raster = node.localName === 'image' && /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(value);
          if (!local && !raster) fail('only local use references and embedded raster images are allowed.');
        }
        if (/url\s*\(/i.test(value) && !/^url\(["']?#[^\s)"']+["']?\)$/.test(value)) fail('external or complex resource references are unsupported.');
        if (['filter', 'marker-start', 'marker-mid', 'marker-end'].includes(name) && value !== 'none') fail(`${name} effects are unsupported.`);
        if (node.localName === 'mask' && node.getAttribute('maskUnits') === 'userSpaceOnUse' && ['x', 'y', 'width', 'height'].includes(name) && value.includes('%')) fail('percentage mask bounds in user space are unsupported.');
        if (['fill', 'stroke'].includes(name) && /url\s*\(/i.test(value)) fail('gradient and pattern paint are unsupported.');
        if (['fill', 'stroke', 'color'].includes(name) && (/rgba\(|hsla\(|\//i.test(value) || /^#(?:[a-f0-9]{4}|[a-f0-9]{8})$/i.test(value))) fail('alpha colors are unsupported. Use separate fill-opacity or stroke-opacity attributes.');
        if (['fill', 'stroke'].includes(name) && value.toLowerCase() === 'transparent') node.setAttribute(attribute.name, 'none');
        if (['stroke-width', 'stroke-dasharray', 'stroke-dashoffset'].includes(name) && /%|(?:em|ex|rem)(?:\s|,|$)/i.test(value)) fail('relative stroke lengths are unsupported. Use absolute units.');
        if (['stroke-width', 'stroke-dashoffset'].includes(name)) node.setAttribute(attribute.name, String(length(value)));
        if (['opacity', 'fill-opacity', 'stroke-opacity'].includes(name)) {
          const amount = Number(value.endsWith('%') ? value.slice(0, -1) : value);
          if (!Number.isFinite(amount)) fail('invalid paint opacity.');
          node.setAttribute(attribute.name, String(value.endsWith('%') ? amount / 100 : amount));
        }
        if (name === 'transform') {
          if (node === root && value) fail('root transforms are unsupported. Move the transform onto a group.');
          const token = /(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([^()]*\)/g;
          if (value.replace(token, '').replace(/[\s,]/g, '')) fail('invalid SVG transform.');
          for (const part of value.match(token) || []) {
            const kind = part.slice(0, part.indexOf('(')).trim(), n = numbers(part.slice(part.indexOf('(') + 1, -1)).length;
            if (!(kind === 'matrix' ? n === 6 : kind === 'rotate' ? [1, 3].includes(n) : ['translate', 'scale'].includes(kind) ? [1, 2].includes(n) : n === 1)) fail('invalid SVG transform arguments.');
          }
        }
        if (name === 'vector-effect' && !['none', 'non-scaling-stroke'].includes(value)) fail('unsupported vector effect.');
      }
    }
    const box = root.hasAttribute('viewBox') ? numbers(root.getAttribute('viewBox')) : null;
    if (box && (box.length !== 4 || box[2] <= 0 || box[3] <= 0)) fail('viewBox must have positive width and height.');
    let width = length(root.getAttribute('width'), null), height = length(root.getAttribute('height'), null);
    if (width === null && height === null && box) { width = box[2]; height = box[3]; }
    if (width === null && box && height !== null) width = height * box[2] / box[3];
    if (height === null && box && width !== null) height = width * box[3] / box[2];
    if (!(width > 0 && height > 0)) fail('specify positive physical width and height, or a viewBox.');
    // CSS absolute units: 96 px = 1 in. Canonical output uses 72 points/in.
    // https://www.w3.org/TR/css-values-4/#absolute-lengths
    // https://www.w3.org/TR/SVG2/coords.html#ComputingAViewportsTransform
    const [x, y, w, h] = box || [0, 0, width, height];
    const aspect = (root.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
    const match = aspect.match(/^(none|x(Min|Mid|Max)Y(Min|Mid|Max))(?:\s+(meet|slice))?$/);
    if (!match) fail('unsupported preserveAspectRatio.');
    let sx = width / w, sy = height / h, tx = 0, ty = 0;
    if (match[1] !== 'none') {
      sx = sy = match[4] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
      const alignment = {Min: 0, Mid: .5, Max: 1};
      tx = (width - w * sx) * alignment[match[2]]; ty = (height - h * sy) * alignment[match[3]];
    }
    tx -= x * sx; ty -= y * sy;
    for (const node of [...root.querySelectorAll('*')]) {
      if (shapes.has(node.localName)) shape(node);
      else if (node.localName === 'path') node.setAttribute('d', LaserSvgPathInput.normalize(node.getAttribute('d') || ''));
      else if (['use', 'image'].includes(node.localName)) for (const key of ['x', 'y', 'width', 'height']) if (node.hasAttribute(key)) node.setAttribute(key, String(length(node.getAttribute(key))));
    }
    const ids = new Map();
    for (const node of [root, ...root.querySelectorAll('[id]')]) if (node.id) {
      if (ids.has(node.id)) fail(`duplicate object id "${node.id}".`);
      ids.set(node.id, node);
    }
    for (const use of root.querySelectorAll('use')) {
      const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      const target = ids.get(href?.slice(1));
      if (!target || !['g', 'path', 'image'].includes(target.localName)) fail('unresolved or unsupported use reference.');
    }
    const visited = new Set(), visiting = new Set();
    function references(node) {
      if (visiting.has(node)) fail('circular use references.');
      if (visited.has(node)) return;
      visiting.add(node);
      for (const child of node.children) references(child);
      if (node.localName === 'use') references(ids.get((node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).slice(1)));
      visiting.delete(node); visited.add(node);
    }
    references(root);
    const group = xml.createElementNS(NS, 'g');
    for (const key of presentation) if (root.hasAttribute(key)) { group.setAttribute(key, root.getAttribute(key)); root.removeAttribute(key); }
    group.setAttribute('transform', `matrix(${sx * .75} 0 0 ${sy * .75} ${tx * .75} ${ty * .75})`);
    while (root.firstChild) group.append(root.firstChild);
    root.append(group);
    root.setAttribute('width', String(width * 25.4 / 96) + 'mm');
    root.setAttribute('height', String(height * 25.4 / 96) + 'mm');
    root.setAttribute('viewBox', `0 0 ${width * .75} ${height * .75}`);
    root.setAttribute('preserveAspectRatio', 'none');
    return new XMLSerializer().serializeToString(root);
  }
  return {prepare};
})();
