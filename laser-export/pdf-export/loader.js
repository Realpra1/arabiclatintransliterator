/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Everything is embedded by build-pdf-export.py; file:// needs no network fetch.
function embeddedBytes(id) {
  return Uint8Array.from(atob(document.getElementById(id).textContent.trim()), c => c.charCodeAt(0));
}
function moduleURL(source) {
  return URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
}
async function loadEngine() {
  const binary = await new Response(new Blob([embeddedBytes('engine-binary')]).stream()
    .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  globalThis.$libmupdf_wasm_Module = {wasmBinary: new Uint8Array(binary), locateFile: () => 'embedded.wasm'};
  const decoder = new TextDecoder();
  const wasmURL = moduleURL(decoder.decode(embeddedBytes('engine-loader')));
  const apiURL = moduleURL(decoder.decode(embeddedBytes('engine-api')).replace('"./mupdf-wasm.js"', JSON.stringify(wasmURL)));
  try { return await import(apiURL); }
  finally {
    URL.revokeObjectURL(apiURL);
    URL.revokeObjectURL(wasmURL);
    delete globalThis.$libmupdf_wasm_Module;
  }
}
