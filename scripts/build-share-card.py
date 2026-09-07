"""
Draw public/share-card.png: the 1200x630 image a chat client shows when someone
pastes a link to the game.

    python scripts/build-share-card.py
    python scripts/build-share-card.py --force   # rewrite even if nothing moved

Why it exists at all: a duel invitation travels as a link by design, so a pasted
link is the front door and the preview is the shop window. The image is four
sticker cards on the game's paper, under the wordmark, because a drawn card is
unmistakable at the size a chat client renders a preview and a screenshot of the
interface is not.

NOTHING HERE IS TYPED IN. Every figure and every colour is read back out of the
files that own it, so the card cannot quietly disagree with the game:

  src/index.css                    the light-theme palette tokens
  src/config.ts                    STICKER_TIERS, which rating is which tier
  src/components/stickerTheme.ts   TIER_META, the tier accents and foot strips
  src/components/StickerCard.tsx   ART_VISIBLE_FRACTION, how far down a card shows
  src/data/squads.ts               the dataset: who exists and what he is rated
  src/components/Flag.tsx          the FIFA-code to flag mapping
  node_modules/country-flag-icons  the flag artwork itself
  art/stickers-src/*.png           the card art, at full size
  art/fonts/*.ttf                  Archivo and Spline Sans Mono, the app's own faces

WHICH FOUR PLAYERS is a rule, not a list: the four highest-rated collectibles in
the dataset, ties broken by the older tournament, laid out oldest first. So a
rating pass moves the card by re-running this, and there is no name in this file
to go stale. If a chosen player has no artwork the script stops and says who.

THE ART IS CROPPED THE WAY THE GAME CROPS IT, and the fraction is READ OUT of
src/components/StickerCard.tsx rather than repeated here, so there is no second
copy to keep in step. Two reasons it is not a consistency point only. The images
are cut off at mid-thigh by the edge of their own canvas, so shown whole a card is
a figure amputated above the knee over an expanse of plain shorts, which is the
weakest framing this artwork has. And a shorter card can be a WIDER card: at the
crop the art box is roughly square instead of 2:3, so at the 630px height an Open
Graph image is fixed to, each card comes out about a third wider than it would
uncropped, and a bigger face is exactly what survives a thumbnail.

ONE THING THE CROP COSTS: a goalkeeper's gloves sit at 70 to 85% of the frame and
are cut off by it. No keeper is in the top four today, but the four are picked at
run time, so a ratings pass can put one there. Not a fault, just not a surprise.

FONTS. The app sets Archivo for display type and Spline Sans Mono for numerals.
Both are vendored in art/fonts/ as their variable originals with their licences
beside them, so this draws in the real faces at the real weights (900 for the
wordmark, 800 for a name, 700 for the numerals) rather than in something close.
art/ is not under public/, so none of it is deployed. A machine without them still
builds the card, in the same fallback stack index.html declares, and says so.

Requires Pillow (pip install pillow), the same single dependency
scripts/build-sticker-art.py has. Idempotent: it renders, compares the bytes with
what is already on disk, and leaves the file alone when nothing moved.
"""

import math
import os
import re
import sys
import xml.etree.ElementTree as ET

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("build-share-card: needs Pillow.  pip install pillow")

# --- where things are ------------------------------------------------------

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "src", "index.css")
CONFIG = os.path.join(ROOT, "src", "config.ts")
THEME = os.path.join(ROOT, "src", "components", "stickerTheme.ts")
STICKER_CARD = os.path.join(ROOT, "src", "components", "StickerCard.tsx")
SQUADS = os.path.join(ROOT, "src", "data", "squads.ts")
FLAG_TSX = os.path.join(ROOT, "src", "components", "Flag.tsx")
FLAG_DIR = os.path.join(ROOT, "node_modules", "country-flag-icons", "3x2")
ART_SRC = os.path.join(ROOT, "art", "stickers-src")
ART_SHIPPED = os.path.join(ROOT, "public", "stickers")
OUT = os.path.join(ROOT, "public", "share-card.png")

FORCE = "--force" in sys.argv[1:]

# The card is 1200x630 because that is what Open Graph and the summary_large_image
# Twitter card ask for. Drawn at SS times that and downsampled once, which is what
# gives the rounded corners, the flags and the type clean edges.
W, H = 1200, 630
SS = 2
CARDS = 4

# --- fonts -----------------------------------------------------------------
#
# The app sets Archivo for display type and Spline Sans Mono for numerals, both
# from Google Fonts, and neither ships in this repo. So: use the real thing if
# somebody has vendored or installed it, otherwise fall back to the same stack
# index.html declares ('Helvetica Neue', Arial) and SAY SO on the way past. A card
# quietly drawn in the wrong face is worse than one that admits it.

FONT_DIRS = [
    os.path.join(ROOT, "art", "fonts"),
    os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts"),
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts"),
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    os.path.expanduser("~/.fonts"),
    os.path.expanduser("~/Library/Fonts"),
    "/Library/Fonts",
    "/System/Library/Fonts",
]


def _find_font(names):
    """First of `names` that exists under any font directory, searched recursively."""
    lowered = [n.lower() for n in names]
    for directory in FONT_DIRS:
        if not directory or not os.path.isdir(directory):
            continue
        for base, _dirs, files in os.walk(directory):
            by_lower = {f.lower(): f for f in files}
            for want in lowered:
                if want in by_lower:
                    return os.path.join(base, by_lower[want])
    return None


# Archivo and Spline Sans Mono ship as VARIABLE fonts, which is the whole reason one
# file each is enough: index.html asks Google for Archivo at 500/700/800/900 and Spline
# Sans Mono at 500/600/700, and a weight axis serves every one of them. Note "Archivo
# Black" is a DIFFERENT family and is deliberately not used here: the app's wordmark is
# Archivo at 900, not Archivo Black, and they do not look the same.
DISPLAY_WANTED = ["Archivo[wdth,wght].ttf", "Archivo-Black.ttf", "Archivo-ExtraBold.ttf"]
DISPLAY_FALLBACK = ["HelveticaNeue-Bold.ttf", "arialbd.ttf", "Arial-Bold.ttf", "DejaVuSans-Bold.ttf"]
MONO_WANTED = ["SplineSansMono[wght].ttf", "SplineSansMono-Bold.ttf"]
MONO_FALLBACK = ["consolab.ttf", "Menlo-Bold.ttf", "DejaVuSansMono-Bold.ttf", "cour.ttf"]

DISPLAY_PATH = _find_font(DISPLAY_WANTED)
DISPLAY_REAL = DISPLAY_PATH is not None
if not DISPLAY_PATH:
    DISPLAY_PATH = _find_font(DISPLAY_FALLBACK)
MONO_PATH = _find_font(MONO_WANTED)
MONO_REAL = MONO_PATH is not None
if not MONO_PATH:
    MONO_PATH = _find_font(MONO_FALLBACK)

if not DISPLAY_PATH or not MONO_PATH:
    sys.exit(
        "build-share-card: found no usable display or mono font. Put the Archivo and\n"
        "  Spline Sans Mono variable fonts back in art/fonts/ and run again."
    )


def _weighted(path, size, weight):
    """One font at one weight. A variable file gets its weight axis set; a static one
    takes whatever weight it was cut at, which is what the fallback stack does."""
    font = ImageFont.truetype(path, int(round(size)))
    try:
        axes = font.get_variation_axes()
    except Exception:
        return font
    # Set the weight axis by NAME and leave every other axis (Archivo also carries a
    # width axis) at its default, or asking for 900 would silently squash the wordmark.
    values = []
    for axis in axes:
        name = axis["name"].decode() if isinstance(axis["name"], bytes) else str(axis["name"])
        if name.lower() == "weight":
            values.append(max(axis["minimum"], min(axis["maximum"], weight)))
        else:
            values.append(axis["default"])
    font.set_variation_by_axes(values)
    return font


def display_font(size, weight=800):
    return _weighted(DISPLAY_PATH, size, weight)


def mono_font(size, weight=700):
    return _weighted(MONO_PATH, size, weight)


# --- reading the files that own the numbers --------------------------------


def read_tokens():
    """The LIGHT palette from src/index.css. Every token is defined once for paper and
    again under the dark rules further down, so the first occurrence is the light one."""
    text = open(CSS, encoding="utf-8").read()
    found = {}
    for name, value in re.findall(r"--color-([a-z-]+):\s*(#[0-9a-fA-F]{3,8})\s*;", text):
        found.setdefault(name, value)
    need = ["ground", "panel", "ink", "muted", "line", "pitch-dark", "pitch-ink"]
    missing = [n for n in need if n not in found]
    if missing:
        sys.exit(f"build-share-card: src/index.css has no --color-{missing[0]} any more")
    return found


def read_tiers():
    """STICKER_TIERS out of src/config.ts: which rating band is which tier."""
    text = open(CONFIG, encoding="utf-8").read()
    block = re.search(r"export const STICKER_TIERS\s*=\s*\{(.*?)\}\s*as const;", text, re.S)
    if not block:
        sys.exit("build-share-card: could not find STICKER_TIERS in src/config.ts")
    tiers = {}
    for name, lo, hi in re.findall(
        r"(\w+)\s*:\s*\{\s*min:\s*(\d+)\s*,\s*max:\s*(\d+)\s*\}", block.group(1)
    ):
        tiers[name] = (int(lo), int(hi))
    if not tiers:
        sys.exit("build-share-card: STICKER_TIERS parsed empty")
    return tiers


def read_tier_meta():
    """TIER_META out of src/components/stickerTheme.ts: the name, the accent rule along
    the card's top edge, the foot strip and the ink that sits on it."""
    text = open(THEME, encoding="utf-8").read()
    block = re.search(r"TIER_META[^=]*=\s*\{(.*?)\n\};", text, re.S)
    if not block:
        sys.exit("build-share-card: could not find TIER_META in stickerTheme.ts")
    meta = {}
    for entry in re.finditer(
        r"(\w+)\s*:\s*\{\s*name:\s*'([^']*)'\s*,\s*accent:\s*'([^']*)'\s*,"
        r"\s*strip:\s*'([^']*)'\s*,\s*stripText:\s*'([^']*)'",
        block.group(1),
    ):
        key, name, accent, strip, strip_text = entry.groups()
        meta[key] = {
            "name": name,
            "accent": accent,
            # A strip is either one colour or a CSS gradient; keep every colour in it
            # so the gold foil stays a foil.
            "strip": re.findall(r"#[0-9a-fA-F]{3,6}", strip),
            "stripText": strip_text,
        }
    if not meta:
        sys.exit("build-share-card: TIER_META parsed empty")
    return meta


def read_crop():
    """ART_VISIBLE_FRACTION out of src/components/StickerCard.tsx: how far down its own
    picture a card shows. Read rather than copied, so the share image and the album can
    never disagree about the framing. That constant is the source of truth; change it
    there and re-run this."""
    text = open(STICKER_CARD, encoding="utf-8").read()
    found = re.search(r"ART_VISIBLE_FRACTION\s*=\s*([0-9.]+)\s*;", text)
    if not found:
        sys.exit("build-share-card: could not find ART_VISIBLE_FRACTION in StickerCard.tsx")
    value = float(found.group(1))
    if not 0 < value <= 1:
        sys.exit(f"build-share-card: ART_VISIBLE_FRACTION is {value}, which is not a fraction")
    return value


def read_squads():
    """The dataset. Names carrying an apostrophe are written with double quotes in
    squads.ts (Thomas N'Kono), so both quote styles have to be accepted or six
    Cameroon rows vanish without a word."""
    text = open(SQUADS, encoding="utf-8").read()
    head = re.compile(
        r"squad\(\s*'([A-Z]{3})'\s*,\s*(?:'((?:[^'\\]|\\.)*)'|\"([^\"]*)\")\s*,\s*(\d{4})\s*,\s*\["
    )
    row = re.compile(
        r"\[\s*(\d+)\s*,\s*(?:'((?:[^'\\]|\\.)*)'|\"([^\"]*)\")\s*,"
        r"\s*\[[^\]]*\]\s*,\s*(\d+)\s*(?:,\s*['\"][^'\"]*['\"])?\s*,?\s*\]",
        re.S,
    )
    players, years = [], set()
    for m in head.finditer(text):
        code = m.group(1)
        nation = (m.group(2) or m.group(3) or "").replace("\\'", "'")
        year = int(m.group(4))
        # Walk to the bracket that closes the row array, so a squad's rows are never
        # read out of the squad after it.
        i, depth = m.end() - 1, 0
        while True:
            char = text[i]
            if char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        body = text[m.end():i]
        squad_id = f"{code.lower()}-{year}"
        years.add(year)
        rows = 0
        for r in row.finditer(body):
            rows += 1
            players.append(
                {
                    "id": f"{squad_id}-{int(r.group(1))}",
                    "name": (r.group(2) or r.group(3) or "").replace("\\'", "'"),
                    "elo": int(r.group(4)),
                    "code": code,
                    "nation": nation,
                    "year": year,
                }
            )
        # A squad that parsed to nothing means the file's shape moved under this
        # regex, which would otherwise show up as a card missing a famous name.
        if rows == 0:
            sys.exit(f"build-share-card: parsed no players out of {squad_id}")
    if not players:
        sys.exit("build-share-card: parsed no players at all out of squads.ts")
    return players, sorted(years)


def read_flag_map():
    """The FIFA code to flag-file mapping, parsed out of Flag.tsx rather than copied,
    so a nation added to the game is a nation this card can draw."""
    text = open(FLAG_TSX, encoding="utf-8").read()
    imports = dict(
        re.findall(r"import\s+(\w+)\s+from\s+'country-flag-icons/react/3x2/([\w-]+)'", text)
    )
    block = re.search(r"BY_FIFA[^=]*=\s*\{(.*?)\n\};", text, re.S)
    if not block:
        sys.exit("build-share-card: could not find BY_FIFA in Flag.tsx")
    body = re.sub(r"//[^\n]*", "", block.group(1))
    mapping = {}
    for fifa, ident in re.findall(r"(\w+)\s*:\s*(\w+)", body):
        if ident in imports:
            mapping[fifa] = imports[ident]
    if not mapping:
        sys.exit("build-share-card: BY_FIFA parsed empty")
    return mapping


# --- a very small SVG reader, enough for these flags -----------------------
#
# country-flag-icons ships heavily simplified 3x2 flags: solid rectangles, a few
# circles and some filled paths. Reading them is what keeps the cards showing the
# GAME's flags rather than an approximation drawn here, and it means a nation the
# dataset gains later needs no work. Anything outside the subset raises rather
# than being skipped, so a flag can never silently come out half drawn.


def _colour(value, default=None):
    if not value or value == "none":
        return default
    value = value.strip()
    if not value.startswith("#"):
        return default
    hex_part = value[1:]
    if len(hex_part) == 3:
        hex_part = "".join(c * 2 for c in hex_part)
    if len(hex_part) != 6:
        return default
    return tuple(int(hex_part[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


_TOKENS = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)")


def _flatten_cubic(p0, p1, p2, p3, steps=18):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        out.append(
            (
                u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
            )
        )
    return out


def _subpaths(d):
    """Flatten a path's `d` into a list of point lists. Elliptical arcs are refused."""
    tokens = [(cmd, num) for cmd, num in _TOKENS.findall(d)]
    paths, current = [], []
    pos = (0.0, 0.0)
    start = (0.0, 0.0)
    prev_ctrl = None
    cmd = None
    i = 0
    while i < len(tokens):
        token_cmd, token_num = tokens[i]
        if token_cmd:
            cmd = token_cmd
            i += 1
            if cmd in "Zz":
                if current:
                    paths.append(current)
                    current = []
                pos = start
                continue
        if cmd is None:
            sys.exit("build-share-card: flag path starts without a command")

        def take(n):
            nonlocal i
            vals = []
            while len(vals) < n:
                if i >= len(tokens) or tokens[i][0]:
                    sys.exit(f"build-share-card: flag path ran out of numbers after {cmd}")
                vals.append(float(tokens[i][1]))
                i += 1
            return vals

        rel = cmd.islower()
        upper = cmd.upper()
        if upper == "M":
            x, y = take(2)
            pos = (pos[0] + x, pos[1] + y) if rel else (x, y)
            if current:
                paths.append(current)
            current = [pos]
            start = pos
            cmd = "l" if rel else "L"
        elif upper == "L":
            x, y = take(2)
            pos = (pos[0] + x, pos[1] + y) if rel else (x, y)
            current.append(pos)
        elif upper == "H":
            (x,) = take(1)
            pos = (pos[0] + x, pos[1]) if rel else (x, pos[1])
            current.append(pos)
        elif upper == "V":
            (y,) = take(1)
            pos = (pos[0], pos[1] + y) if rel else (pos[0], y)
            current.append(pos)
        elif upper in ("C", "S", "Q", "T"):
            if upper == "C":
                x1, y1, x2, y2, x, y = take(6)
                c1 = (pos[0] + x1, pos[1] + y1) if rel else (x1, y1)
                c2 = (pos[0] + x2, pos[1] + y2) if rel else (x2, y2)
                end = (pos[0] + x, pos[1] + y) if rel else (x, y)
            elif upper == "S":
                x2, y2, x, y = take(4)
                c1 = (2 * pos[0] - prev_ctrl[0], 2 * pos[1] - prev_ctrl[1]) if prev_ctrl else pos
                c2 = (pos[0] + x2, pos[1] + y2) if rel else (x2, y2)
                end = (pos[0] + x, pos[1] + y) if rel else (x, y)
            elif upper == "Q":
                x1, y1, x, y = take(4)
                q = (pos[0] + x1, pos[1] + y1) if rel else (x1, y1)
                end = (pos[0] + x, pos[1] + y) if rel else (x, y)
                c1 = (pos[0] + 2 / 3 * (q[0] - pos[0]), pos[1] + 2 / 3 * (q[1] - pos[1]))
                c2 = (end[0] + 2 / 3 * (q[0] - end[0]), end[1] + 2 / 3 * (q[1] - end[1]))
            else:
                x, y = take(2)
                q = (2 * pos[0] - prev_ctrl[0], 2 * pos[1] - prev_ctrl[1]) if prev_ctrl else pos
                end = (pos[0] + x, pos[1] + y) if rel else (x, y)
                c1 = (pos[0] + 2 / 3 * (q[0] - pos[0]), pos[1] + 2 / 3 * (q[1] - pos[1]))
                c2 = (end[0] + 2 / 3 * (q[0] - end[0]), end[1] + 2 / 3 * (q[1] - end[1]))
            current.extend(_flatten_cubic(pos, c1, c2, end))
            prev_ctrl = c2
            pos = end
            continue
        else:
            sys.exit(f"build-share-card: flag path uses '{cmd}', which this reader cannot draw")
        prev_ctrl = None
    if current:
        paths.append(current)
    return [p for p in paths if len(p) >= 3]


def render_flag(iso, width, height):
    """One flag from country-flag-icons, drawn at width x height with clean edges."""
    path = os.path.join(FLAG_DIR, f"{iso}.svg")
    if not os.path.exists(path):
        sys.exit(f"build-share-card: no flag artwork for {iso} (looked in {FLAG_DIR})")
    root = ET.parse(path).getroot()
    box = [float(v) for v in root.get("viewBox", "0 0 513 342").replace(",", " ").split()]
    vb_w, vb_h = box[2], box[3]

    over = 4
    big = Image.new("RGBA", (width * over, height * over), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    sx, sy = (width * over) / vb_w, (height * over) / vb_h

    def to_px(pt):
        return ((pt[0] - box[0]) * sx, (pt[1] - box[1]) * sy)

    def walk(node, inherited):
        for child in node:
            tag = child.tag.split("}")[-1]
            fill = _colour(child.get("fill"), inherited)
            if tag == "g":
                walk(child, fill)
                continue
            stroke = _colour(child.get("stroke"))
            stroke_w = float(child.get("stroke-width", 0) or 0) * sx
            if tag == "rect":
                x, y = float(child.get("x", 0)), float(child.get("y", 0))
                w, h = float(child.get("width", 0)), float(child.get("height", 0))
                p0, p1 = to_px((x, y)), to_px((x + w, y + h))
                draw.rectangle([p0, p1], fill=fill)
            elif tag in ("circle", "ellipse"):
                cx, cy = float(child.get("cx", 0)), float(child.get("cy", 0))
                if tag == "circle":
                    rx = ry = float(child.get("r", 0))
                else:
                    rx, ry = float(child.get("rx", 0)), float(child.get("ry", 0))
                p0, p1 = to_px((cx - rx, cy - ry)), to_px((cx + rx, cy + ry))
                draw.ellipse(
                    [p0, p1],
                    fill=fill,
                    outline=stroke,
                    width=max(1, int(round(stroke_w))) if stroke else 0,
                )
            elif tag == "polygon":
                pts = [float(v) for v in re.split(r"[\s,]+", child.get("points", "").strip()) if v]
                draw.polygon([to_px((pts[i], pts[i + 1])) for i in range(0, len(pts) - 1, 2)], fill=fill)
            elif tag == "path":
                for sub in _subpaths(child.get("d", "")):
                    draw.polygon([to_px(p) for p in sub], fill=fill)
            elif tag in ("title", "desc", "defs", "style", "metadata"):
                continue
            else:
                sys.exit(f"build-share-card: flag {iso} uses <{tag}>, which this reader cannot draw")

    walk(root, (0, 0, 0, 255))
    return big.resize((width, height), Image.LANCZOS)


# --- text helpers ----------------------------------------------------------


def text_width(draw, text, font, tracking=0.0):
    return draw.textlength(text, font=font) + tracking * max(0, len(text) - 1)


def draw_tracked(draw, xy, text, font, fill, tracking=0.0, anchor_x="left"):
    """Pillow has no letter-spacing, and the app's mono captions are tracked hard
    enough that faking it matters (TIER, RATING, the wordmark)."""
    width = text_width(draw, text, font, tracking)
    x, y = xy
    if anchor_x == "center":
        x -= width / 2
    elif anchor_x == "right":
        x -= width
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += draw.textlength(char, font=font) + tracking
    return width


def wrap_to(draw, text, font, max_width, max_lines):
    """Greedy wrap, giving up and returning None when it will not fit, so the caller
    can shrink the type rather than let a long name run off the card."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines or any(draw.textlength(l, font=font) > max_width for l in lines):
        return None
    return lines


# --- the card itself -------------------------------------------------------
#
# Proportions are StickerCard's own, expressed against the 170px width the album
# renders at and scaled from there: the 3px tier rule along the top, the tracked
# tier caption, the 2:3 art, the flag, the name, the "nation . year" line and the
# foot strip carrying the rating.

REF_W = 170.0


def card_metrics(width, name_lines):
    k = width / REF_W
    m = {
        "k": k,
        "border": max(1, round(1 * k)),
        "rule": max(2, round(3 * k)),
        "head": round(19 * k),
        # The art is drawn at full card width, so its natural height is width * 1.5 (every
        # sticker is a 2:3 portrait); the BOX clips that to the visible fraction. Same two
        # steps StickerCard takes, and the reason the card is not simply 2:3 tall.
        "art_h": round(width * 1.5 * CROP),
        "art_gap": round(4 * k),
        "body_pt": round(8 * k),
        "gap": round(6 * k),
        "flag_h": round(20 * k),
        "flag_w": round(30 * k),
        "name_line": round(17 * k),
        "nation_line": round(13 * k),
        "body_pb": round(12 * k),
        "foot": round(34 * k),
        "shadow": round(6 * k),
        "radius": round(6 * k),
        "pad_x": round(10 * k),
    }
    m["height"] = (
        m["border"] * 2
        + m["rule"]
        + m["head"]
        + m["body_pt"]
        + m["art_h"]
        + m["art_gap"]
        + m["gap"]
        + m["flag_h"]
        + m["gap"]
        + m["name_line"] * name_lines
        + m["gap"]
        + m["nation_line"]
        + m["body_pb"]
        + m["foot"]
    )
    return m


def load_art(player_id, width, box_height):
    """The picture, scaled to the card's width and then clipped from the TOP to the box
    the crop leaves. Scaling first and cutting second is what makes it a window onto the
    drawing rather than a squashed copy of it.

    Prefers the full-size original: a cleaner downscale than the 400px WebP the site
    ships, and this file is not on anybody's download path."""
    for candidate in (
        os.path.join(ART_SRC, f"{player_id}.png"),
        os.path.join(ART_SRC, f"{player_id}.jpg"),
        os.path.join(ART_SHIPPED, f"{player_id}.webp"),
    ):
        if os.path.exists(candidate):
            with Image.open(candidate) as im:
                full = im.convert("RGBA").resize((width, round(width * 1.5)), Image.LANCZOS)
            return full.crop((0, 0, width, min(box_height, full.height)))
    return None


def draw_card(player, tier, meta, tokens, width, name_lines):
    m = card_metrics(width, name_lines)
    height = m["height"]
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    panel = _colour(tokens["panel"])
    line = _colour(tokens["line"])
    ink = _colour(tokens["ink"])
    muted = _colour(tokens["muted"])
    accent = _colour(meta["accent"])

    draw.rounded_rectangle(
        [0, 0, width - 1, height - 1], radius=m["radius"], fill=panel, outline=line, width=m["border"]
    )
    # The 3px tier rule along the top edge, inside the rounded corners.
    top = Image.new("RGBA", (width, m["rule"] + m["radius"]), (0, 0, 0, 0))
    ImageDraw.Draw(top).rounded_rectangle(
        [0, 0, width - 1, m["rule"] + m["radius"] * 2], radius=m["radius"], fill=accent
    )
    img.paste(top.crop((0, 0, width, m["rule"])), (0, 0), top.crop((0, 0, width, m["rule"])))

    y = m["rule"] + m["border"]

    # Tier caption, in the tier's own accent, tracked the way the card tracks it.
    cap_font = mono_font(8.5 * m["k"])
    draw_tracked(
        draw,
        (m["pad_x"], y + round(6 * m["k"])),
        meta["name"].upper(),
        cap_font,
        accent,
        tracking=8.5 * m["k"] * 0.12,
    )
    y += m["head"] + m["body_pt"]

    art = load_art(player["id"], width - m["border"] * 2, m["art_h"])
    if art is None:
        sys.exit(
            f"build-share-card: no artwork for {player['name']} ({player['id']}).\n"
            "  Draw it into art/stickers-src/ or this card cannot be built."
        )
    img.paste(art, (m["border"], y), art)
    y += m["art_h"] + m["art_gap"] + m["gap"]

    flag = render_flag(FLAG_MAP.get(player["code"], ""), m["flag_w"], m["flag_h"])
    img.paste(flag, ((width - m["flag_w"]) // 2, y), flag)
    y += m["flag_h"] + m["gap"]

    # Name. Shrink before wrapping to three lines: a card is the same height as the
    # three beside it, and a name pushed onto an extra line would break the row.
    size = 13.5 * m["k"]
    inner = width - round(12 * m["k"]) * 2
    lines = None
    while size > 8 * m["k"]:
        font = display_font(size)
        lines = wrap_to(draw, player["name"], font, inner, name_lines)
        if lines:
            break
        size -= 0.5 * m["k"]
    if not lines:
        lines = [player["name"]]
        font = display_font(8 * m["k"])
    block = y + (m["name_line"] * name_lines - m["name_line"] * len(lines)) / 2
    for index, text in enumerate(lines):
        draw.text(
            (width / 2, block + index * m["name_line"] + m["name_line"] / 2),
            text,
            font=font,
            fill=ink,
            anchor="mm",
        )
    y += m["name_line"] * name_lines + m["gap"]

    nation_font = mono_font(10 * m["k"], 500)
    draw.text(
        (width / 2, y + m["nation_line"] / 2),
        f"{player['nation']} \u00b7 {player['year']}",
        font=nation_font,
        fill=muted,
        anchor="mm",
    )

    # Foot strip: one colour, or the gold foil as the 135deg gradient the theme states.
    foot_top = height - m["foot"] - m["border"]
    strip = Image.new("RGBA", (width, m["foot"]), _colour(meta["strip"][0]))
    if len(meta["strip"]) > 1:
        start, end = _colour(meta["strip"][0]), _colour(meta["strip"][-1])
        pixels = strip.load()
        span = max(1, width + m["foot"] - 2)
        for px in range(width):
            for py in range(m["foot"]):
                t = (px + py) / span
                pixels[px, py] = tuple(
                    int(round(start[c] + (end[c] - start[c]) * t)) for c in range(3)
                ) + (255,)
    mask = Image.new("L", (width, m["foot"]), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, -m["radius"] * 2, width - 1, m["foot"] - 1], radius=m["radius"], fill=255
    )
    img.paste(strip, (0, foot_top), mask)

    strip_ink = _colour(meta["stripText"])
    rating_font = mono_font(22 * m["k"])
    label_font = mono_font(8 * m["k"], 600)
    rating = str(player["elo"])
    tracking = 8 * m["k"] * 0.14
    rating_w = draw.textlength(rating, font=rating_font)
    label_w = text_width(draw, "RATING", label_font, tracking)
    gap = round(6 * m["k"])
    left = (width - (rating_w + gap + label_w)) / 2
    centre = foot_top + m["foot"] / 2
    draw.text((left, centre), rating, font=rating_font, fill=strip_ink, anchor="lm")
    draw_tracked(
        draw,
        (left + rating_w + gap, centre - 8 * m["k"] * 0.55),
        "RATING",
        label_font,
        strip_ink,
        tracking=tracking,
    )
    return img, m


# --- pick the four ---------------------------------------------------------

TOKENS = read_tokens()
TIERS = read_tiers()
TIER_META = read_tier_meta()
FLAG_MAP = read_flag_map()
PLAYERS, YEARS = read_squads()
CROP = read_crop()


def tier_of(elo):
    for name, (lo, hi) in TIERS.items():
        if lo <= elo <= hi:
            return name
    return None


collectible = [p for p in PLAYERS if tier_of(p["elo"])]
if len(collectible) < CARDS:
    sys.exit("build-share-card: fewer collectibles in the dataset than the card has room for")

# The rule: highest rated first, the older tournament ahead on a tie, then the name so
# two rows of the same player in the same year cannot reorder between runs. Laid out
# oldest first, which walks the reader across the tournaments the game covers.
chosen = sorted(collectible, key=lambda p: (-p["elo"], p["year"], p["name"]))[:CARDS]
chosen.sort(key=lambda p: (p["year"], p["name"]))

# --- lay the page out ------------------------------------------------------

ground = _colour(TOKENS["ground"])
ink = _colour(TOKENS["ink"])
pitch_ink = _colour(TOKENS["pitch-ink"])
pitch_dark = _colour(TOKENS["pitch-dark"])
line = _colour(TOKENS["line"])

canvas = Image.new("RGBA", (W * SS, H * SS), ground)
page = ImageDraw.Draw(canvas)

SIDE = 50 * SS
GAP = 30 * SS
WORDMARK_SIZE = 40 * SS
MARK_TO_RULE = 18 * SS
RULE_TO_CARDS = 28 * SS

mark_font = display_font(WORDMARK_SIZE, 900)
mark_tracking = WORDMARK_SIZE * 0.02
HEAD, TAIL = "MONDIAL", "INO"
mark_bbox = mark_font.getbbox(HEAD + TAIL)
mark_h = mark_bbox[3] - mark_bbox[1]

# THE CARD IS SOLVED FOR, not laid out to a guess. Start at the widest four cards the
# side margins allow and shrink only if the tallest of them will not fit the height, so
# whichever of the two constraints actually binds is the one that decides the size. With
# the art cropped it is usually the WIDTH, which is the point of cropping it: the strip
# fills the canvas instead of sitting in a lake of paper.
probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
avail_w = W * SS - SIDE * 2
band_h = H * SS - (mark_h + MARK_TO_RULE + max(1, SS) + RULE_TO_CARDS) - 30 * SS


def fit(lines):
    width = int((avail_w - GAP * (CARDS - 1)) / CARDS)
    while width > 40:
        m = card_metrics(width, lines)
        if m["height"] + m["shadow"] <= band_h:
            return width
        width -= 1
    return width


# How many lines the longest name needs decides every card's height, so the four sit on
# one baseline whoever the dataset puts in them.
name_lines, card_w = 2, fit(2)
for lines in (1, 2):
    width = fit(lines)
    probe_font = display_font(13.5 * (width / REF_W))
    inner = width - round(12 * (width / REF_W)) * 2
    if all(wrap_to(probe, p["name"], probe_font, inner, lines) for p in chosen):
        name_lines, card_w = lines, width
        break

metrics = card_metrics(card_w, name_lines)
row_w = card_w * CARDS + GAP * (CARDS - 1) + metrics["shadow"]
row_h = metrics["height"] + metrics["shadow"]

# Centre the whole thing (wordmark, rule, cards) rather than the cards alone, so the
# paper left over is shared between the top and the bottom instead of pooling at one end.
block_h = mark_h + MARK_TO_RULE + max(1, SS) + RULE_TO_CARDS + row_h
top = (H * SS - block_h) / 2

# The wordmark, in the app's own split: MONDIAL in ink, INO in green.
total = (
    text_width(page, HEAD, mark_font, mark_tracking)
    + mark_tracking
    + text_width(page, TAIL, mark_font, mark_tracking)
)
x = (W * SS - total) / 2
# getbbox's top offset, so the letters' visual top lands on `top` rather than the
# font's ascender, which carries empty space above a line of capitals.
mark_y = top - mark_bbox[1]
x += draw_tracked(page, (x, mark_y), HEAD, mark_font, ink, mark_tracking) + mark_tracking
draw_tracked(page, (x, mark_y), TAIL, mark_font, pitch_ink, mark_tracking)

rule_y = top + mark_h + MARK_TO_RULE
page.rectangle([SIDE, rule_y, W * SS - SIDE, rule_y + max(1, SS)], fill=line)

x0 = (W * SS - row_w) / 2
y0 = rule_y + max(1, SS) + RULE_TO_CARDS

for index, player in enumerate(chosen):
    tier = tier_of(player["elo"])
    card, m = draw_card(player, tier, TIER_META[tier], TOKENS, card_w, name_lines)
    cx = int(round(x0 + index * (card_w + GAP)))
    cy = int(round(y0))
    # The signature hard offset shadow, in deep pitch green, exactly as --shadow-hard.
    page.rounded_rectangle(
        [cx + m["shadow"], cy + m["shadow"], cx + card_w - 1 + m["shadow"], cy + m["height"] - 1 + m["shadow"]],
        radius=m["radius"],
        fill=pitch_dark,
    )
    canvas.paste(card, (cx, cy), card)

out = canvas.convert("RGB").resize((W, H), Image.LANCZOS)

# --- write, but only if it actually moved ----------------------------------

import io  # noqa: E402  (only needed for the idempotency compare)

buffer = io.BytesIO()
out.save(buffer, "PNG", optimize=True)
data = buffer.getvalue()

names = ", ".join(f"{p['name']} {p['year']} ({p['elo']})" for p in chosen)
print(f"build-share-card: {len(YEARS)} tournaments, {len(collectible)} collectibles in the dataset")
print(f"  cards: {names}")
print(
    f"  card {card_w // SS}x{metrics['height'] // SS} at {CROP:.2f} of the art"
    f"  ({'width' if card_w >= int((avail_w - GAP * (CARDS - 1)) / CARDS) else 'height'}-bound),"
    f" strip {row_w // SS} of {W}"
)
if not DISPLAY_REAL or not MONO_REAL:
    missing = []
    if not DISPLAY_REAL:
        missing.append(f"Archivo -> {os.path.basename(DISPLAY_PATH)}")
    if not MONO_REAL:
        missing.append(f"Spline Sans Mono -> {os.path.basename(MONO_PATH)}")
    print(f"  FONT FALLBACK IN USE: {'; '.join(missing)}")
    print("  art/fonts/ has lost a face this needs. Restore it and the card is drawn in")
    print("  the app's own type again; until then it is close rather than right.")

if not FORCE and os.path.exists(OUT) and open(OUT, "rb").read() == data:
    print(f"  {os.path.relpath(OUT, ROOT)} unchanged")
else:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as fh:
        fh.write(data)
    print(f"  wrote {os.path.relpath(OUT, ROOT)}  ({len(data) / 1024:.0f} KB, {W}x{H})")
