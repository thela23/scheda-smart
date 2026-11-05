"""Build the Farmacia La Fontana logo variants as clean, outlined SVG files."""
from pathlib import Path

from typeset import shape, cap_height

OUT = Path(__file__).resolve().parent.parent / "svg"
OUT.mkdir(exist_ok=True)

# ---- colour tokens -------------------------------------------------------
GREEN = "#1F5A3E"     # verde farmacia, deep bottle green
GREEN_LIGHT = "#2F7A55"
CREAM = "#F5EFE2"     # travertine paper
STONE = "#B89B6A"     # travertine / fountain stone
INK = "#1A1A1A"

SERIF = "EBGaramond[wght].ttf"
DISPLAY = "CormorantGaramond[wght].ttf"
SANS_M = "AlegreyaSans-Medium.ttf"
SANS_B = "AlegreyaSans-Bold.ttf"


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
            f'width="{w:.0f}" height="{h:.0f}">{rect}{body}</svg>')


def save(name, w, h, body, bg=None):
    (OUT / f"{name}.svg").write_text(svg(w, h, body, bg))


# ==========================================================================
# SYMBOL A — "Croce Fontana": pharmacy Greek cross with the fountain carved
# out in negative space. 100 x 100 box.
# ==========================================================================
def cross_path(r=7):
    a, b = 33, 67  # arm edges
    # Greek cross, outer corners rounded by r, inner corners sharp
    return (f"M{a+r},0 H{b-r} Q{b},0 {b},{r} V{a} H{100-r} Q100,{a} 100,{a+r} "
            f"V{b-r} Q100,{b} {100-r},{b} H{b} V{100-r} Q{b},100 {b-r},100 "
            f"H{a+r} Q{a},100 {a},{100-r} V{b} H{r} Q0,{b} 0,{b-r} "
            f"V{a+r} Q0,{a} {r},{a} H{a} V{r} Q{a},0 {a+r},0 Z")


def fountain_cut(sw=4.2, detail=True):
    """Fountain drawn as strokes, used as a knockout mask inside the cross."""
    jet = ('<path d="M50 50 V14"/>'
           '<path d="M50 16 C 40 16.5, 34 26, 31.5 44"/>'
           '<path d="M50 16 C 60 16.5, 66 26, 68.5 44"/>')
    basin = ('<path d="M12 50 H88"/>'
             '<path d="M19 50 C 25 62.5, 75 62.5, 81 50"/>')
    foot = ('<path d="M50 59 V81"/>'
            '<path d="M41 86 H59"/>')
    inner = jet + basin + foot if detail else basin + '<path d="M50 50 V20"/>'
    return (f'<g fill="none" stroke="#000" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round">{inner}</g>')


def symbol_cross(x, y, size, color=GREEN, uid="a", detail=True, sw=4.2):
    s = size / 100
    return (f'<defs><mask id="m{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
            f'<rect width="100" height="100" fill="#fff"/>{fountain_cut(sw, detail)}</mask></defs>'
            f'<g transform="translate({x:.2f},{y:.2f}) scale({s:.4f})">'
            f'<path d="{cross_path()}" fill="{color}" mask="url(#m{uid})"/></g>')


# ==========================================================================
# SYMBOL B — "Fontana di piazza": monoline fountain in a ring. 100 x 100.
# ==========================================================================
def symbol_ring(x, y, size, color=GREEN, sw=3.0, ring=True):
    s = size / 100
    body = (
        (f'<circle cx="50" cy="50" r="46.5"/>' if ring else "")
        # jet and falling sprays
        + '<path d="M50 41 V19"/>'
        + '<path d="M50 20 C 38 21, 31 31, 29.5 47"/>'
        + '<path d="M50 20 C 62 21, 69 31, 70.5 47"/>'
        # upper bowl
        + '<path d="M40 41 H60"/><path d="M42.5 41 C 44 46, 56 46, 57.5 41"/>'
        + '<path d="M50 45.5 V58"/>'
        # lower basin
        + '<path d="M22 58 H78"/><path d="M25 58 C 29 70, 71 70, 75 58"/>'
        + '<path d="M50 67 V76"/><path d="M41 79 H59"/>'
    )
    return (f'<g transform="translate({x:.2f},{y:.2f}) scale({s:.4f})" fill="none" '
            f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round" '
            f'stroke-linejoin="round">{body}</g>')


# ==========================================================================
# helpers for type
# ==========================================================================
def text(font, string, size, x, y, color, wght=None, tracking=0.0, anchor="start"):
    d, w = shape(font, string, size, wght=wght, tracking=tracking)
    if anchor == "middle":
        x -= w / 2
    elif anchor == "end":
        x -= w
    return f'<path transform="translate({x:.2f},{y:.2f})" d="{d}" fill="{color}"/>', w


def measure(font, string, size, wght=None, tracking=0.0):
    return shape(font, string, size, wght=wght, tracking=tracking)[1]


# ==========================================================================
# VARIANT 01 — Croce Fontana, horizontal lockup + stacked + symbol
# ==========================================================================
def v01(fg=GREEN, sub=GREEN, bg=None, tag="", mono=None):
    if mono:
        fg = sub = mono
    H = 140
    sym = symbol_cross(0, 0, H, fg, uid="01h" + tag)
    gap = 38
    big = 92
    t1, w1 = text(SERIF, "La Fontana", big, H + gap, 112, fg, wght=500, tracking=-0.005)
    small = 27
    t2, w2 = text(SERIF, "FARMACIA", small, H + gap + 3, 38, sub, wght=560, tracking=0.32)
    W = H + gap + max(w1, w2) + 2
    save("01-croce-fontana-orizzontale" + tag, W, H, sym + t1 + t2, bg)

    # stacked
    S = 150
    t1, w1 = text(SERIF, "La Fontana", 84, 0, 0, fg, wght=500)
    W = max(w1, S) + 20
    sym = symbol_cross(W / 2 - S / 2, 0, S, fg, uid="01v" + tag)
    t2, w2 = text(SERIF, "FARMACIA", 24, W / 2, S + 52, sub, wght=560, tracking=0.34, anchor="middle")
    t1, _ = text(SERIF, "La Fontana", 84, W / 2, S + 130, fg, wght=500, anchor="middle")
    save("01-croce-fontana-verticale" + tag, W, S + 150, sym + t2 + t1, bg)

    save("01-croce-fontana-simbolo" + tag, 100, 100, symbol_cross(0, 0, 100, fg, uid="01s" + tag), bg)


# ==========================================================================
# VARIANT 02 — Fontana di piazza, emblem with text on the ring
# ==========================================================================
def ring_text(string, cx, cy, r, size, color, font=SERIF, wght=560, tracking=0.22, top=True):
    """Set text along a circle (top arc reads clockwise, bottom arc reads left-to-right)."""
    import math
    from typeset import _load
    import uharfbuzz as hb
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    tt, fnt = _load(font, wght)
    upem = tt["head"].unitsPerEm
    s = size / upem
    buf = hb.Buffer(); buf.add_str(string); buf.guess_segment_properties()
    hb.shape(fnt, buf, {"kern": True})
    gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    advs = [p.x_advance * s + tracking * size for p in buf.glyph_positions]
    total = sum(advs) - tracking * size
    out = []
    # arc length -> angle
    pos = -total / 2
    for info, adv in zip(buf.glyph_infos, advs):
        g = order[info.codepoint]
        gw = gs[g].width * s
        mid = pos + gw / 2
        if top:
            ang = mid / r  # radians from 12 o'clock, clockwise
            px = cx + r * math.sin(ang); py = cy - r * math.cos(ang)
            rot = math.degrees(ang)
            pen = SVGPathPen(gs)
            tp = TransformPen(pen, (s, 0, 0, -s, -gw / 2, 0))
        else:
            ang = mid / r
            px = cx - r * math.sin(-ang); py = cy + r * math.cos(ang)
            px = cx + r * math.sin(ang); py = cy + r * math.cos(ang)
            rot = -math.degrees(ang)
            pen = SVGPathPen(gs)
            tp = TransformPen(pen, (s, 0, 0, -s, -gw / 2, 0))
        gs[g].draw(tp)
        d = pen.getCommands()
        if d:
            out.append(f'<path transform="translate({px:.2f},{py:.2f}) rotate({rot:.2f})" d="{d}" fill="{color}"/>')
        pos += adv
    return "".join(out)


def v02(fg=GREEN, accent=STONE, bg=None, tag="", mono=None):
    if mono:
        fg = accent = mono
    D = 300
    c = D / 2
    body = f'<circle cx="{c}" cy="{c}" r="{c-3}" fill="none" stroke="{fg}" stroke-width="5"/>'
    body += f'<circle cx="{c}" cy="{c}" r="{c-46}" fill="none" stroke="{fg}" stroke-width="2"/>'
    body += symbol_ring(c - 100, c - 102, 200, fg, sw=3.4, ring=False)
    cap = 25
    body += ring_text("FARMACIA", c, c, c - 34, cap, fg, tracking=0.42)
    body += ring_text("LA FONTANA", c, c, c - 34 + cap * 0.68, cap, fg, tracking=0.30, top=False)
    for sx in (-1, 1):  # small diamonds separating the two texts
        x = c + sx * (c - 26)
        body += f'<path d="M{x},{c-4} L{x+4},{c} L{x},{c+4} L{x-4},{c} Z" fill="{accent}"/>'
    save("02-fontana-piazza-emblema" + tag, D, D, body, bg)

    # horizontal companion lockup
    H = 140
    sym = symbol_ring(0, 0, H, fg, sw=3.4)
    t1, w1 = text(DISPLAY, "La Fontana", 104, H + 34, 104, fg, wght=600, tracking=-0.01)
    t2, w2 = text(SERIF, "FARMACIA", 25, H + 38, 30, fg, wght=560, tracking=0.36)
    save("02-fontana-piazza-orizzontale" + tag, H + 34 + max(w1, w2) + 4, H, sym + t1 + t2, bg)


# ==========================================================================
# VARIANT 03 — Wordmark only, humanist sans, the dot of the "i" rises as a
# jet; companion "F" monogram with a water arc for square contexts.
# ==========================================================================
def v03(fg=GREEN, accent=GREEN_LIGHT, bg=None, tag="", mono=None):
    if mono:
        fg = accent = mono
    size = 96
    tA, wA = text(SANS_M, "Farmacia", size, 0, 0, fg)
    tB, wB = text(SANS_B, "La Fontana", size, 0, 0, fg)
    gap = size * 0.26
    W = wA + gap + wB
    t1, _ = text(SANS_M, "Farmacia", size, 0, 100, accent)
    t2, _ = text(SANS_B, "La Fontana", size, wA + gap, 100, fg)
    save("03-wordmark-sans" + tag, W, 128, t1 + t2, bg)

    # stacked two-line wordmark with a hairline rule
    t1, w1 = text(SANS_M, "FARMACIA", 30, 0, 0, fg, tracking=0.38)
    t2, w2 = text(SANS_B, "La Fontana", 110, 0, 0, fg)
    W = max(w1, w2)
    t1, _ = text(SANS_M, "FARMACIA", 30, W / 2, 34, accent, tracking=0.38, anchor="middle")
    t2, _ = text(SANS_B, "La Fontana", 110, W / 2, 150, fg, anchor="middle")
    save("03-wordmark-sans-verticale" + tag, W, 176, t1 + t2, bg)

    # F-fontana monogram: the stem is the jet, the top arm falls like water
    S = 160
    ink = bg or CREAM
    body = (f'<rect width="{S}" height="{S}" rx="34" fill="{fg}"/>'
            f'<g fill="none" stroke="{ink}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="M58 128 V44 C58 38 62 34 70 34 H86 C108 34 120 48 120 74"/>'
            f'<path d="M58 82 H92"/></g>'
            f'<path d="M120 96 C 114 104, 113 110, 120 112 C 127 110, 126 104, 120 96 Z" fill="{ink}"/>')
    save("03-monogramma-F" + tag, S, S, body)


if __name__ == "__main__":
    v01(); v01(bg=GREEN, fg=CREAM, sub=CREAM, tag="-negativo"); v01(mono=INK, tag="-nero")
    v02(); v02(bg=GREEN, fg=CREAM, accent=STONE, tag="-negativo"); v02(mono=INK, tag="-nero")
    v03(); v03(bg=GREEN, fg=CREAM, accent="#CFE3D3", tag="-negativo"); v03(mono=INK, tag="-nero")
    print("\n".join(sorted(p.name for p in OUT.glob("*.svg"))))
