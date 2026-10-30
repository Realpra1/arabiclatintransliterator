"""Reproduce reviewed bowl repairs and standardized i/j dots from the source.

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

DOT_DIAMETER = 120
DOT_CENTER_Y = 680
DOT_STEMS = {"i": (107, 2), "j": (135, 8)}


def standardize_dots(font):
    # Eight symmetric quadratic arcs, rounded to the integer font grid.
    # A second, reversed contour retains the original double-stroke encoding.
    circle = [(0, 60), (24, 60), (42, 42), (60, 24),
              (60, 0), (60, -24), (42, -42), (24, -60),
              (0, -60), (-24, -60), (-42, -42), (-60, -24),
              (-60, 0), (-60, 24), (-42, 42), (-24, 60)]
    forward = [(point, int(index % 2 == 0)) for index, point in enumerate(circle)]
    reverse = [forward[0], *forward[:0:-1]]
    for name, (center_x, stem_points) in DOT_STEMS.items():
        glyph = font["glyf"][name]
        if glyph.numberOfContours != 3 or glyph.endPtsOfContours[0] != stem_points - 1 or glyph.program.getBytecode():
            raise ValueError(f"{name}: unexpected stem or point-indexed instructions")
        coordinates = list(glyph.coordinates[:stem_points])
        flags = list(glyph.flags[:stem_points])
        ends = [stem_points - 1]
        for contour in (forward, reverse):
            coordinates.extend((x + center_x, y + DOT_CENTER_Y) for (x, y), _ in contour)
            flags.extend(flag for _, flag in contour)
            ends.append(len(coordinates) - 1)
        glyph.coordinates = GlyphCoordinates(coordinates)
        glyph.flags = array("B", flags)
        glyph.endPtsOfContours = ends
        glyph.recalcBounds(font["glyf"])
        # The wider i dot extends left of its former ink bounds. Match the
        # bearing to xMin so renderers do not shift the unchanged stem right.
        advance, _ = font["hmtx"][name]
        font["hmtx"][name] = (advance, glyph.xMin)


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
        standardize_dots(font)
        font.save(output)
    finally:
        font.close()
    return hashlib.sha256(output.read_bytes()).hexdigest()


if __name__ == "__main__":
    digest = repair_font()
    print("Repaired g/o/oacute; standardized i/j dots at diameter 120; preserved advances and line metrics.")
    print(f"SHA-256 {digest}  {OUTPUT.name}")
