/* Browser regressions for actual canvas compositing and exported engraving geometry. */
async () => {
  const check = (value, message) => { if (!value) throw Error(message); };
  const reports = [];
  function png(r = 0, alpha = 255) {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray([r, r, r, alpha]), 1, 1), 0, 0);
    return c.toDataURL();
  }
  const black = png(), white = png(255);
  const img = (href, attrs = '') => `<image href="${href}" preserveAspectRatio="none" ${attrs}/>`;
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">${body}</svg>`;
  async function convert(body) {
    const result = await LaserImages.convert(svg(body));
    const root = new DOMParser().parseFromString(result.content, 'image/svg+xml').documentElement;
    check(!root.querySelector('image'), 'Converted image or unused bitmap definition remains');
    const group = root.querySelector('[data-laser-images]');
    const lines = group ? [...group.querySelectorAll('path')].flatMap(p => LaserGeometry.parsePath(p.getAttribute('d'))) : [];
    for (const line of lines) {
      check(line.cmd === 'L', 'Image must be an open straight segment');
      check(line.points[0][1] === line.points[1][1], 'Scan line is not horizontal');
      check(line.points[0][0] !== line.points[1][0], 'Zero-length dot');
    }
    const keys = lines.map(l => JSON.stringify([...l.points].sort((a, b) => a[0] - b[0])));
    check(new Set(keys).size === keys.length, 'Duplicate/reverse scan line');
    check(lines.length === result.stats.spans, 'Reported line count differs from geometry');
    const area = lines.reduce((n, l) => n + Math.abs(l.points[1][0] - l.points[0][0]), 0) * Number(group?.getAttribute('stroke-width') || 0);
    return {root, lines, area, stats: result.stats};
  }
  function inside(lines, x0, y0, x1, y1) {
    for (const l of lines) for (const [x, y] of l.points) check(x >= x0 - .3 && x <= x1 + .3 && y >= y0 - .3 && y <= y1 + .3, 'Geometry escaped picture/clip bounds');
  }
  {
    const path = '<path id="text-shape" fill="none" stroke="black" d="M2 2C3 8 9 8 10 2"/>';
    const result = await convert(path + img(black, 'x="10" y="20" width="16" height="8"'));
    inside(result.lines, 10, 20, 26, 28);
    check(Math.abs(result.area - 128) < 3, 'Solid rectangle lost area');
    check(result.stats.spans < result.stats.darkPixels / 10, 'Solid rows were split into per-pixel moves');
    check(result.root.querySelector('#text-shape').getAttribute('d') === 'M2 2C3 8 9 8 10 2', 'Text curve changed');
    reports.push({test: 'solid rectangle, joined runs, untouched text', ...result.stats});
  }
  for (const [name, href, opacity] of [['half alpha', png(0, 128), ''], ['group opacity', black, ' opacity="0.5"']]) {
    const result = await convert(`<g${opacity}>${img(href, 'x="10" y="10" width="40" height="40"')}</g>`);
    inside(result.lines, 10, 10, 50, 50);
    check(Math.abs(result.area / 1600 - 0.5) < .025, `${name}: transparency not composited on white`);
    reports.push({test: name, area: result.area});
  }
  {
    const result = await convert('<defs><clipPath id="clip"><path d="M15 15H25V25H15Z"/></clipPath></defs>' +
      `<g clip-path="url(#clip)">${img(black, 'x="10" y="10" width="20" height="20"')}</g>`);
    inside(result.lines, 15, 15, 25, 25);
    check(Math.abs(result.area - 100) < 4, 'Clipped image coverage wrong');
    check(!result.root.querySelector('[data-laser-images] [clip-path]'), 'Scan lines depend on unsupported clipping');
    reports.push({test: 'clip baked into lines', area: result.area});
  }
  {
    const result = await convert('<defs><mask id="mask" maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="72">' +
      img(white, 'x="15" y="15" width="10" height="10"') + '</mask></defs>' +
      `<g mask="url(#mask)">${img(black, 'x="10" y="10" width="20" height="20"')}</g>`);
    inside(result.lines, 15, 15, 25, 25);
    check(Math.abs(result.area - 100) < 4, 'Bitmap mask not baked into geometry');
    reports.push({test: 'bitmap mask baked and removed', area: result.area});
  }
  {
    const result = await convert(`<g transform="matrix(0 1 -1 0 40 10)">${img(black, 'width="20" height="10"')}</g>`);
    inside(result.lines, 30, 10, 40, 30);
    check(Math.abs(result.area - 200) < 5, 'Rotated image area changed');
    reports.push({test: 'rotated picture', area: result.area});
  }
  {
    const result = await convert(img(black, 'x="10" y="10" width="20" height="20"') + img(white, 'x="20" y="10" width="10" height="20"'));
    inside(result.lines, 10, 10, 20, 30);
    check(Math.abs(result.area - 200) < 5, 'Overlapping pictures double-etched or white cover ignored');
    reports.push({test: 'overlapping pictures flattened once', area: result.area});
  }
  {
    const result = await convert(`<defs>${img(black, 'id="picture" width="10" height="5"')}<path id="glyph" d="M1 1L2 2"/></defs>` +
      '<use href="#picture" x="20" y="30"/><use href="#glyph"/>' );
    inside(result.lines, 20, 30, 30, 35);
    check(result.root.querySelector('use[href="#glyph"]') && result.root.querySelector('#glyph'), 'Referenced vector glyph removed');
    check(Math.abs(result.area - 50) < 3, 'Referenced picture lost');
    reports.push({test: 'image references and vector definitions', area: result.area});
  }
  {
    const result = await convert(img(white, 'width="72" height="72"'));
    check(!result.lines.length && result.stats.images === 1, 'White picture should produce no marks');
    reports.push({test: 'white picture omitted'});
  }
  {
    const source = svg('<path d="M1 1L10 10"/>');
    check((await LaserImages.convert(source)).content === source, 'Image-free SVG changed');
    for (const [source, message] of [[svg(img('https://invalid.example/picture.png', 'width="10" height="10"')), 'not embedded'],
      ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10000 10000">' + img(black, 'width="10" height="10"') + '</svg>', 'too large']]) {
      let failed = false;
      try { await LaserImages.convert(source); } catch (e) { failed = e.message.includes(message); }
      check(failed, `Expected explicit ${message} error`);
    }
    reports.push({test: 'unchanged vector-only files and explicit error handling'});
  }
  return reports;
}
