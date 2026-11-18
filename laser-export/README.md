# Offline laser export app

This is a separate app from the Arabic transliterator.

**[Download the standalone HTML](https://github.com/Realpra1/arabiclatintransliterator/releases/download/laser-export-v1.0.0/PDF-to-SVG-and-Gcode.html)**,
save it locally, and double-click it. No installation, server, internet connection
or companion files are needed to use the downloaded HTML.

- Open a PDF or a self-contained SVG directly.
- Download SVG paths or ready-to-use `.gc` G-code.
- Default engraving speed: **700 mm/min**; maximum power: **S950**.
- Optional left-right mirroring for back-of-glass engraving, off by default.
- Optional removal of exact duplicate strokes; no font-spacing changes.
- Images fill connected areas and use reduced power for gray shades by default.
- M4, explicit G0/G1 moves, automatic bounds, LF endings, no Z movement, and
  laser-off travel follow the successful compatibility format.

Use direct G-code to preserve variable picture power. SVG text must be converted
to paths in its authoring app; unsupported SVG features are reported explicitly.
The app does not connect to or operate the machine.

Source, supported features, licensing, and build/test commands:
**[pdf-export/README.md](pdf-export/README.md)**.

The source and tests are contained in this folder. Test fixtures use the
repository's existing `MCBs-Compact-Laser.ttf`; the standalone HTML needs no
installed font or other repository file. The transliterator app is unchanged.
