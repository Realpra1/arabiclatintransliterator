async () => {
  const assert = (c, m) => { if (!c) throw Error(m); }, reports = [];
  const c = document.createElement('canvas'); c.width = 40; c.height = 20;
  const ctx = c.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 40, 20);
  ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 5, 20);
  ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(30, 0, 5, 20);
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><path id="text" fill="none" stroke="black" d="M0 0L10 0"/><image href="${c.toDataURL()}" x="0" y="10" width="72" height="36"/></svg>`;
  function lines(content) {
    const xml = new DOMParser().parseFromString(content, 'image/svg+xml');
    assert(xml.querySelector('#text').getAttribute('d') === 'M0 0L10 0', 'Text changed');
    return [...xml.querySelectorAll('[data-laser-images] path')].flatMap(p => LaserGeometry.parsePath(p.getAttribute('d')).map(s => ({points: s.points, power: Number(p.getAttribute('data-laser-power') ?? 1)})));
  }
  const canonical = ls => ls.map(l => JSON.stringify([l.points.map(p => [...p]).sort((a, b) => a[0] - b[0]), l.power])).sort();
  for (const shading of ['power', 'dither']) {
    const rows = await LaserImages.convert(source, () => {}, {fill: 'rows', shading});
    const areas = await LaserImages.convert(source, () => {}, {fill: 'regions', shading});
    assert(JSON.stringify(canonical(lines(rows.content))) === JSON.stringify(canonical(lines(areas.content))), 'Routing changed geometry or power');
    assert(areas.stats.travelAfterMm < areas.stats.travelBeforeMm, 'Separated objects did not reduce travel');
    if (shading === 'power') {
      const ls = lines(areas.content);
      assert(ls.some(l => l.power === .5) && ls.some(l => l.power === 1), 'Missing gray/black power');
      assert(areas.stats.regions === 2, 'Two solid gray/black shapes must be separate areas');
      const gc = await LaserGcodeSvg.convert(areas.content, {feed: 750, power: 950});
      assert(gc.content.includes('S475\n') && gc.content.includes('S950\n'), 'Power metadata did not reach G-code');
      assert(!gc.content.includes('F1000') && gc.content.includes('F750'), 'Speed ignored');
      const strokes = ls.reduce((counts, l) => { const s = Math.round(l.power * 950); counts[s] = (counts[s] || 0) + 1; return counts; }, {});
      let power = 0, count = 0;
      for (const line of gc.content.split('\n')) {
        const setting = line.match(/(?:^|\s)S([\d.]+)/); if (setting) power = Number(setting[1]);
        if (/^G0 /.test(line)) assert(power === 0, 'Rapid travel with power');
        if (/^G1 X/.test(line)) {
          if (count++ === 0) assert(power === 950, 'Text power changed');
          else { assert(strokes[power] > 0, 'Unexpected powered image span'); strokes[power]--; }
        }
      }
      assert(Object.values(strokes).every(n => n === 0), 'Image spans missing from G-code');
    }
    reports.push({shading, ...areas.stats});
  }
  return reports;
}
