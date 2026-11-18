# Offline PDF to SVG

Build once, then double-click **PDF to SVG.html**. The built file contains the
entire PDF engine and app. No server, Python, internet connection, or installation
is needed to use it in a current desktop Chrome, Edge, or Firefox browser.
Chrome is covered by the automated browser check.

Choose a PDF or SVG, set **Single stroke**, and click **Download SVG** or **Download
G-code (.gc)**. One page produces one file; multiple pages produce a ZIP with
numbered files. All PDF processing stays
in the browser. There is deliberately no preview or font-editing interface.

The default engraving feed is **700 mm/min**, matching the successful physical
single-pass test. The visible speed field remains editable.

**Mirror for back-of-glass engraving** is off by default. When enabled, it flips
the entire page horizontally, including text and pictures, without changing
page size, Y coordinates, power or feed. SVG and G-code downloads both include
the reflection; mirrored filenames end in `-mirrored`.

## SVG input

Open an SVG directly without a PDF conversion. Physical SVG dimensions are
preserved; px and unitless dimensions use 96 pixels per inch, while PDF pages
use 72 points per inch. ViewBox offsets and preserveAspectRatio are respected.
Basic shapes and elliptical arcs become paths, while existing Bezier paths,
glyph references, embedded pictures and our exported image-power metadata are
retained. Reopening an exported SVG does not rasterize its text or image lines.

SVG text must first be converted to paths in its authoring app. Unsupported SVG
features produce an explicit error rather than substituting fonts or silently
changing the engraving. Files must be self-contained; external images, fonts,
stylesheets and scripts are not loaded. Speed and per-line image power still
require the direct G-code download to reach the machine reliably.

## Output

- Unchecked: MuPDF vector conversion with text represented as vector paths.
- Checked: vector outlines become thin black strokes. Exact repeated segments,
  including reversed curves and partial collinear line overlaps, are removed
  within a path and across adjacent compatible paths. Identical overlapping
  sibling glyph objects are also removed, including headings painted with both
  fill and stroke by PDF synthetic bold.
- Text positions, glyph transforms, page rotation, cropping and physical size
  come from the PDF. Width and height are explicitly in millimetres; one PDF
  point is 25.4/72 mm. No font spacing or line-height settings are edited.
- Bezier control points stay control points. Curves are neither flattened nor
  replaced with control polygons. A retained curve uses original coordinates.
- Circles remain circles, with one traversal where their exact reverse is
  removed. Closed filled boundaries acquire implicit closing edges when needed.
- The pen is 0.1 PDF points (approximately 0.035 mm), adjusted for transforms.
  Actual engraving width is determined by the laser and its importer.

This is duplicate removal, **not centerline extraction**. Ordinary filled fonts
retain their outside/inside outlines. Nearby curves, mismatched curve controls,
and near-parallel strokes are kept. Overlapping objects across different groups
or transforms are not globally welded. Dashed paths are preserved unchanged;
changing their subpaths would move the dashes. Very large paths receive exact
duplicate removal but may skip partial overlap checks to bound quadratic work.
The download status reports these limits when applicable.

- In both modes, pictures become open horizontal engraving lines at approximately
  0.1 mm spacing (254 dpi). Transparency is composited over white; shades use
  reduced power by default, with black-and-white error-diffusion dithering as
  an alternative. Image transforms, clipping and masks
  are baked into the lines. Overlapping pictures are composited together once.
- Adjacent dark pixels share one line, white areas are skipped, and successive
  rows alternate direction. Each image line needs only one traversal; these are
  scan lines, not outlines or centerlines. Fine image detail is limited by the
  0.1 mm sampling grid. Large pages or excessive line counts produce an error
  instead of silently reducing detail.

**Finish connected areas** is the default image fill order. Pixel runs that
touch along an edge form an area; adjoining shades stay in the same area. Each
area is filled completely before moving to another, retaining every hatch line,
hole and power value. Spatial ordering and reversible area traversal reduce
travel between areas. This groups connected pixels, not semantic objects, and
does not replace horizontal hatching with concentric contours. **Scan rows**
retains the previous whole-page serpentine order. The status compares image-only
travel distance in both orders; it is not a machine runtime estimate. Routing
over 250,000 runs produces an explicit request to choose Scan rows instead.

**Variable power** maps grayscale darkness to 32 nonzero power levels plus
white/off. Black uses the selected maximum; approximately 50% gray uses half
that S value (S475 at maximum S950). Adjacent pixels with the same level share a
line. M4 still modulates the requested power with actual motion speed, and the
material's resulting brightness need not be linear. This mode replaces dithered
dots with shaded hatch lines and can require more engraving moves.

SVG lines display the gray shade and include `data-laser-power` metadata, which
this app's direct G-code exporter honors. Ordinary SVG importers, including the
audited LaserGRBL import workflow, do not necessarily honor per-path power;
use **Download G-code** for variable power. Text vectors retain their selected
power and are unaffected by the image options.

There is no OCR or image centerline extraction. Vector clipping and masks remain
SVG clipping and masks; the consuming application must support them.
There is no machine connection. Final etched tone depends on laser width, power and
material. Test a small picture before engraving a whole page.

## Direct G-code

The G-code button uses the same prepared SVG strokes, including image scan lines
and the Single stroke setting. It emits one pass with explicit G0/G1 XY moves in
millimetres, LF line endings, no Z coordinates, and an automatic `; Bounds:`
comment calculated from the actual rounded engraving endpoints. The comment is
metadata for a preview; it does not engrave a frame.

The visible **Engraving speed (mm/min)** and **Maximum power (S)** fields control
direct G-code. SVG importers set their own speed; rapid travel uses the machine's
G0 rate, not the engraving feed. Defaults are F700
and S950, matching the user's test file; supported S values are 1–1000. Output
uses M4 dynamic power, the known-working G17/G40/G21/G54/G90 startup and M8/M9,
sets S0 before every rapid travel, then ends with S0/M5, return to X0 Y0, and M2.
The origin stays at the PDF page's bottom-left, as in the SVG import workflow;
artwork is not moved to the origin or resized to the engraving bounds.

Quadratic and cubic curves are adaptively flattened with a 0.01 mm geometric
tolerance, then coordinates are rounded to 0.0001 mm. Image lines remain single
straight moves. Page boundaries and convex polygon vector clips trim paths
without creating extra boundary strokes. Glyph references and nested transforms
are resolved. Invisible artwork is skipped.

Direct output reports an error for unsupported vector effects, including masks,
filters, partial transparency, dashed paths, curved/concave clips, and inline
styles. It never silently ignores them; the SVG button remains available.
Picture masks/transparency are already handled by image conversion and do not
have this restriction. This is an engraving-path exporter, not filled-area
hatching or centerline extraction for ordinary fonts.

## Build and verification

From the app's source folder (`laser-export/` in the published repository), using
Python 3.12 or later:

```text
python scripts/build-pdf-export.py
```

The first build downloads MuPDF.js **1.28.1** from npm and verifies its pinned
SHA-512. Later builds use `.pdf-build/package.tgz`. The output is
`dist/PDF to SVG.html` (about 6.5 MB). Use `--output PATH` to select another filename.
App source is split into small modules; the distributable is one HTML file.

```text
node --test tests/pdf-geometry.test.mjs tests/pdf-raster.test.mjs tests/pdf-gcode.test.mjs
node --test tests/pdf-image-regions.test.mjs
python -m pip install playwright pymupdf==2.0
python scripts/check-pdf-export-browser.py
python scripts/check-pdf-gcode-browser.py
python scripts/check-svg-import-browser.py
node scripts/check-file-length.mjs
```

The browser check uses installed Chrome, opens the HTML via `file://`, and disables
network access. It tests twelve real PDF conversions, the updated embedded MCB font,
native fill and stroked text, curves/lines/partial overlaps, exact transforms,
image scan lines, transparency, masks, clipping, overlap, image references,
page rotation/cropping, multi-page ZIPs with valid CRCs,
invalid/encrypted files, recovery, and a narrow viewport. Ordinary SVG output is
rendered in Chrome and compared with the source PDF outside the dithered picture
areas. Image tests separately check coverage, placement and unique open lines.
Test artifacts and report:
`dist/pdf-export-checks/`. Fixtures are reproducibly generated by
`scripts/make-pdf-export-fixtures.py` and their expectations are in
`dist/pdf-fixtures/manifest.json`.

The G-code browser check uses those fixtures and tests both checkbox modes,
physical scale, curve sampling, clipping, glyph references, invisible artwork,
explicit failures, automatic bounds, laser-off travel, configurable settings,
multiple-page ZIPs, and offline operation. Results: `dist/gcode-checks/`.
Picture regressions additionally check connected-area completeness, unchanged
line/power coverage, shorter travel on separated shapes, proportional gray
power, text power preservation, zero-power travel, and visible speed controls.

## Reference and scope check

SVG input follows the SVG 2 coordinate-system rules (physical units, viewBox
mapping and aspect-ratio alignment): https://www.w3.org/TR/SVG2/coords.html .
The existing `svg.js`, `images.js`, `gcode-svg.js` and `gcode.js` pipeline at
682e12c was inspected and reused. New input normalization maps SVG dimensions
into its existing point coordinate system; reflection is applied after picture
conversion so text, pictures and reduced-power paths transform together.
The font contour audit in `docs/font-contour-audit.md` documents why duplicate
removal remains optional and no font metrics are changed. No separate project
wiki could be fetched during this change. Publication is limited to the laser
app and its checks; the transliterator application and mappings are unchanged.

The PDF export modules are AGPL-3.0-or-later, matching the embedded MuPDF library.
The complete license and upstream source information are included in the HTML's
**Licenses & source** download and in `LICENSE.txt`. This does not change the
license of unrelated repository files or fonts.
