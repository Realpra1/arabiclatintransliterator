"""Build the offline, double-click PDF-to-SVG HTML. No runtime installation.

MuPDF's pinned npm archive is integrity checked and cached in .pdf-build.
Source modules and the compressed WASM engine are embedded without a CDN.
"""
from pathlib import Path
import argparse
import base64
import gzip
import hashlib
import io
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.28.1"
INTEGRITY = "Gi11Ow2G1SlrXKJNZBL1eAIGFVih5+4ZKqjptamTVaj/5hnlrcVrVbyb7lHE2lfFKdxZPyv9ZtfOOq7XgjzEig=="
URL = f"https://registry.npmjs.org/mupdf/-/mupdf-{VERSION}.tgz"


def dependency():
    cache = ROOT / ".pdf-build"
    cache.mkdir(exist_ok=True)
    archive = cache / "package.tgz"
    if not archive.exists():
        archive.write_bytes(urllib.request.urlopen(URL, timeout=120).read())
    data = archive.read_bytes()
    actual = base64.b64encode(hashlib.sha512(data).digest()).decode()
    if actual != INTEGRITY:
        raise ValueError("MuPDF archive checksum mismatch; remove .pdf-build/package.tgz and retry")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        # Read named files only; never extract arbitrary package paths.
        return {name: tar.extractfile("package/dist/" + name).read() for name in
                ("mupdf.js", "mupdf-wasm.js", "mupdf-wasm.wasm")}


def block(name, data):
    return f'<script id="{name}" type="application/octet-stream">{base64.b64encode(data).decode()}</script>'


def build(output):
    vendor = dependency()
    app = ROOT / "pdf-export"
    blocks = [block("engine-api", vendor["mupdf.js"]),
              block("engine-loader", vendor["mupdf-wasm.js"]),
              block("engine-binary", gzip.compress(vendor["mupdf-wasm.wasm"], mtime=0))]
    for name in ("geometry.js", "svg-path-input.js", "svg-input.js", "svg.js", "raster-lines.js", "image-regions.js", "images.js", "output.js", "gcode.js", "gcode-svg.js", "zip.js", "loader.js", "app.js"):
        # Classic scripts support file:// and expose one small namespace each.
        code = (app / name).read_text(encoding="utf-8")
        blocks.append('<script>\n' + code.replace('</script', '<\\/script') + '\n</script>')
    blocks.append(block("license-text", (app / "LICENSE.txt").read_bytes()))
    html = (app / "index.html").read_text(encoding="utf-8").replace("<!-- BUNDLE -->", "\n".join(blocks))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8", newline="\n")
    print(f"Built {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "PDF to SVG.html")
    build(parser.parse_args().output)
