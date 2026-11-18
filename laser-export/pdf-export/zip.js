/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Small, dependency-free ZIP writer (stored files, UTF-8 names, CRC-32).
const SvgZip = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function header(length) {
    const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
    return {bytes, u16: (p, v) => view.setUint16(p, v, true), u32: (p, v) => view.setUint32(p, v, true)};
  }
  function pack(files) {
    if (files.length > 65535) throw Error('Too many pages for a ZIP archive.');
    const local = [], central = [], encoder = new TextEncoder();
    let offset = 0, centralSize = 0;
    for (const file of files) {
      const name = encoder.encode(file.name), data = encoder.encode(file.content), crc = crc32(data);
      if (offset + data.length > 0xffffffff) throw Error('SVG archive exceeds 4 GB. Convert a smaller PDF.');
      const h = header(30); h.u32(0, 0x04034b50); h.u16(4, 20); h.u16(6, 0x800);
      h.u16(12, 33); h.u32(14, crc); h.u32(18, data.length); h.u32(22, data.length); h.u16(26, name.length);
      local.push(h.bytes, name, data);
      const c = header(46); c.u32(0, 0x02014b50); c.u16(4, 20); c.u16(6, 20); c.u16(8, 0x800);
      c.u16(14, 33); c.u32(16, crc); c.u32(20, data.length); c.u32(24, data.length); c.u16(28, name.length); c.u32(42, offset);
      central.push(c.bytes, name); centralSize += c.bytes.length + name.length;
      offset += h.bytes.length + name.length + data.length;
    }
    const end = header(22); end.u32(0, 0x06054b50); end.u16(8, files.length); end.u16(10, files.length);
    end.u32(12, centralSize); end.u32(16, offset);
    return new Blob([...local, ...central, end.bytes], {type: 'application/zip'});
  }
  return {pack, crc32};
})();
if (typeof module !== 'undefined') module.exports = SvgZip;
