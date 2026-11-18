async () => {
  const checks = [], settings = {feed: 1000, power: 950};
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">${body}</svg>`;
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  function cuts(code) {
    const result = []; let current = [0, 0], power = 0, enabled = false;
    for (const line of code.split('\n')) {
      if (line.startsWith(';')) continue;
      const words = Object.fromEntries([...line.matchAll(/([A-Z])(-?[\d.]+)/g)].map(m => [m[1], Number(m[2])]));
      if ('M' in words) { if ([3, 4].includes(words.M)) enabled = true; if (words.M === 5) enabled = false; }
      if ('S' in words) power = words.S;
      if ('X' in words || 'Y' in words) {
        assert('X' in words && 'Y' in words && 'G' in words, 'Explicit XY motion required');
        const next = [words.X, words.Y];
        if (words.G === 0) assert(!power || !enabled, 'Rapid with laser enabled');
        if (words.G === 1 && power && enabled) result.push([current, next]);
        current = next;
      }
    }
    return result;
  }
  const convert = async body => cuts((await LaserGcodeSvg.convert(svg(body), settings)).content);
  const near = (actual, expected) => assert(Math.abs(actual - expected) < 0.00011, `${actual} != ${expected}`);

  let lines = await convert('<path fill="none" stroke="black" d="M0 0L72 0 M72 72L0 72"/>');
  assert(JSON.stringify(lines) === JSON.stringify([[[0, 25.4], [25.4, 25.4]], [[25.4, 0], [0, 0]]]), 'Page scale and Y flip');
  checks.push('Physical millimetres, bottom-left origin, open image spans, explicit laser-off travel');

  lines = await convert('<g transform="translate(10 20)"><path transform="scale(2)" fill="none" stroke="black" d="M1 1L3 1"/></g>');
  near(lines[0][0][0], 12 * 25.4 / 72); near(lines[0][1][0], 16 * 25.4 / 72); near(lines[0][0][1], 50 * 25.4 / 72);
  checks.push('Nested placement and scale transforms');

  lines = await convert('<defs><path id="glyph" d="M0 0L10 0L5 5"/></defs><use href="#glyph" x="10" y="10"/><use href="#glyph" x="30" y="10"/>');
  assert(lines.length === 6, 'Filled glyph contours must close once per instance');
  near(lines[0][0][0], 10 * 25.4 / 72); near(lines[3][0][0], 30 * 25.4 / 72);
  checks.push('Ordinary SVG glyph references and implicit filled boundaries');

  lines = await convert('<defs><clipPath id="clip"><path d="M10 10H30V30H10Z"/></clipPath></defs><g clip-path="url(#clip)"><path fill="none" stroke="black" d="M0 20L72 20M0 40L72 40"/></g>');
  assert(lines.length === 1, 'Clip must remove outside stroke');
  near(lines[0][0][0], 10 * 25.4 / 72); near(lines[0][1][0], 30 * 25.4 / 72);
  checks.push('Vector clipping trims strokes without engraving clip boundaries');

  lines = await convert('<defs><clipPath id="clip"><rect x="0" y="0" width="10" height="10"/></clipPath></defs><g transform="translate(20 20) rotate(45)" clip-path="url(#clip)"><path fill="none" stroke="black" d="M-10 5L20 5"/></g>');
  assert(lines.length === 1, 'Transformed clip');
  near(Math.hypot(lines[0][1][0] - lines[0][0][0], lines[0][1][1] - lines[0][0][1]), 10 * 25.4 / 72);
  checks.push('Rotated clips use the same transform as the drawing');

  const nonzero = svg('<path fill="none" stroke="black" d="M10 20L82 92"/>').replace('0 0 72 72', '10 20 72 72');
  lines = cuts((await LaserGcodeSvg.convert(nonzero, settings)).content);
  assert(JSON.stringify(lines) === JSON.stringify([[[0, 25.4], [25.4, 0]]]), 'Nonzero viewBox');
  checks.push('Nonzero viewBox and full page dimensions');

  lines = await convert('<g display="none"><path d="M0 0L72 72"/></g><path fill="none" stroke="black" d="M-10 36L82 36"/>');
  assert(JSON.stringify(lines) === JSON.stringify([[[0, 12.7], [25.4, 12.7]]]), 'Hidden content/page crop');
  checks.push('Hidden artwork is skipped and strokes stay inside the page');

  lines = await convert('<g fill="none" stroke="black" stroke-opacity="0"><path d="M0 0L10 10"/></g><path opacity="0.0" d="M0 0L10 10"/><path fill-opacity="0" d="M0 0L10 10"/><path fill="none" stroke="black" d="M0 36L72 36"/>');
  assert(JSON.stringify(lines) === JSON.stringify([[[0, 12.7], [25.4, 12.7]]]), 'Invisible alpha must not engrave');
  checks.push('Numeric zero opacity and inherited paint transparency do not engrave');

  const repeated = svg('<path d="M10 10C20 10 20 20 10 20C20 20 20 10 10 10"/>');
  const normal = cuts((await LaserGcodeSvg.convert(LaserSvg.prepare(repeated, false).content, settings)).content);
  const single = cuts((await LaserGcodeSvg.convert(LaserSvg.prepare(repeated, true).content, settings)).content);
  assert(normal.length === 2 * single.length, 'Single stroke must remove reverse Bezier before flattening');
  checks.push('Checkbox retains/removes exact reversed curves before G-code sampling');

  for (const [body, reason] of [
    ['<path stroke-dasharray="2 2" d="M0 0L10 10"/>', 'dashed'],
    ['<path mask="url(#mask)" d="M0 0L10 10"/>', 'mask'],
    ['<path opacity="0.5" d="M0 0L10 10"/>', 'transparent'],
    ['<path fill="none" stroke="black" stroke-opacity="0.5" d="M0 0L10 10"/>', 'transparent'],
    ['<image href="data:image/png;base64,AAAA"/>', 'image'],
    ['<use href="#missing"/>', 'reference'],
    ['<defs><clipPath id="c"><path d="M0 0L10 0L5 5L10 10L0 10Z"/></clipPath></defs><path clip-path="url(#c)" d="M0 0L10 10"/>', 'concave'],
  ]) {
    let error = '';
    try { await LaserGcodeSvg.convert(svg(body), settings); } catch (e) { error = e.message; }
    assert(error.includes(reason), `Expected explicit ${reason} failure, got ${error}`);
  }
  checks.push('Unsupported effects fail explicitly instead of silently changing engraving');
  return checks;
}
