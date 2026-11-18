"""Test the built HTML offline in Chrome, with real PDF downloads.

Requires playwright and pymupdf for test fixtures/independent rendering only.
The app itself has no Python dependency.
"""
from pathlib import Path
import base64
import importlib.util
import io
import json
import math
import zipfile
import xml.etree.ElementTree as ET

import pymupdf
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist/pdf-export-checks"
NS = {"s": "http://www.w3.org/2000/svg"}


def fixtures():
    spec = importlib.util.spec_from_file_location("fixtures", ROOT / "scripts/make-pdf-export-fixtures.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.make_fixtures(ROOT / "dist/pdf-fixtures")


def svg_size(data, points):
    root = ET.fromstring(data)
    width, height = points
    assert math.isclose(float(root.get("width")[:-2]), width * 25.4 / 72, abs_tol=1e-7)
    assert math.isclose(float(root.get("height")[:-2]), height * 25.4 / 72, abs_tol=1e-7)
    assert root.get("width").endswith("mm") and root.get("height").endswith("mm")
    assert list(map(float, root.get("viewBox").split())) == [0, 0, width, height]
    assert not root.findall(".//s:text", NS), "Text must be outlined, not depend on installed fonts"
    return root


def raster_matches(pdf_path, svg_pages, browser_page):
    with pymupdf.open(pdf_path) as pdf:
        for i, svg in enumerate(svg_pages):
            expected = pdf[i].get_pixmap(alpha=False)
            # Chrome supports SVG clipping/masks; MuPDF's SVG *input* renderer
            # does not support all features emitted by its PDF->SVG writer.
            png = browser_page.evaluate("""async ({svg, width, height}) => {
              const image = new Image();
              image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
              await image.decode();
              const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
              const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height);
              ctx.drawImage(image, 0, 0, width, height);
              return canvas.toDataURL('image/png').split(',')[1];
            }""", {'svg': svg.decode(), 'width': expected.width, 'height': expected.height})
            actual_rgba = pymupdf.Pixmap(base64.b64decode(png))
            actual = pymupdf.Pixmap(actual_rgba, 0)
            assert (actual.width, actual.height) == (expected.width, expected.height)
            # Browser and PDF engines interpolate enlarged raster pixels
            # differently. Verify embedded image pixels separately below;
            # compare vector/page layout outside image rectangles here.
            image_bounds = [pymupdf.Rect(info['bbox']) for info in pdf[i].get_image_info()]
            left, right = actual.samples, expected.samples
            difference, channels = 0, 0
            for y in range(expected.height):
                for x in range(expected.width):
                    if any(rect.contains(pymupdf.Point(x, y)) for rect in image_bounds):
                        continue
                    offset = (y * expected.width + x) * 3
                    difference += sum(abs(left[offset + k] - right[offset + k]) for k in range(3))
                    channels += 3
            delta = difference / channels
            assert delta < 1, f"{pdf_path.name} page {i + 1} render diverged: mean channel difference {delta}"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = fixtures()
    report = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(offline=True, accept_downloads=True)
        page = context.new_page()
        errors, requests = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: requests.append(request.url) if request.url.startswith(("http:", "https:")) else None)
        page.goto((ROOT / "dist/PDF to SVG.html").as_uri())
        page.wait_for_function("document.querySelector('#status').textContent === 'Choose a PDF or SVG to begin.'", timeout=60000)
        page.select_option('#image-fill', 'rows'); page.select_option('#image-shading', 'dither')
        assert page.locator("#convert").is_disabled()
        # Subpath/dash semantics and implicitly closed filled contours.
        checks = page.evaluate("""() => {
          const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">';
          const tail = '</svg>';
          const dashed = head + '<g fill="none" stroke="black" stroke-dasharray="10 10"><path d="M0 10L15 10"/><path d="M15 10L30 10"/></g>' + tail;
          const result = LaserSvg.prepare(dashed, true);
          const doc = new DOMParser().parseFromString(result.content, 'image/svg+xml');
          const filled = LaserSvg.prepare(head + '<path d="M0 0L10 0L5 10"/>' + tail, true);
          return {dashes: result.stats.dashed, paths: [...doc.querySelectorAll('path')].map(p => p.getAttribute('d')), triangle: filled.stats.kept};
        }""")
        assert checks == {'dashes': 2, 'paths': ['M0 10L15 10', 'M15 10L30 10'], 'triangle': 3}, checks
        glyph_checks = page.evaluate((ROOT / 'tests/pdf-glyph-duplicates.js').read_text(encoding='utf-8'))
        assert glyph_checks[0]['removed'] == 3
        (OUT / 'glyph-regressions.json').write_text(json.dumps(glyph_checks, indent=2), encoding='utf-8')
        image_checks = page.evaluate((ROOT / 'tests/pdf-image-lines.js').read_text(encoding='utf-8'))
        (OUT / 'image-regressions.json').write_text(json.dumps(image_checks, indent=2), encoding='utf-8')
        for fixture in manifest["fixtures"]:
            pdf_path = ROOT / "dist/pdf-fixtures" / fixture["filename"]
            for single in (False, True):
                page.set_input_files("#pdf", str(pdf_path))
                page.locator("#single").set_checked(single)
                with page.expect_download(timeout=60000) as event:
                    page.click("#convert")
                download = event.value
                target = OUT / download.suggested_filename
                download.save_as(str(target))
                if fixture["pageCount"] > 1:
                    with zipfile.ZipFile(target) as archive:
                        assert archive.testzip() is None
                        assert len(archive.namelist()) == fixture["pageCount"]
                        pages = [archive.read(name) for name in archive.namelist()]
                else:
                    pages = [target.read_bytes()]
                roots = [svg_size(svg, size) for svg, size in zip(pages, fixture["pageSizesPt"])]
                status = page.locator("#status").inner_text()
                assert "downloaded" in status, status
                if not single:
                    raster_matches(pdf_path, pages, page)
                if single and fixture["filename"].startswith("mcb-"):
                    assert not roots[0].findall(".//s:use", NS), "Export should resolve glyph references"
                    assert not roots[0].findall(".//s:image", NS), "Keep font as vectors"
                    original = ET.fromstring((OUT / fixture['filename'].replace('.pdf', '.svg')).read_bytes())
                    uses = original.findall('.//s:use', NS)
                    groups = roots[0].findall('.//s:g[@data-text]', NS)
                    combined = fixture['filename'] == 'mcb-fill-stroke.pdf'
                    if combined:
                        # Spaces have empty outlines and no engraving edges.
                        definitions = {n.get('id'): n.get('d') for n in original.findall('.//s:defs/s:path', NS)}
                        uses = [u for u in uses if definitions[u.get('{http://www.w3.org/1999/xlink}href')[1:]]]
                        assert len(uses) == 16, '8 glyphs each painted as both fill and stroke'
                        uses = list({(u.get('data-text'), u.get('transform')): u for u in uses}.values())
                        groups = [g for g in groups if g.find('s:path', NS).get('d')]
                    assert len(groups) == len(uses)
                    for use, group in zip(uses, groups):
                        assert group.get('data-text') == use.get('data-text')
                        assert group.get('transform') == use.get('transform') + ' translate(0 0)'
                    kept = 272 if fixture['filename'] == 'mcb-embedded.pdf' else 136
                    removed = 408 if combined else kept
                    assert f'{removed} repeated segments removed; {kept} segments retained.' in status
                    assert any('C' in node.get('d', '') for node in roots[0].findall('.//s:g/s:path', NS))
                if single and fixture["filename"] == "geometry-retrace.pdf":
                    result = page.evaluate("""svg => {
                      const root = new DOMParser().parseFromString(svg, 'image/svg+xml');
                      const paths = [...root.querySelectorAll('path')].filter(p => !p.closest('defs'));
                      const segments = paths.flatMap(p => LaserGeometry.parsePath(p.getAttribute('d')));
                      return {lines: segments.filter(s => s.cmd === 'L').length,
                        cubics: segments.filter(s => s.cmd === 'C').length,
                        length: segments.filter(s => s.cmd === 'L').reduce((n, s) => n + Math.hypot(s.points[1][0]-s.points[0][0],s.points[1][1]-s.points[0][1]), 0)};
                    }""", pages[0].decode())
                    assert result == {"lines": 6, "cubics": 1, "length": 640}, result
                if fixture["filename"] == "mixed-content.pdf":
                    images = roots[0].findall(".//s:image", NS)
                    assert not images, 'Pictures must be engraving geometry, not unsupported bitmap objects'
                    assert roots[0].findall('.//s:g[@data-laser-images]/s:path', NS)
                    assert '1 pictures converted to' in status
                    assert roots[0].findall(".//s:clipPath", NS)
                    if single:
                        assert "Clipping/masks retained" in status
                report.append({"file": fixture["filename"], "single": single, "status": status})
        # Recovery from invalid and password protected inputs, and no stale download.
        invalid = OUT / "invalid.pdf"
        invalid.write_bytes(b"not a PDF")
        with pymupdf.open(ROOT / 'dist/pdf-fixtures/mcb-native-fill.pdf') as doc:
            doc.save(OUT / 'locked.pdf', encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw='owner', user_pw='user')
        for name, text in [('invalid.pdf', 'Could not convert:'), ('locked.pdf', 'needs a password')]:
            page.set_input_files('#pdf', str(OUT / name))
            page.click('#convert')
            page.wait_for_function("text => document.querySelector('#status').textContent.includes(text)", arg=text)
            assert page.locator('#convert').is_enabled()
        page.set_input_files('#pdf', str(ROOT / 'dist/pdf-fixtures/mcb-native-fill.pdf'))
        with page.expect_download() as event:
            page.click('#convert')
        assert event.value.suggested_filename.endswith('.svg')
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / 'mobile.png'))
        page.set_viewport_size({'width': 1100, 'height': 780})
        page.screenshot(path=str(OUT / 'desktop.png'))
        assert not errors, errors
        assert not requests, requests
        browser.close()
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"PASS: {len(report)} offline PDF conversions, ZIP CRCs, dimensions, render comparisons, geometry, errors, recovery and mobile layout.\nReport: {OUT / 'report.json'}")


if __name__ == '__main__':
    main()
