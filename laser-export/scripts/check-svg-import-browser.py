"""Offline SVG file picker and mirror tests. Requires built app and PDF fixtures."""
from pathlib import Path
import importlib.util
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/svg-import-checks'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location('gcode_checks', ROOT / 'scripts/check-pdf-gcode-browser.py')
    checks = importlib.util.module_from_spec(spec); spec.loader.exec_module(checks)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(offline=True, accept_downloads=True)
        page = context.new_page(); requests = []
        page.on('request', lambda r: requests.append(r.url) if r.url.startswith(('http:', 'https:')) else None)
        page.goto((ROOT / 'dist/PDF to SVG.html').as_uri())
        page.wait_for_function("document.querySelector('#status').textContent === 'Choose a PDF or SVG to begin.'", timeout=60000)
        assert page.locator('#feed').input_value() == '700'
        assert not page.locator('#mirror').is_checked()
        input_checks = page.evaluate((ROOT / 'tests/svg-input-browser.js').read_text(encoding='utf-8'))
        (OUT / 'input-checks.json').write_text(json.dumps(input_checks, indent=2))
        mirror_checks = page.evaluate((ROOT / 'tests/pdf-mirror-browser.js').read_text(encoding='utf-8'))
        (OUT / 'mirror-checks.json').write_text(json.dumps(mirror_checks, indent=2))
        # Asymmetric artwork makes mirroring, scale and page-offset errors visible.
        source = OUT / 'shapes.svg'
        source.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><g fill="none" stroke="black"><rect x="10" y="5" width="20" height="10"/><circle cx="60" cy="20" r="5"/><path d="M70 10A10 5 0 0 1 90 10"/></g><g data-laser-images="1"><path fill="none" stroke="rgb(128,128,128)" data-laser-power="0.5" d="M10 40L20 40"/></g></svg>')
        results = []
        for mirrored in [False, True]:
            page.locator('#mirror').set_checked(mirrored)
            page.set_input_files('#pdf', str(source))
            with page.expect_download() as event: page.click('#gcode')
            target = OUT / event.value.suggested_filename; event.value.save_as(str(target))
            data = target.read_bytes(); report = checks.inspect(data)
            assert b'F700' in data and b'F1000' not in data and b'S475\n' in data
            assert ('-mirrored' in target.name) == mirrored
            results.append(report)
        assert abs(results[0]['bounds'][0] + results[1]['bounds'][2] - 100) < .0002
        assert abs(results[0]['bounds'][2] + results[1]['bounds'][0] - 100) < .0002
        assert results[0]['moves'] == results[1]['moves']
        # Direct SVG-to-SVG download is also mirrored and retains physical size.
        with page.expect_download() as event: page.click('#convert')
        svg_output = Path(event.value.path()).read_text(encoding='utf-8')
        assert 'data-laser-mirror="horizontal"' in svg_output
        import xml.etree.ElementTree as ET
        assert abs(float(ET.fromstring(svg_output).get('width').removesuffix('mm')) - 100) < 1e-9
        # PDFs continue to work with the same optional whole-page mirror.
        page.set_input_files('#pdf', str(ROOT / 'dist/pdf-fixtures/mcb-native-fill.pdf'))
        with page.expect_download() as event: page.click('#gcode')
        checks.inspect(Path(event.value.path()).read_bytes())
        assert '-mirrored.gc' in event.value.suggested_filename
        # Do not substitute local fonts or execute active SVG content.
        for body, message in [('<text x="0" y="20">Hello</text>', 'text'), ('<script>alert(1)</script>', 'script')]:
            invalid = OUT / 'unsupported.svg'; invalid.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + body + '</svg>')
            page.set_input_files('#pdf', str(invalid)); page.click('#gcode')
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Could not convert:')")
            assert message in page.locator('#status').inner_text().lower()
        page.set_input_files('#pdf', str(source))
        with page.expect_download() as event: page.click('#gcode')
        checks.inspect(Path(event.value.path()).read_bytes())
        assert not requests, requests
        browser.close()
    (OUT / 'report.json').write_text(json.dumps(results, indent=2))
    print('PASS: SVG file input, physical scale, shapes/arcs, power preservation, SVG/GC mirroring, 700 default, PDF fallback, rejection/recovery, offline.')


if __name__ == '__main__':
    main()
