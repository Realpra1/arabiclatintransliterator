# MCBs Compact Laser contour audit

Audited the font at repository commit `494c9b4` on 2026-10-30. Inspected a
vector contact sheet of all 129 mapped Unicode codepoints, examined the
quadratic geometry, and scanned all 125 glyph records for the confirmed
defect pattern. This font uses retraced, zero-area closed TrueType contours
to represent single strokes. Filling outlines is not an adequate inspection
method; stroke the paths without a fill.

## Confirmed repairs

| Character | Glyph | Defect | Repair |
| --- | --- | --- | --- |
| `o` U+006F | `o` | Bottom-left bowl turns back at `(176,-10)`, 95 units short of the start. | Insert on-curve `(271,-10)` between points 9 and 10. |
| `g` U+0067 | `g` | Top-left bowl turns back at `(169,523)`, 91 units short of the start. | Insert on-curve `(260,523)` between points 23 and 24. |
| `ó` U+00F3 | `oacute` | Contains the same broken bowl as `o`. | Insert the same join; retain the accent. |

Coordinates are in font units, with Y upwards (1024 units per em); point
indices refer to the original font and start at zero. The insertions restore
the intended quadratic arcs, rather than bridging the gaps with straight
lines. Every repaired bowl now forms a connected cycle when reverse
traversals are deduplicated. Bounds, spacing, character mappings, glyph order,
and all other glyph geometry remain unchanged.

The source's duplicated off-curve controls at each turnaround imply a point
at the control itself. The missing explicit on-curve point is why the
visible stroke has a gap even though the TrueType contour is formally closed.
Checking only whether an exported SVG ends with `Z` would miss this defect.

## Reviewed suspects left unchanged

- Lowercase `q` U+0071 has a complete bowl. Its two bowl contours describe
  the same closed loop in opposite directions, and meet the stem at
  `(480,343)`.
- Uppercase `Q` U+0051 likewise has a complete oval. Its two oval contours
  are exact reverse traversals. The tail runs from `(477,-58)` to
  `(712,-184)` and crosses the oval on the lower right. No missing join was
  found in the stored vector geometry.
- Intentional openings in letters such as `c`, `e`, and `s`, disconnected
  accents/dots, and normal interior space inside bowls were preserved.

No other glyph has the same repeated off-curve turnaround defect. This is a
targeted geometry audit, not a guarantee about every laser application's
font import, fill/raster rendering, or toolpath generation. A gap seen only
in such an application should be compared with the vector inspector.

## Reproduce and verify

The original is retained at `fonts/MCBs-Compact-Laser.original.ttf`.
The repaired file remains `MCBs-Compact-Laser.ttf`.

```text
python -m pip install fonttools
python scripts/repair-laser-font.py
python -m unittest discover -s tests -p test_laser_font.py -v
```

The script verifies the source hash before editing and refuses to overwrite
the original. It applies only the three reviewed insertions and preserves
the font timestamp, producing the same bytes each time.

| File | SHA-256 |
| --- | --- |
| Original | `e8dd198ac07d5f3828ce8642fd7917d51b3d37654de1d59eab8808301d545f37` |
| Repaired | `e4d91921c5bbba2e77278fe84d88bb7063a253a45158a628faa9f8fa0971d28b` |

The six Python regression tests verify the original hash, geometric cycle
closure, unchanged `q` and `Q`, the exact set of changed glyphs, unchanged
metrics/mappings/bounds, the absence of additional matching defects, and a
byte-identical rebuild. Tested with Python 3.12 and fontTools 4.68.0.

No engraving hardware or external laser software was used for this audit.
