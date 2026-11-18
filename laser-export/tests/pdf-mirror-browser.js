async () => {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 72 72"><defs><clipPath id="c"><path d="M10 20H82V92H10Z"/></clipPath></defs><g clip-path="url(#c)"><path fill="none" stroke="black" d="M20 30C25 30 25 40 30 40"/><g data-laser-images="1"><path fill="none" stroke="rgb(128,128,128)" data-laser-power="0.5" d="M40 50L50 50"/></g></g></svg>';
  assert(LaserOutput.mirror(source, false) === source, 'Default off must preserve SVG exactly');
  const mirrored = LaserOutput.mirror(source, true), xml = new DOMParser().parseFromString(mirrored, 'image/svg+xml');
  assert(xml.querySelector('svg > defs'), 'Definitions should remain available');
  assert(xml.querySelector('[data-laser-mirror]').getAttribute('transform') === 'matrix(-1 0 0 1 92 0)', 'Mirror uses entire viewBox');
  const settings = {feed: 700, power: 950};
  function moves(code) {
    let x = 0, y = 0, power = 0; const cuts = [];
    for (const line of code.split('\n')) {
      if (line.startsWith(';')) continue;
      const w = Object.fromEntries([...line.matchAll(/([A-Z])(-?[\d.]+)/g)].map(m => [m[1], Number(m[2])]));
      if ('S' in w) power = w.S;
      if ('X' in w) { if (w.G === 1 && power) cuts.push([[x, y], [w.X, w.Y], power]); x = w.X; y = w.Y; }
    }
    return cuts;
  }
  const a = moves((await LaserGcodeSvg.convert(source, settings)).content);
  const b = moves((await LaserGcodeSvg.convert(mirrored, settings)).content);
  assert(a.length === b.length, 'Mirror added/lost strokes');
  for (let i = 0; i < a.length; i++) {
    assert(a[i][2] === b[i][2], 'Mirror changed power');
    for (let j = 0; j < 2; j++) {
      assert(Math.abs(a[i][j][0] + b[i][j][0] - 25.4) < .00011, 'X did not mirror about page width');
      assert(a[i][j][1] === b[i][j][1], 'Y changed');
    }
  }
  const prepared = LaserSvg.prepare(source, true);
  const restored = new DOMParser().parseFromString(prepared.content, 'image/svg+xml').querySelector('[data-laser-power]');
  assert(restored.getAttribute('stroke') === 'rgb(128,128,128)', 'Reopening an exported SVG lost gray display color');
  assert(restored.getAttribute('data-laser-power') === '0.5', 'Reopening an exported SVG lost picture power');
  return ['Mirror off is exact identity', 'Nonzero viewBox and clips preserved', 'All text/image X coordinates reflected without changed Y or power', 'Existing image power and gray display survive single-stroke preparation'];
}
