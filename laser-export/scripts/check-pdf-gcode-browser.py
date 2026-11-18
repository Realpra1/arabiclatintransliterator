"""Offline direct G-code downloads from real PDFs; no device connection."""
from pathlib import Path
import json
import re
import zipfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/gcode-checks'


def inspect(data):
    assert b'\r' not in data and data.endswith(b'\n')
    code = data.decode()
    assert 'G00 G17 G40 G21 G54\nG90\nM4\nM8\nS0\n' in code
    assert code.endswith('M9\nG1 S0\nM5\nG90\nG0 X0 Y0\nM2\n')
    assert not re.search(r'\bZ[-\d]', code)
    power = 0
    position = (0, 0)
    points = []
    moves = 0
    for line in code.splitlines():
        if line.startswith(';'):
            continue
        words = dict((a, float(b)) for a, b in re.findall(r'([A-Z])(-?[\d.]+)', line))
        power = words.get('S', power)
        if 'X' in words or 'Y' in words:
            assert 'G' in words and 'X' in words and 'Y' in words, line
            following = (words['X'], words['Y'])
            if words['G'] == 0:
                assert power == 0, line
            elif words['G'] == 1:
                assert power > 0 and words['F'] > 0
                assert following != position
                points.extend([position, following])
                moves += 1
            position = following
    assert points
    bounds = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
    declared = list(map(float, re.search(r'; Bounds: X([\d.-]+) Y([\d.-]+) to X([\d.-]+) Y([\d.-]+)', code).groups()))
    assert bounds == declared
    return {'moves': moves, 'bounds': bounds}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(offline=True, accept_downloads=True)
        page = context.new_page()
        requests, errors = [], []
        page.on('request', lambda r: requests.append(r.url) if r.url.startswith(('https:', 'http:')) else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto((ROOT / 'dist/PDF to SVG.html').as_uri())
        page.wait_for_function("document.querySelector('#status').textContent === 'Choose a PDF or SVG to begin.'", timeout=60000)
        assert page.locator('#feed').input_value() == '700'
        assert not page.locator('#mirror').is_checked()
        page.select_option('#image-fill', 'rows'); page.select_option('#image-shading', 'dither')
        assert page.locator('#feed').is_visible() and page.locator('#power').is_visible()
        assert page.locator('#gcode').is_disabled()
        checks = page.evaluate((ROOT / 'tests/pdf-gcode-browser.js').read_text(encoding='utf-8'))
        picture_checks = page.evaluate((ROOT / 'tests/pdf-image-power-browser.js').read_text(encoding='utf-8'))
        (OUT / 'picture-power-checks.json').write_text(json.dumps(picture_checks, indent=2))
        (OUT / 'geometry-checks.json').write_text(json.dumps(checks, indent=2))
        for filename in ['mcb-embedded.pdf', 'mcb-native-fill.pdf', 'mcb-fill-stroke.pdf', 'geometry-retrace.pdf', 'mixed-content.pdf', 'multipage-rotated-cropped.pdf']:
            path = ROOT / 'dist/pdf-fixtures' / filename
            for single in [False, True]:
                page.set_input_files('#pdf', str(path))
                page.locator('#single').set_checked(single)
                with page.expect_download(timeout=120000) as event:
                    page.click('#gcode')
                target = OUT / event.value.suggested_filename
                event.value.save_as(str(target))
                if target.suffix == '.zip':
                    with zipfile.ZipFile(target) as archive:
                        assert archive.testzip() is None
                        assert all(name.endswith('.gc') for name in archive.namelist())
                        results = [inspect(archive.read(name)) for name in archive.namelist()]
                        assert len(results) > 1
                else:
                    assert target.suffix == '.gc'
                    results = [inspect(target.read_bytes())]
                report.append({'pdf': path.name, 'single': single, 'pages': results})
        page.locator('#feed').fill('800'); page.locator('#power').fill('700')
        page.set_input_files('#pdf', str(ROOT / 'dist/pdf-fixtures/mcb-native-fill.pdf'))
        with page.expect_download() as event:
            page.click('#gcode')
        data = Path(event.value.path()).read_bytes()
        inspect(data)
        assert b'F800' in data and b'S700' in data and b'F1000' not in data and b'S950' not in data
        assert 'Speed 800 mm/min' in page.locator('#status').inner_text()
        downloads = []
        page.on('download', lambda d: downloads.append(d))
        page.locator('#power').fill('1001'); page.click('#gcode')
        page.wait_for_function("document.querySelector('#status').textContent.includes('from 1 to 1000')")
        assert page.locator('#gcode').is_enabled() and not downloads
        page.locator('#power').fill('950')
        with page.expect_download() as event:
            page.click('#gcode')
        inspect(Path(event.value.path()).read_bytes())
        page.select_option('#image-fill', 'regions'); page.select_option('#image-shading', 'power')
        page.set_input_files('#pdf', str(ROOT / 'dist/pdf-fixtures/mixed-content.pdf'))
        with page.expect_download() as event:
            page.click('#gcode')
        new_data = Path(event.value.path()).read_bytes()
        inspect(new_data)
        assert '-areas-power.gc' in event.value.suggested_filename
        assert any(0 < int(s) < 950 for s in re.findall(rb'(?:^|\n)S(\d+)', new_data))
        assert 'connected areas' in page.locator('#status').inner_text()
        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / 'mobile.png'))
        assert not requests and not errors, (requests, errors)
        browser.close()
    (OUT / 'report.json').write_text(json.dumps(report, indent=2))
    print(f'PASS: {len(checks)} geometry checks, {len(report)} offline PDF-to-G-code downloads, ZIPs, settings, validation, recovery and mobile layout.')


if __name__ == '__main__':
    main()
