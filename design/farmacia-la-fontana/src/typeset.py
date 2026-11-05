"""Text -> SVG outline paths (HarfBuzz shaping + kerning, variable-font instances).

Every wordmark in this project is converted to outlines so the SVG files
render identically everywhere, with no font dependency.
"""
from functools import lru_cache
from pathlib import Path

import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.varLib.instancer import instantiateVariableFont

FONTS = Path(__file__).resolve().parent.parent / "fonts"


@lru_cache(maxsize=None)
def _load(name, wght):
    path = FONTS / name
    tt = TTFont(path)
    if wght is not None and "fvar" in tt:
        tt = instantiateVariableFont(tt, {"wght": wght}, inplace=False)
    blob = hb.Blob.from_file_path(str(path))
    face = hb.Face(blob)
    font = hb.Font(face)
    if wght is not None:
        font.set_variations({"wght": wght})
    return tt, font


def shape(name, text, size, wght=None, tracking=0.0, features=None):
    """Return (svg_path_d, advance_width, units_scale) with baseline at y=0."""
    tt, font = _load(name, wght)
    upem = tt["head"].unitsPerEm
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, features or {"kern": True, "liga": True})
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    s = size / upem
    x = 0.0
    parts = []
    n = len(buf.glyph_infos)
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        gname = order[info.codepoint]
        pen = SVGPathPen(gs)
        # flip y: font units are y-up, SVG is y-down
        tp = TransformPen(pen, (s, 0, 0, -s, x + pos.x_offset * s, -pos.y_offset * s))
        gs[gname].draw(tp)
        d = pen.getCommands()
        if d:
            parts.append(d)
        x += pos.x_advance * s
        if i < n - 1:
            x += tracking * size
    return " ".join(parts), x


def cap_height(name, size, wght=None):
    tt, _ = _load(name, wght)
    os2 = tt["OS/2"]
    return getattr(os2, "sCapHeight", 0.7 * tt["head"].unitsPerEm) * size / tt["head"].unitsPerEm


def x_height(name, size, wght=None):
    tt, _ = _load(name, wght)
    os2 = tt["OS/2"]
    return getattr(os2, "sxHeight", 0.45 * tt["head"].unitsPerEm) * size / tt["head"].unitsPerEm
