"""Geometry checks for the actual checked-in TTF; run with unittest discover."""

from collections import Counter
import hashlib
import importlib.util
from pathlib import Path
from fractions import Fraction
import tempfile
import math
import sys
import unittest

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
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

    def test_advances_and_line_metrics_are_preserved(self):
        for tag in ("hhea", "OS/2"):
            self.assertEqual(self.original.getTableData(tag), self.fixed.getTableData(tag), tag)
        for name, (advance, bearing) in self.original["hmtx"].metrics.items():
            self.assertEqual(self.fixed["hmtx"][name], (advance, 47 if name == "i" else bearing))
        for field in ("unitsPerEm", "xMin", "yMin", "xMax", "yMax"):
            self.assertEqual(getattr(self.original["head"], field),
                             getattr(self.fixed["head"], field), field)

    def test_m_is_double_traced_but_control_polygon_export_creates_four_passes(self):
        for font in (self.original, self.fixed):
            glyphs = font.getGlyphSet()
            pen = SegmentPen(glyphs)
            glyphs["m"].draw(pen)
            segments = [segment for contour in pen.contours for segment in contour]
            counts = Counter(min(s, s[::-1]) for s in segments)
            self.assertEqual(Counter(counts.values()), {2: 11})
            # The supplied G-code follows cubic control polygons, not curves.
            # Converting each quadratic to equivalent cubic handles reproduces
            # its artificial shared vertical at the middle of m exactly.
            lines = []
            for segment in segments:
                if len(segment) == 2:
                    lines.append(segment)
                    continue
                start, control, end = segment
                c1 = tuple(Fraction(a) + Fraction(2, 3) * (b - a) for a, b in zip(start, control))
                c2 = tuple(Fraction(a) + Fraction(2, 3) * (b - a) for a, b in zip(end, control))
                lines.extend(zip((start, c1, c2), (c1, c2, end)))
            polygon_counts = Counter(min(s, s[::-1]) for s in lines)
            shared = ((407, 262), (407, Fraction(1004, 3)))
            self.assertEqual(polygon_counts[shared], 4)

    def test_only_the_eight_reviewed_glyphs_change(self):
        changed = {
            name for name in self.original.getGlyphOrder()
            if self.original["glyf"][name].compile(self.original["glyf"]) !=
            self.fixed["glyf"][name].compile(self.fixed["glyf"])
        }
        self.assertEqual(changed, set(repair.REPAIRS) | {"i", "j", "a", "aacute", "amacron"})
        self.assertEqual(self.original.getGlyphOrder(), self.fixed.getGlyphOrder())
        self.assertEqual(self.original.getBestCmap(), self.fixed.getBestCmap())
        for name in repair.REPAIRS:
            before, after = self.original["glyf"][name], self.fixed["glyf"][name]
            self.assertEqual(before.numberOfContours, after.numberOfContours)
            self.assertEqual((before.xMin, before.yMin, before.xMax, before.yMax),
                             (after.xMin, after.yMin, after.xMax, after.yMax))

    def test_dots_are_identical_120_unit_circles_above_unchanged_stems(self):
        dots = []
        for name, (center_x, stem_points) in repair.DOT_STEMS.items():
            before, after = self.original["glyf"][name], self.fixed["glyf"][name]
            self.assertEqual(list(before.coordinates[:stem_points]), list(after.coordinates[:stem_points]))
            self.assertEqual(list(before.flags[:stem_points]), list(after.flags[:stem_points]))
            gs = self.fixed.getGlyphSet()
            pen = SegmentPen(gs)
            gs[name].draw(pen)
            self.assertEqual(len(pen.contours), 3)
            forward, reverse = pen.contours[1:]
            self.assertEqual(forward, [s[::-1] for s in reverse[::-1]])
            dot = [tuple((x - center_x, y - repair.DOT_CENTER_Y) for x, y in s) for s in forward]
            dots.append(dot)
            all_points = [p for s in dot for p in s]
            self.assertEqual((min(x for x, y in all_points), max(x for x, y in all_points)), (-60, 60))
            self.assertEqual((min(y for x, y in all_points), max(y for x, y in all_points)), (-60, 60))
            for start, control, end in dot:
                for step in range(21):
                    t = step / 20
                    point = tuple((1-t)**2*a + 2*t*(1-t)*b + t*t*c for a, b, c in zip(start, control, end))
                    self.assertLess(abs(math.hypot(*point) - 60), 0.7)
            counts = Counter(min(s, s[::-1]) for contour in (forward, reverse) for s in contour)
            self.assertEqual(Counter(counts.values()), {2: 8})
        self.assertEqual(dots[0], dots[1])

    def test_smoothed_a_variants_share_body_and_preserve_spacing_and_accents(self):
        bodies = []
        for name, accent in {"a": None, "aacute": ((120, 610), (298, 730)),
                             "amacron": ((30, 720), (298, 720))}.items():
            before, after = self.original["glyf"][name], self.fixed["glyf"][name]
            self.assertEqual(self.original["hmtx"][name], self.fixed["hmtx"][name])
            self.assertEqual(self.fixed["hmtx"][name], (432, 30))
            self.assertEqual((before.xMin, before.yMin, before.xMax, before.yMax),
                             (after.xMin, after.yMin, after.xMax, after.yMax))
            gs = self.fixed.getGlyphSet()
            pen = SegmentPen(gs)
            gs[name].draw(pen)
            bodies.append(pen.contours[:2])
            self.assertEqual(len(pen.contours), 3 if accent else 2)
            for contour in pen.contours[:2]:
                counts = Counter(min(s, s[::-1]) for s in contour)
                self.assertEqual(set(counts.values()), {2})
            body = [s for contour in pen.contours[:2] for s in contour]
            self.assertTrue(any(len(s) == 3 for s in body), "Curves replace hand-drawn facets")
            self.assertIn(((298, 390), (298, 12)), body)
            self.assertIn((66, 390), [s[0] for s in body])
            for join in ((298, 343), (298, 143)):
                self.assertIn(join, [p for s in body for p in (s[0], s[-1])])
            if accent:
                self.assertEqual(pen.contours[-1], [accent, accent[::-1]])
        self.assertEqual(bodies[0], bodies[1])
        self.assertEqual(bodies[0], bodies[2])

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
