/* SPDX-License-Identifier: AGPL-3.0-or-later */
(() => {
  const file = document.getElementById('pdf'), checkbox = document.getElementById('single');
  const button = document.getElementById('convert'), status = document.getElementById('status');
  const gcButton = document.getElementById('gcode'), feed = document.getElementById('feed'), power = document.getElementById('power');
  const imageFill = document.getElementById('image-fill'), imageShading = document.getElementById('image-shading');
  const mirror = document.getElementById('mirror');
  let engine = null, busy = false;
  function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
  function available() { button.disabled = gcButton.disabled = busy || !engine || !file.files.length; }
  function save(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));
  function pageSvg(doc, number) {
    const page = doc.loadPage(number), buffer = new engine.Buffer();
    let writer, device;
    try {
      writer = new engine.DocumentWriter(buffer, 'svg', 'text=path');
      device = writer.beginPage(page.getBounds());
      page.run(device, engine.Matrix.identity);
      device.close(); writer.endPage(); writer.close();
      return buffer.asString();
    } finally { device?.destroy(); writer?.destroy(); buffer.destroy(); page.destroy(); }
  }
  const ready = () => file.files.length ? 'Ready to convert.' : 'Choose a PDF or SVG to begin.';
  file.addEventListener('change', () => { available(); if (engine) message(ready()); });
  for (const option of [checkbox, mirror]) option.addEventListener('change', () => { if (!busy && engine) message(ready()); });
  async function convert(gcode) {
    if (button.disabled) return;
    busy = true; available(); file.disabled = checkbox.disabled = feed.disabled = power.disabled = true;
    imageFill.disabled = imageShading.disabled = mirror.disabled = true;
    let doc;
    try {
      const input = file.files[0], single = checkbox.checked;
      const settings = gcode ? LaserGcode.validate({feed: feed.value, power: power.value}) : null;
      const isSvg = /\.svg$/i.test(input.name) || input.type === 'image/svg+xml';
      message(`Opening ${isSvg ? 'SVG' : 'PDF'}…`); await yieldUI();
      let svg;
      if (isSvg) svg = LaserSvgInput.prepare(await input.text());
      else {
        doc = engine.Document.openDocument(await input.arrayBuffer(), 'application/pdf');
        if (doc.needsPassword()) throw Error('This PDF needs a password. Save an unlocked copy and choose that file.');
      }
      const count = isSvg ? 1 : doc.countPages();
      if (!count) throw Error('This PDF contains no pages.');
      const stem = input.name.replace(/\.(pdf|svg)$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'document';
      const suffix = (single ? '-single-stroke' : '') + (imageFill.value === 'regions' ? '-areas' : '') + (imageShading.value === 'power' ? '-power' : '') + (mirror.checked ? '-mirrored' : '');
      const files = [], totals = {removed: 0, kept: 0, images: 0, clipped: 0, limited: 0, dashed: 0};
      let imageCount = 0, imageSpans = 0, gcMoves = 0, regions = 0, travelBefore = 0, travelAfter = 0;
      for (let i = 0; i < count; i++) {
        message(`Converting page ${i + 1} of ${count}…`); await yieldUI();
        const result = LaserSvg.prepare(isSvg ? svg : pageSvg(doc, i), single);
        const pictures = await LaserImages.convert(result.content, text => message(`Page ${i + 1} of ${count}: ${text}`), {fill: imageFill.value, shading: imageShading.value});
        result.content = LaserOutput.mirror(pictures.content, mirror.checked);
        imageCount += pictures.stats.images; imageSpans += pictures.stats.spans;
        regions += pictures.stats.regions || 0; travelBefore += pictures.stats.travelBeforeMm || 0; travelAfter += pictures.stats.travelAfterMm || 0;
        for (const key of Object.keys(totals)) totals[key] += result.stats[key];
        if (gcode) {
          const code = await LaserGcodeSvg.convert(result.content, settings, text => message(`Page ${i + 1} of ${count}: ${text}`));
          result.content = code.content; gcMoves += code.moves;
        }
        files.push({name: `${stem}${count > 1 ? '-page-' + String(i + 1).padStart(3, '0') : ''}${suffix}.${gcode ? 'gc' : 'svg'}`, content: result.content});
      }
      const blob = count === 1 ? new Blob([files[0].content], {type: gcode ? 'text/plain' : 'image/svg+xml'}) : SvgZip.pack(files);
      save(blob, count === 1 ? files[0].name : stem + suffix + (gcode ? '-gcode' : '') + '.zip');
      const format = gcode ? 'G-code' : 'SVG';
      let text = `${count === 1 ? format : count + ' ' + format + 's in a ZIP'} downloaded. Page size and text positions preserved.`;
      if (mirror.checked) text += '\nWhole page mirrored left to right for back-of-glass engraving.';
      if (gcode) text += `\n${gcMoves.toLocaleString()} engraving moves. Speed ${settings.feed} mm/min; maximum power S${settings.power}. Automatic bounds; origin at the page’s bottom-left.`;
      if (single) {
        text += `\n${totals.removed.toLocaleString()} repeated segments removed; ${totals.kept.toLocaleString()} segments retained.`;
        if (!totals.removed) text += '\nNo repeated segments found. Outlines are still outlines.';
        if (totals.clipped && !gcode) text += '\nClipping/masks retained. Your SVG importer must support these for the same visible result.';
        if (totals.limited) text += '\nSome large paths received duplicate removal only; partial-overlap checking was limited.';
        if (totals.dashed) text += '\nDashed paths were left unchanged to preserve their dash pattern.';
      }
      if (imageCount) {
        text += `\n${imageCount} pictures converted to ${imageSpans.toLocaleString()} engraving lines at 0.1 mm spacing.`;
        text += imageShading.value === 'power' ? '\nPicture shades use reduced power. Black uses the selected maximum.' : '\nPicture shades use black-and-white dithering.';
        if (regions) text += `\n${regions.toLocaleString()} connected areas filled separately. Image travel: ${Math.round(travelAfter).toLocaleString()} mm (${Math.round(travelBefore).toLocaleString()} mm with scan rows).`;
        if (!gcode && imageShading.value === 'power') text += '\nUse direct G-code to apply variable picture power; SVG importers may engrave all lines at one power.';
      }
      message(text);
    } catch (error) { console.error(error); message('Could not convert: ' + (error.message || String(error)), true); }
    finally { doc?.destroy(); busy = false; file.disabled = checkbox.disabled = feed.disabled = power.disabled = imageFill.disabled = imageShading.disabled = mirror.disabled = false; available(); }
  }
  button.addEventListener('click', () => convert(false));
  gcButton.addEventListener('click', () => convert(true));
  document.getElementById('credits').addEventListener('click', event => {
    event.preventDefault();
    save(new Blob([embeddedBytes('license-text')], {type: 'text/plain'}), 'PDF-to-SVG-licenses.txt');
  });
  loadEngine().then(value => { engine = value; message(ready()); available(); })
    .catch(error => { console.error(error); message('Cannot start PDF engine. Open this HTML in a current Chrome, Edge, or Firefox browser. ' + error.message, true); });
})();
