/* SPDX-License-Identifier: AGPL-3.0-or-later */
const LaserRaster = (() => {
  // Serpentine Floyd–Steinberg error diffusion. Input is straight-alpha RGBA;
  // composite on white before deciding what the laser should mark.
  function* rows(rgba, width, height, shading = 'dither') {
    if (!['dither', 'power'].includes(shading)) throw Error('Choose a supported picture shading method.');
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
      throw Error('Invalid image pixel dimensions.');
    }
    let current = new Float32Array(width + 2), next = new Float32Array(width + 2);
    const black = new Uint8Array(width);
    for (let y = 0; y < height; y++) {
      const direction = y % 2 ? -1 : 1;
      let darkPixels = 0;
      for (let n = 0; n < width; n++) {
        const x = direction === 1 ? n : width - 1 - n, i = (y * width + x) * 4;
        const luminance = 2126 * rgba[i] + 7152 * rgba[i + 1] + 722 * rgba[i + 2];
        const alpha = rgba[i + 3];
        const tone = ((255 - alpha) * 255 * 10000 + alpha * luminance) / (255 * 255 * 10000);
        if (shading === 'power') {
          // Thirty-two power levels avoid a separate short move for every tiny
          // antialiasing variation. Zero is white; 32 is the selected full power.
          black[x] = Math.round((1 - tone) * 32); darkPixels += Number(black[x] > 0);
          continue;
        }
        const value = Math.max(0, Math.min(1, tone + current[x + 1]));
        // Keep genuinely white/transparent backgrounds and solid black intact.
        const mark = tone <= 0 ? 1 : tone >= 1 ? 0 : Number(value < 0.5);
        black[x] = mark; darkPixels += mark;
        const error = tone <= 0 || tone >= 1 ? 0 : value - (1 - mark);
        current[x + 1 + direction] += error * 7 / 16;
        next[x + 1 - direction] += error * 3 / 16;
        next[x + 1] += error * 5 / 16;
        next[x + 1 + direction] += error / 16;
      }
      const spans = [];
      for (let x = 0; x < width;) {
        if (!black[x]) { x++; continue; }
        const start = x++;
        const level = black[start];
        while (x < width && black[x] === level) x++;
        const span = direction === 1 ? [start, x] : [x, start];
        if (shading === 'power') span.push(level / 32);
        spans.push(span);
      }
      if (direction === -1) spans.reverse();
      yield {y, spans, darkPixels};
      [current, next] = [next, current]; next.fill(0);
    }
  }
  return {rows};
})();
if (typeof module !== 'undefined') module.exports = LaserRaster;
