/* Browser regression cases: evaluated against the built offline converter. */
(() => {
  const defs = '<defs><path id="glyph" d="M0 0L10 0L5 10Z"/>' +
    '<clipPath id="clip"><path d="M0 0H100V100H0Z"/></clipPath></defs>';
  const glyph = (attributes = '') => `<use data-text="A" href="#glyph" ${attributes}/>`;
  const fill = glyph('fill="black"'), stroke = glyph('fill="none" stroke="black" stroke-width=".4"');
  function check(name, body, expected, single = true) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs}${body}</svg>`;
    const result = LaserSvg.prepare(svg, single);
    const doc = new DOMParser().parseFromString(result.content, 'image/svg+xml');
    const actual = single ? doc.querySelectorAll('g[data-text] > path').length : doc.querySelectorAll('use').length;
    if (actual !== expected) throw Error(`${name}: expected ${expected} glyphs, received ${actual}`);
    return {name, glyphs: actual, removed: result.stats.removed};
  }
  return [
    check('fill and stroke become one outline', fill + stroke, 1),
    check('ordinary export preserves both paint objects', fill + stroke, 2, false),
    check('distinct text positions survive', fill + glyph('transform="translate(1 0)"'), 2),
    check('tiny position differences are never rounded away', fill + glyph('transform="translate(.000000001 0)"'), 2),
    check('different glyph scale survives', fill + glyph('transform="scale(2)"'), 2),
    check('opacity preserves compositing', glyph('opacity=".5"') + glyph('opacity=".5"'), 2),
    check('inherited opacity preserves compositing', `<g opacity=".5">${fill}${stroke}</g>`, 2),
    check('different clipping groups stay separate', `<g>${fill}</g><g clip-path="url(#clip)">${stroke}</g>`, 2),
    check('a shared clipping group allows deduplication', `<g clip-path="url(#clip)">${fill}${stroke}</g>`, 1),
    check('intervening artwork is a paint-order boundary', fill + '<path d="M0 0H100V100H0Z"/>' + stroke, 2),
    check('dashed glyphs retain their paint and subpaths', glyph('stroke-dasharray="2 2"') + glyph('stroke-dasharray="2 2"'), 2)
  ];
})();
