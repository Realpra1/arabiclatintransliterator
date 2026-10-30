"""Geometry checks for the actual checked-in TTF; run with unittest discover."""

from collections import Counter
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("repair", ROOT / "scripts/repair-laser-font.py")
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class SegmentPen(BasePen):
    """Expand implied quadratic points, retaining exact geometric segments."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.contours = []

    def _moveTo(self, point):
        self.start = point
        self.contours.append([])

    def _lineTo(self, point):
        if self._getCurrentPoint() != point:
            self.contours[-1].append((self._getCurrentPoint(), point))

    def _qCurveToOne(self, control, point):
        self.contours[-1].append((self._getCurrentPoint(), control, point))

    def _closePath(self):
        self._lineTo(self.start)


def bowl_graph(font, name, contour):
    """Deduplicate reverse traversals, then count degrees and connected parts."""
    glyph_set = font.getGlyphSet()
    pen = SegmentPen(glyph_set)
    glyph_set[name].draw(pen)
    segments = {min(segment, segment[::-1]) for segment in pen.contours[contour]}
    neighbors = {}
    for segment in segments:
        a, b = segment[0], segment[-1]
        neighbors.setdefault(a, set()).add(b)
        neighbors.setdefault(b, set()).add(a)
    remaining, components = set(neighbors), 0
    while remaining:
        todo = [remaining.pop()]
        components += 1
        while todo:
            for neighbor in neighbors[todo.pop()] & remaining:
                remaining.remove(neighbor)
                todo.append(neighbor)
    return Counter(len(edges) for edges in neighbors.values()), components


class LaserFontTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = TTFont(repair.SOURCE, recalcBBoxes=False, recalcTimestamp=False)
        cls.fixed = TTFont(repair.OUTPUT, recalcBBoxes=False, recalcTimestamp=False)

    @classmethod
    def tearDownClass(cls):
        cls.original.close()
        cls.fixed.close()

    def test_original_is_preserved(self):
        self.assertEqual(hashlib.sha256(repair.SOURCE.read_bytes()).hexdigest(),
                         repair.SOURCE_SHA256)

    def test_repaired_bowls_are_connected_cycles(self):
        # A TTF contour is always closed, even when its retraced visible stroke
        # has a gap. Check the unique geometric segments, not the Z command.
        for name, contour in [("g", 1), ("o", 0), ("oacute", 0)]:
            with self.subTest(glyph=name):
                before, before_components = bowl_graph(self.original, name, contour)
                after, after_components = bowl_graph(self.fixed, name, contour)
                self.assertEqual(before[1], 2, "Original must reproduce the open bowl")
                self.assertEqual(set(after), {2}, "Every point must join two segments")
                self.assertEqual((before_components, after_components), (1, 1))

    def test_q_and_Q_were_already_closed_and_remain_unchanged(self):
        for name in ("q", "Q"):
            with self.subTest(glyph=name):
                degrees, components = bowl_graph(self.original, name, 1)
                self.assertEqual(set(degrees), {2})
                self.assertEqual(components, 1)
                self.assertEqual(self.original["glyf"][name].compile(self.original["glyf"]),
                                 self.fixed["glyf"][name].compile(self.fixed["glyf"]))

    def test_only_the_three_reviewed_glyphs_change(self):
        changed = {
            name for name in self.original.getGlyphOrder()
            if self.original["glyf"][name].compile(self.original["glyf"]) !=
            self.fixed["glyf"][name].compile(self.fixed["glyf"])
        }
        self.assertEqual(changed, set(repair.REPAIRS))
        self.assertEqual(self.original.getGlyphOrder(), self.fixed.getGlyphOrder())
        self.assertEqual(self.original.getBestCmap(), self.fixed.getBestCmap())
        self.assertEqual(self.original["hmtx"].metrics, self.fixed["hmtx"].metrics)
        for name in repair.REPAIRS:
            before, after = self.original["glyf"][name], self.fixed["glyf"][name]
            self.assertEqual(before.numberOfContours, after.numberOfContours)
            self.assertEqual((before.xMin, before.yMin, before.xMax, before.yMax),
                             (after.xMin, after.yMin, after.xMax, after.yMax))

    def test_no_other_repeated_off_curve_turnarounds(self):
        candidates = set()
        for name in self.original.getGlyphOrder():
            glyph = self.original["glyf"][name]
            if glyph.isComposite() or not glyph.numberOfContours:
                continue
            for index in range(len(glyph.coordinates) - 1):
                if (index not in glyph.endPtsOfContours
                        and glyph.coordinates[index] == glyph.coordinates[index + 1]
                        and not glyph.flags[index] & 1 and not glyph.flags[index + 1] & 1):
                    candidates.add(name)
        self.assertEqual(candidates, set(repair.REPAIRS))

    def test_rebuild_is_byte_reproducible_and_rejects_changed_source(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "rebuilt.ttf"
            repair.repair_font(output=output)
            self.assertEqual(output.read_bytes(), repair.OUTPUT.read_bytes())
            with self.assertRaisesRegex(ValueError, "audit it first"):
                repair.repair_font(source=repair.OUTPUT, output=output)
        with self.assertRaisesRegex(ValueError, "must differ"):
            repair.repair_font(output=repair.SOURCE)


if __name__ == "__main__":
    unittest.main()
