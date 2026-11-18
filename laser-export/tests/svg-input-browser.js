/* Browser tests: load svg-path-input.js and svg-input.js, then evaluate this function.
   Unit and viewport expectations follow SVG 2 section 8.2 and CSS Values 4 absolute lengths.
   ViewBox-only inputs use their width/height as CSS pixels; ambiguous percentage sizes fail. */
async () => {
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const near = (a, b, message) => assert(Math.abs(a - b) < 1e-8, `${message}: ${a} != ${b}`);
  const reports = [];
  const source = (body, attrs = 'width="96" height="96"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
  const parse = text => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  const prepare = (body, attrs) => parse(LaserSvgInput.prepare(source(body, attrs)));
  const size = root => root.getAttribute('viewBox').split(' ').map(Number).slice(2);
  const matrix = root => {
    const m = root.firstElementChild.getAttribute('transform').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g).map(Number);
    return new DOMMatrix(m);
  };
  for (const [unit, value] of [['mm', 25.4], ['cm', 2.54], ['in', 1], ['pt', 72], ['pc', 6], ['px', 96], ['', 96]]) {
    const root = prepare('<path d="M0 0L96 96"/>', `width="${value}${unit}" height="${value}${unit}"`);
    size(root).forEach(n => near(n, 72, unit + ' page points'));
    near(parseFloat(root.getAttribute('width')), 25.4, unit + ' mm');
    near(matrix(root).a, .75, unit + ' user scale');
  }
  reports.push('seven absolute-unit variants');
  {
    const root = prepare('<path d="M10 20L110 120"/>', 'width="200" height="100" viewBox="10 20 100 100"');
    const m = matrix(root), a = m.transformPoint({x: 10, y: 20}), b = m.transformPoint({x: 110, y: 120});
    near(a.x, 37.5, 'meet alignment'); near(a.y, 0, 'meet y'); near(b.x, 112.5, 'meet x endpoint'); near(b.y, 75, 'meet y endpoint');
    const none = matrix(prepare('', 'width="200" height="100" viewBox="10 20 100 100" preserveAspectRatio="none"'));
    near(none.a, 1.5, 'none x'); near(none.d, .75, 'none y');
    const slice = matrix(prepare('', 'width="200" height="100" viewBox="10 20 100 100" preserveAspectRatio="xMaxYMax slice"'));
    near(slice.a, 1.5, 'slice scale'); near(slice.f, -105, 'slice alignment');
    near(size(prepare('', 'viewBox="10 20 96 48"'))[1], 36, 'viewBox-only height');
  }
  reports.push('nonzero viewBox, meet, none, slice and intrinsic ratio');
  {
    const root = prepare('<defs><circle id="dot" r="3"/></defs><g data-laser-images="1"><use href="#dot" x="1mm"/><line x1="1" y1="2" x2="3" y2="4" data-laser-power="0.5" style="stroke: black; stroke-width: 2; fill: red !important"/></g><rect x="3" y="7" width="20" height="10" rx="3"/><polyline points="1,2 3,4 5,6"/><polygon points="1,2 3,4 5,6"/><ellipse cx="5" cy="6" rx="4" ry="2"/>');
    assert(!root.querySelector('circle,ellipse,line,rect,polygon,polyline,[style]'), 'Unconverted shape/style');
    assert(root.querySelector('use').getAttribute('href') === '#dot', 'use lost');
    near(Number(root.querySelector('use').getAttribute('x')), 96 / 25.4, 'use physical position');
    const line = root.querySelector('[data-laser-power]');
    assert(line.getAttribute('data-laser-power') === '0.5' && line.getAttribute('fill') === 'none', 'Power or line semantics changed');
    assert(line.getAttribute('stroke') === 'black', 'Inline stroke lost');
    assert(root.querySelector('[data-laser-images]'), 'Image marker lost');
    assert(root.querySelector('#dot').getAttribute('d').endsWith('Z'), 'Circle not closed');
  }
  reports.push('shapes, rounded corners, defs/use, inline paint, power metadata');
  {
    const normalize = LaserSvgPathInput.normalize;
    const d = normalize('m10 10 a10 5 30 0 1 20 10 s5 5 10 0 q5 5 10 0 t10 0z');
    assert(!/[aAbBshvqt]/.test(d), 'Noncanonical commands remain');
    assert(d.includes('C30 20 35 25 40 20'), 'Smooth control after arc must not reflect generated cubic');
    assert(normalize('M0 0A0 2 0 0 1 3 4') === 'M0 0L3 4', 'Zero radius arc must be a line');
    assert(normalize('M0 0A2 2 0 0 1 0 0') === 'M0 0', 'Coincident arc must be omitted');
    assert(normalize('M0 0A5 5 0 0110 0').endsWith('10 0'), 'Adjacent arc flags');
    assert(normalize('M0 0A1 1 0 0 1 10 0').split('C').length === 5, 'Radii correction/45-degree slices');
    const circular = normalize('M10 0A10 10 0 0 1 0 10');
    let current = [10, 0], maximumRadialError = 0;
    for (const command of circular.match(/C[^C]+/g)) {
      const v = command.slice(1).trim().split(/\s+/).map(Number);
      const points = [current, v.slice(0, 2), v.slice(2, 4), v.slice(4, 6)];
      for (let i = 0; i <= 100; i++) {
        const t = i / 100, u = 1 - t;
        const p = [0, 1].map(j => u ** 3 * points[0][j] + 3 * u * u * t * points[1][j] + 3 * u * t * t * points[2][j] + t ** 3 * points[3][j]);
        maximumRadialError = Math.max(maximumRadialError, Math.abs(Math.hypot(...p) - 10));
      }
      current = points[3];
    }
    assert(maximumRadialError < .000043, `Arc approximation error ${maximumRadialError}`);
    reports.push({test: 'independent circle equation', maximumRadialError});
  }
  reports.push('relative arcs, radii correction, compact flags, smooth-control reset');
  async function raster(text) {
    const url = URL.createObjectURL(new Blob([text], {type: 'image/svg+xml'}));
    try {
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 400, 200);
      return ctx.getImageData(0, 0, 400, 200).data;
    } finally { URL.revokeObjectURL(url); }
  }
  {
    const original = source('<g fill="none" stroke="black" stroke-width="1"><rect x="-5" y="0" width="90" height="30" rx="4"/><ellipse cx="40" cy="20" rx="15" ry="7"/><path d="M0 15A12 7 33 1 0 40 20S55 35 70 15"/></g>', 'width="200" height="100" viewBox="-10 -5 100 50" preserveAspectRatio="xMidYMid meet"');
    const a = await raster(original), b = await raster(LaserSvgInput.prepare(original));
    let difference = 0;
    for (let i = 3; i < a.length; i += 4) difference += Math.abs(a[i] - b[i]);
    assert(difference / 255 < 200, `Rendered geometry changed: ${difference / 255} pixels`);
    for (const [first, second] of [[a, b], [b, a]]) for (let y = 1; y < 199; y++) for (let x = 1; x < 399; x++) {
      if (first[(y * 400 + x) * 4 + 3] < 128) continue;
      let found = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) found ||= second[((y + dy) * 400 + x + dx) * 4 + 3] >= 128;
      assert(found, 'A rendered boundary moved by more than one pixel');
    }
    reports.push({test: 'independent browser render comparison', changedPixelEquivalent: difference / 255});
  }
  const reject = (body, expected, attrs) => {
    let error;
    try { LaserSvgInput.prepare(source(body, attrs)); } catch (e) { error = e.message; }
    assert(error && error.includes(expected), `Expected ${expected}, got ${error}`);
  };
  reject('<text>Hello</text>', 'convert text to paths');
  reject('<script>alert(1)</script>', 'unsupported element');
  reject('<path onload="alert(1)" d="M0 0L1 1"/>', 'event handlers');
  reject('<image href="https://example.com/image.png"/>', 'embedded raster');
  reject('<image href="data:image/svg+xml;base64,PHN2Zy8+"/>', 'embedded raster');
  reject('<use href="external.svg#shape"/>', 'local use');
  reject('<style>path{stroke:red}</style>', 'global CSS');
  reject('<svg/>', 'nested SVG');
  reject('<foreignObject/>', 'unsupported element');
  reject('<path style="filter:blur(2px)"/>', 'inline style');
  reject('<path fill="url(https://example.com/x)"/>', 'resource references');
  reject('<path filter="url(#filter)"/>', 'filter effects');
  reject('<path d="M0 0A5 5 0 2 0 3 3"/>', 'invalid SVG path');
  reject('<path d="M0 0LInfinity 1"/>', 'invalid SVG path');
  reject('<defs><g id="a"><use href="#a"/></g></defs>', 'circular');
  reject('<path id="a"/><path id="a"/>', 'duplicate');
  reject('', 'unsupported length', 'width="100%" height="20"');
  reports.push('17 explicit rejection cases; no DOM insertion or external resource loads');
  {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    canvas.getContext('2d').fillRect(0, 0, 1, 1);
    const png = canvas.toDataURL();
    const root = prepare(`<defs><mask id="bitmap-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="20" height="20"><image href="${png}" width="20" height="20"/></mask></defs><image href="${png}" width="20" height="20" mask="url(#bitmap-mask)"/>`);
    assert(root.querySelector('mask image') && root.querySelector('image[mask]'), 'Embedded raster mask was lost');
    reports.push('local bitmap masks preserved for image compositing');
  }
  {
    const root = parse(LaserSvgInput.prepare('<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" width="96" height="96"><metadata><rdf:RDF/></metadata><sodipodi:namedview><sodipodi:guide/></sodipodi:namedview><path d="M1 2L3 4"/></svg>'));
    assert(root.querySelectorAll('path').length === 1 && !root.querySelector('metadata,namedview'), 'Authoring metadata survived');
    reports.push('Inkscape namedview and RDF metadata discarded');
  }
  return reports;
}
