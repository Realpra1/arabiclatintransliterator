"""Generate deterministic PDF-to-SVG browser fixtures under ignored dist/.

Requires PyMuPDF 2.0: python -m pip install pymupdf==2.0
Run: python scripts/make-pdf-export-fixtures.py [--output-dir DIRECTORY]

manifest.json contains dimensions, source hashes, and semantic assertions.
geometry-retrace.pdf coordinates are PDF points, with Y upwards. Its paths:
* y=40: line 20->180->20; two traversals, 160-point unique length.
* y=90: one cubic and its exact reverse; retain one cubic, not a polyline.
* y=180: 20->180 plus 120->60; 220 drawn versus160 unique line points.
* y=220: two separate 160-point lines at y=220 and220.2; retain BOTH.
Single-stroke output therefore has 6 unique lines after overlap subdivision
plus one cubic (or 4 lines if contiguous overlap pieces are merged).

Native MCB fill text intentionally uses retraced zero-area TTF outlines.
Unchecked mode must preserve the PDF's paint semantics; checked mode should
recover visible stroke geometry rather than lose the native-fill glyphs.
"""

import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib

import pymupdf as fitz


ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "MCBs-Compact-Laser.ttf"
if not FONT.exists():
    # Published laser app lives in its own folder beside the repository font.
    FONT = ROOT.parent / "MCBs-Compact-Laser.ttf"
TEXT = "a \u00e1 \u0101 i j o Q m"
DATE = "D:20261030000000Z"


def png_bytes():
    """Small deterministic RGB checkerboard; no image-generation dependency."""
    width, height = 12, 8
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    rows = []
    for y in range(height):
        row = bytes(value for x in range(width)
                    for value in ((235, 65, 45) if (x // 3 + y // 2) % 2 else (30, 90, 210)))
        rows.append(b"\0" + row)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


def append_pdf_commands(document, page, commands):
    xref = document.get_new_xref()
    document.update_object(xref, "<<>>")
    document.update_stream(xref, commands.encode("ascii"))
    references = page.get_contents() + [xref]
    document.xref_set_key(page.xref, "Contents", "[" + " ".join(f"{ref} 0 R" for ref in references) + "]")


def save_bytes(document, title):
    document.set_metadata({"title": title, "author": "PDF export regression fixtures",
                           "creator": "make-pdf-export-fixtures.py", "producer": "PyMuPDF",
                           "creationDate": DATE, "modDate": DATE})
    result = document.tobytes(garbage=4, deflate=True, no_new_id=True)
    document.close()
    return result


def mcb_pdf(native_fill_only=False, fill_and_stroke=False):
    document = fitz.open()
    page = document.new_page(width=420, height=190)
    page.insert_font(fontname="MCB", fontfile=str(FONT))
    modes = [2] if fill_and_stroke else ([0] if native_fill_only else [1, 0])
    for index, mode in enumerate(modes):
        page.insert_text((24, 65 + index * 70), TEXT, fontname="MCB", fontsize=34,
                         render_mode=mode, border_width=0.4 / 34, color=(0, 0, 0))
    return save_bytes(document, "MCB native fill" if native_fill_only else "MCB stroke and native fill")


def geometry_pdf():
    document = fitz.open()
    page = document.new_page(width=240, height=260)
    append_pdf_commands(document, page, """
q 0.6 w 0 0 0 RG
20 40 m 180 40 l 20 40 l S
20 90 m 60 150 140 150 180 90 c 140 150 60 150 20 90 c S
20 180 m 180 180 l S
120 180 m 60 180 l S
20 220 m 180 220 l S
20 220.2 m 180 220.2 l S
Q
""")
    return save_bytes(document, "Exact retraces, partial overlap, and distinct close lines")


def mixed_pdf():
    document = fitz.open()
    page = document.new_page(width=420, height=300)
    page.insert_text((24, 42), "Filled text: O B a 8", fontsize=20, render_mode=0)
    page.insert_text((24, 80), "Outlined: O B a 8", fontsize=18, render_mode=1, border_width=0.6 / 18)
    page.draw_rect(fitz.Rect(24, 110, 150, 160), color=(0.1, 0.2, 0.4), fill=(0.85, 0.9, 0.95), width=1.2)
    page.draw_circle(fitz.Point(60, 220), 25, color=(0.1, 0.4, 0.2), width=1.4)
    page.insert_image(fitz.Rect(230, 150, 350, 230), stream=png_bytes())
    # Explicit PDF clipping: line is visible only inside x220..320 / y40..110.
    append_pdf_commands(document, page, """
q 220 40 100 70 re W n
1 0 0 RG 2 w 180 75 m 360 75 l S
0 0.6 0 rg 300 80 60 60 re f
Q
""")
    return save_bytes(document, "Filled and outlined text, raster image, and clipping")


def multipage_pdf():
    document = fitz.open()
    specs = [(240, 180, None, 0), (360, 260, (30, 20, 310, 220), 90),
             (300, 200, None, 180)]
    for index, (width, height, crop, rotation) in enumerate(specs, 1):
        page = document.new_page(width=width, height=height)
        page.insert_text((45, 60), f"Page {index} / Rotate {rotation}", fontsize=13)
        page.draw_rect(fitz.Rect(42, 80, 120, 130), color=(0, 0, 0), width=1)
        # Asymmetric corner marks make accidental rotation/mirroring visible.
        for x, y, color in [(40, 30, (1, 0, 0)), (width - 60, 30, (0, 0.6, 0)),
                            (40, height - 60, (0, 0, 1))]:
            page.draw_rect(fitz.Rect(x, y, x + 12, y + 8), color=None, fill=color)
        page.draw_rect(fitz.Rect(3, 3, 15, 15), color=None, fill=(0.5, 0, 0.5))
        if crop:
            page.set_cropbox(fitz.Rect(crop))
        page.set_rotation(rotation)
    return save_bytes(document, "Three pages with rotation and nonzero crop origin")


def make_fixtures(output):
    output.mkdir(parents=True, exist_ok=True)
    specs = [
        ("mcb-embedded.pdf", lambda: mcb_pdf(False), {
            "text": TEXT, "textOccurrences": 2, "embeddedFont": "MCBs-Compact-Laser",
            "textPaintModes": ["stroke", "fill"],
            "checks": ["Keep both text occurrences as vectors, not a raster image.",
                       "Single stroke removes coincident forward/back curves in both occurrences."]}),
        ("mcb-native-fill.pdf", lambda: mcb_pdf(True), {
            "text": TEXT, "textOccurrences": 1, "embeddedFont": "MCBs-Compact-Laser",
            "textPaintModes": ["fill"],
            "checks": ["Unchecked preserves native fill semantics, including zero-area strokes.",
                       "Checked produces visible single-pass vector glyphs from native fill text."]}),
        ("mcb-fill-stroke.pdf", lambda: mcb_pdf(fill_and_stroke=True), {
            "text": TEXT, "textOccurrences": 1, "embeddedFont": "MCBs-Compact-Laser",
            "textPaintModes": ["fill-and-stroke"],
            "checks": ["PDF synthetic bold emits overlapping fill and stroke glyph objects.",
                       "Single stroke retains one copy at every original glyph position."]}),
        ("geometry-retrace.pdf", geometry_pdf, {
            "source": {"lineSegments": 6, "cubicSegments": 2, "lineLengthPt": 860},
            "singleStroke": {"lineLengthPt": 640, "cubicSegments": 1,
                             "normalizedLineSegments": 6, "nearbyDistinctLines": 2},
            "checks": ["Keep the cubic shape and both y220/y220.2 lines.",
                       "No exact reverse edges or partially overlapping collinear edges remain."]}),
        ("mixed-content.pdf", mixed_pdf, {
            "imageCount": 1, "imagePixels": [12, 8], "textPaintModes": ["fill", "stroke"],
            "clipRectPdfPt": [220, 40, 320, 110],
            "clippedRedLinePdfPt": [[220, 75], [320, 75]],
            "checks": ["Filled text counters remain holes in unchecked mode.",
                       "Convert the image to engraving lines and retain vector clipping in both modes.",
                       "Do not expose red line outside the clip rectangle."]}),
        ("multipage-rotated-cropped.pdf", multipage_pdf, {
            "rotations": [0, 90, 180], "mediaBoxesPt": [[0, 0, 240, 180], [0, 0, 360, 260], [0, 0, 300, 200]],
            "cropBoxesTopLeftPt": [[0, 0, 240, 180], [30, 20, 310, 220], [0, 0, 300, 200]],
            "checks": ["Export all three pages in order with effective cropped/rotated sizes.",
                       "The purple corner square is clipped away on page2 only.",
                       "Preserve relative orientation of the asymmetric colored markers."]}),
    ]
    manifest = {"schemaVersion": 1, "generator": "PyMuPDF " + fitz.VersionBind,
                "fontSha256": hashlib.sha256(FONT.read_bytes()).hexdigest(), "fixtures": []}
    for filename, build, expected in specs:
        data = build()
        if data != build():
            raise AssertionError(f"{filename}: build is not byte-reproducible")
        (output / filename).write_bytes(data)
        with fitz.open(stream=data, filetype="pdf") as document:
            entry = {"filename": filename, "sha256": hashlib.sha256(data).hexdigest(),
                     "pageCount": len(document),
                     "pageSizesPt": [[page.rect.width, page.rect.height] for page in document],
                     "expected": expected}
            if filename.startswith("mcb-"):
                assert document[0].get_text().count(TEXT) == expected["textOccurrences"]
                assert any(font[1] == "ttf" for font in document[0].get_fonts())
            if filename == "mixed-content.pdf":
                assert len(document[0].get_images()) == 1
                assert document[0].get_images()[0][2:4] == (12, 8)
            if filename == "geometry-retrace.pdf":
                items = [item for drawing in document[0].get_drawings() for item in drawing["items"]]
                lines = [item for item in items if item[0] == "l"]
                assert len(lines) == 6
                assert sum(item[0] == "c" for item in items) == 2
                assert abs(sum(item[1].distance_to(item[2]) for item in lines) - 860) < 1e-6
            if filename.startswith("multipage-"):
                assert entry["pageSizesPt"] == [[240, 180], [200, 280], [300, 200]]
            manifest["fixtures"].append(entry)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist/pdf-fixtures")
    args = parser.parse_args()
    manifest = make_fixtures(args.output_dir)
    print(json.dumps({"directory": str(args.output_dir), "fixtures": manifest["fixtures"]}, indent=2))
