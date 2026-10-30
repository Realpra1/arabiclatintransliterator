"""The user-approved smoothed hooked a, converted to closed TrueType strokes.

Coordinates match the 'Smoothed original form' preview. Each open stroke is
returned over exactly the same points; no single-pass format is introduced.
"""
from fontTools.misc.roundTools import otRound
from fontTools.pens.basePen import BasePen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen


# Font coordinates (Y up), copied from the accepted preview's cubic paths.
STROKES = [
    ((66, 390), [
        ("C", ((80, 450), (136, 491), (195, 491))),
        ("C", ((255, 491), (298, 449), (298, 390))),
        ("L", ((298, 12),)),
    ]),
    ((298, 343), [
        ("C", ((254, 299), (220, 262), (164, 262))),
        ("C", ((90, 262), (30, 196), (30, 120))),
        ("C", ((30, 58), (78, 12), (142, 12))),
        ("C", ((211, 12), (249, 61), (298, 143))),
    ]),
]
ACCENTS = {"a": None, "aacute": ((120, 610), (298, 730)),
           "amacron": ((30, 720), (298, 720))}


class QuadraticSegments(BasePen):
    def __init__(self):
        super().__init__(None)
        self.segments = []

    def _moveTo(self, point):
        pass

    def _lineTo(self, point):
        self.segments.append((self._getCurrentPoint(), point))

    def _qCurveToOne(self, control, point):
        self.segments.append((self._getCurrentPoint(), control, point))

    def _endPath(self):
        pass


def replace_a_variants(font):
    for name, accent in ACCENTS.items():
        if font["hmtx"][name] != (432, 30) or font["glyf"][name].program.getBytecode():
            raise ValueError(f"{name}: unexpected spacing or point-indexed instructions")
        pen = TTGlyphPen(None)
        for start, commands in STROKES:
            recorded = QuadraticSegments()
            converter = Cu2QuPen(recorded, max_err=0.25, all_quadratic=True)
            converter.moveTo(start)
            for command, points in commands:
                (converter.curveTo if command == "C" else converter.lineTo)(*points)
            converter.endPath()
            # Round once, then reverse these same points to avoid asymmetric
            # return curves after cubic-to-quadratic approximation.
            forward = [tuple(tuple(otRound(v) for v in p) for p in s) for s in recorded.segments]
            pen.moveTo(forward[0][0])
            for segment in forward + [s[::-1] for s in forward[::-1]]:
                (pen.lineTo if len(segment) == 2 else pen.qCurveTo)(*segment[1:])
            pen.closePath()
        if accent:
            pen.moveTo(accent[0])
            pen.lineTo(accent[1])
            pen.closePath()
        glyph = pen.glyph()
        glyph.recalcBounds(font["glyf"])
        font["glyf"][name] = glyph
