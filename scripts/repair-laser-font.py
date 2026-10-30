"""Reproduce the three reviewed bowl repairs from the preserved source font.

Requires Python 3 and fontTools (python -m pip install fonttools).
Run from any directory: python scripts/repair-laser-font.py
"""

from array import array
import hashlib
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "fonts" / "MCBs-Compact-Laser.original.ttf"
OUTPUT = ROOT / "MCBs-Compact-Laser.ttf"
SOURCE_SHA256 = "e8dd198ac07d5f3828ce8642fd7917d51b3d37654de1d59eab8808301d545f37"

# This is a reviewed repair list, not a heuristic that closes arbitrary strokes.
# name: (insertion index, repeated off-curve control, missing on-curve join)
REPAIRS = {
    "g": (24, (169, 523), (260, 523)),
    "o": (10, (176, -10), (271, -10)),
    "oacute": (10, (176, -10), (271, -10)),
}


def repair_font(source=SOURCE, output=OUTPUT):
    source, output = Path(source), Path(output)
    if source.resolve() == output.resolve():
        raise ValueError("Keep the original font: source and output must differ")
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("Source font differs from the reviewed original; audit it first")
    font = TTFont(source, recalcBBoxes=False, recalcTimestamp=False)
    try:
        for name, (index, control, join) in REPAIRS.items():
            glyph = font["glyf"][name]
            coordinates, flags = list(glyph.coordinates), list(glyph.flags)
            if (coordinates[index - 1:index + 1] != [control, control]
                    or flags[index - 1] & 1 or flags[index] & 1
                    or glyph.program.getBytecode()):
                raise ValueError(f"{name}: unexpected geometry or point-indexed instructions")
            coordinates.insert(index, join)
            flags.insert(index, 1)  # An explicit on-curve point, not a control point.
            glyph.coordinates = GlyphCoordinates(coordinates)
            glyph.flags = array("B", flags)
            glyph.endPtsOfContours = [
                end + (end >= index) for end in glyph.endPtsOfContours
            ]
        font.save(output)
    finally:
        font.close()
    return hashlib.sha256(output.read_bytes()).hexdigest()


if __name__ == "__main__":
    digest = repair_font()
    print("Repaired g, o, oacute; preserved all other glyphs and spacing.")
    print(f"SHA-256 {digest}  {OUTPUT.name}")
