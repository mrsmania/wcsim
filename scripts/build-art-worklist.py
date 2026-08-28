"""
Write docs/missing-sticker-art.html: the sticker cards still to draw, as a worklist.

    python scripts/build-art-worklist.py <cards.json> <out.html>

Called by `npm run ratings:sync`, which hands over the cards as JSON because the dataset
lives in TypeScript and this side cannot read it. Not meant to be run by hand: the whole
point is that the page is rewritten every time the ratings move, so it can never sit there
stating a stale count. It replaced a version that was written once and was two days later
wrong in six rows.

It used to be an xlsx, and HTML is better for this job in three ways that were all real
problems: openpyxl writes no cached values, so every derived figure showed blank until the
file had been opened in a spreadsheet once (and the sandbox this is often built in cannot
open one at all); a kit swatch is a coloured box, which a table cell does one line of CSS
and a spreadsheet does not do at all; and a diff of the file now says what changed, where
a zip of XML said only that the bytes moved. Stdlib only, no openpyxl.

The table and its notes are plain text in one self-contained file: no build step, no
dependency, and `docs/` is not under `public/`, so nothing here is deployed. Open it off
disk.
"""

import hashlib
import html
import json
import os
import re
import sys

if len(sys.argv) != 3:
    sys.exit("build-art-worklist: usage: build-art-worklist.py <cards.json> <out.html>")

SRC, OUT = sys.argv[1], sys.argv[2]

with open(SRC, encoding="utf-8") as fh:
    data = json.load(fh)

cards = data["cards"]
fresh = set(data.get("fresh", []))
fingerprint = data["fingerprint"]
player_notes = data.get("playerNotes", {})

# The fingerprint of what the page SAYS travels inside it, so a run with nothing to change
# leaves the file alone rather than rewriting the date and the commit into a dirty tree.
# Recorded on the CONTENT only, never on the commit, or every commit would rewrite it.
#
# THIS SCRIPT'S OWN HASH is part of the stamp, and that is not decoration: the content
# fingerprint comes from ratings:sync and knows nothing about the markup here, so editing
# the layout or the CSS would otherwise leave the page exactly as it was and look as
# though the edit had not worked. It did, once, which is why this line exists.
stamp = f"{fingerprint}-{hashlib.sha256(open(__file__, 'rb').read()).hexdigest()[:8]}"
STAMP = re.compile(r"<!-- fingerprint: ([0-9a-f-]+) -->")
if os.path.exists(OUT):
    try:
        with open(OUT, encoding="utf-8") as fh:
            found = STAMP.search(fh.read(4096))
        if found and found.group(1) == stamp:
            print(f"build-art-worklist: {OUT} - unchanged, {len(cards)} cards to draw")
            sys.exit(0)
    except OSError:
        pass  # unreadable: rewrite it

PROMPT_FN = r"""
function buildPrompt(p) {
    const numText = p.numOnFront
        ? `with the number ${p.no} on the front`
        : `without the number on the front (number is only on the back)`;
    const numApparelText = p.numOnFront
        ? `and the player's number large on the front`
        : `and no number on the front`;

    return `Create an image of ${p.name} with the following style. He wears the attached ${p.nation} jersey and ${p.colorName} shorts from the world cup ${p.year}, fitted and athletic ${numText}. The look of him at that world cup should be incorporated. A stylized soccer player rendered as a comic-style 3D character, in the spirit of a premium animated-film hero (Pixar / DreamWorks / Sony Animation look) crossed with a designer vinyl art toy. Use gently caricatured proportions: a minimally oversized head relative to the body (roughly a 1:6 head-to-body feel, not a realistic 1:7.5). The body stays lean and athletic. The character stands centered, facing forward to the camera, framed from the femoral up, arms hanging down lose. No visible modular joints or seams. Face Large, expressive, glossy eyes with clearly painted irises and a bright catchlight in each eye. Big, bold, slightly exaggerated eyebrows that drive a determined, focused, competitive expression with a light furrow. Smooth, rounded facial planes with soft cheeks and a simplified nose and chin. Skin is clean and stylized, almost matte, with a subtle warm gradient. The overall read should be "realistic person." Hair If given a specific person, render that pesons hairstyle at the given time. It should look slightly soft and natural in shading, but it is NOT photoreal and NOT individual loose strands. Think "rendered character hair," painted with soft highlights. Apparel and texturing A fitted athletic national-team jersey in the team's signature colors, with crisp colored trim on the collar and shoulders. Place a highly detailed, authentic-looking team crest over the heart, ${numApparelText}. The brand mark, if any, sits opposite the crest and small. Strictly no sponsor logos across the chest or torso. Render the jersey as textured fabric with a subtle sheen, visible weave and stitching, so the cloth clearly contrasts with the smoother, more matte stylized skin. The contrast between fabric and skin is part of the toy-like charm. Background and lighting Pure uniform white background, no environment or props. Soft professional 3D studio lighting: a key light, fill, and gentle rim light to define the silhouette. Bright, clean, friendly lighting with soft shadows, no harsh dramatic contrast. Technical modifiers Aspect ratio 2:3, vertical portrait. Append: "stylized 3D character, animated film style, cute comic style, designer vinyl collectible, octane render, soft studio lighting, high detail, smooth shading." Importantly, do NOT use the modifiers "photorealistic," "realistic skin," or "realistic hair," and avoid "unreal engine hyperrealism," since those are what tip your outputs into the too-real zone.`;
}
"""

E = html.escape
TIERS = ["Monumental", "Iconic", "Legendary"]


def swatch(part):
    """One colour: the box, then what to call it. The box is the point of the column."""
    if not part:
        return ""
    hexv = str(part.get("hex", "")).strip()
    safe = hexv if re.fullmatch(r"#[0-9a-fA-F]{6}", hexv) else "transparent"
    return (
        f'<span class="sw" style="background:{safe}"></span>'
        f'<span class="swn">{E(str(part.get("name", "")))}</span>'
    )


def kit_cell(card):
    """The SHORTS only, which is not the obvious choice and is the useful one: the drawing
    prompt carries the SHIRT as an attached photograph, so the one colour it has to state
    in words is the shorts. art/kits.json records all three; one colour a row is what
    keeps the column scannable."""
    kit = card.get("kit")
    if not kit:
        return '<td class="kit"><span class="none">not recorded</span></td>'
    parts = f'<div class="line">{swatch(kit.get("shorts"))}</div>'
    conf = str(kit.get("confidence", ""))
    tag = f'<span class="conf c-{E(conf)}">{E(conf)}</span>' if conf else ""
    note = f'<p class="note">{E(str(kit["note"]))}</p>' if kit.get("note") else ""
    return f'<td class="kit">{parts}{tag}{note}</td>'


def number_on_front(card):
    """Whether the shirt carried the number on the CHEST as well as the back. Recorded per
    SQUAD in art/kits.json, because it is a fact about a kit and not about a player, and it
    changes the prompt's wording either way. An unrecorded squad reads as no, which is what
    every side before the 1990s did."""
    kit = card.get("kit") or {}
    return bool(kit.get("numberOnFront"))


rows = []
for card in cards:
    # A NEW card is one that has only just become collectible and is not on
    # art/awaiting-artwork.txt yet. It is not a different kind of gap - an undrawn card is
    # a silhouette either way, never a build failure - but it is the one the reader has not
    # seen before, which is worth a mark.
    is_fresh = card["id"] in fresh
    tier = card["tier"].capitalize()
    pnote = player_notes.get(card["id"])
    rows.append(
        "<tr>"
        f'<th scope="row">{E(card["name"])}'
        + ('<span class="new">new</span>' if is_fresh else "")
        + (f'<p class="note pnote">{E(pnote)}</p>' if pnote else "")
        + "</th>"
        f'<td class="num">{card["number"]}</td>'
        f"<td>{E(card['nation'])}</td>"
        f'<td class="num">{card["year"]}</td>'
        f'<td class="num">{card["rating"]}</td>'
        f'<td><span class="tier t-{tier.lower()}">{tier}</span></td>'
        + kit_cell(card)
        + f'<td class="bool-val">{"yes" if number_on_front(card) else "no"}</td>'
        + f'<td><button class="btn-copy" onclick="copyPrompt({len(rows)}, this)">Copy prompt</button></td>'
        + f'<td class="file"><code>{E(card["id"])}.png</code></td>'
        "</tr>"
    )

by_tier = {t: sum(1 for c in cards if c["tier"].capitalize() == t) for t in TIERS}
missing = len(cards)
collectibles = data["collectibles"]
n_fresh = sum(1 for c in cards if c["id"] in fresh)
no_kit = sum(1 for c in cards if not c.get("kit"))

# A card is one player at one tournament, so the same man can owe two. Derived rather than
# written down, because the list changes with every rating pass.
seen: dict[str, list[int]] = {}
for card in cards:
    seen.setdefault(card["name"], []).append(card["year"])
twice = sorted(
    f"{name} ({' and '.join(str(y) for y in sorted(years))})"
    for name, years in seen.items()
    if len(years) > 1
)

stats = [
    ("Collectibles in the dataset", collectibles),
    ("Drawn", collectibles - missing),
    ("Still to draw", missing),
]
tier_line = ", ".join(f"{by_tier[t]} {t}" for t in TIERS if by_tier[t])

notes = [
    "Generated by <code>npm run ratings:sync</code>. Do not edit by hand: the next rating "
    "change rewrites this page, and every figure on it is derived from the dataset at the "
    "commit named above.",
    "To draw a card: save the full-size PNG as <code>art/stickers-src/&lt;id&gt;.png</code>, "
    "the file name in the last column, then run <code>npm run ratings:sync</code>. It builds "
    "the small WebP the site serves and takes the card off the waiting list.",
    "Nothing here is breaking the build. An undrawn card shows the shared silhouette at the "
    "right size, so the album has a gap rather than a hole; a row marked <strong>new</strong> "
    "is one that has only just become collectible.",
    "<strong>Copy prompt</strong> puts that card's whole image-generation prompt on the "
    "clipboard, with the player, the nation, the year, the shorts colour and the "
    "number-on-front wording filled in. Attach the shirt photograph from "
    "<code>public/jerseys/</code> alongside it. The prompt's wording lives in "
    "<code>scripts/build-art-worklist.py</code>; edit it there, never here.",
    "The shorts column is <code>art/kits.json</code>, which is hand-written and says how sure "
    "each entry is. <strong>verified</strong> was checked against a source or against art "
    "already shipped for that squad, <strong>known</strong> is long-established colours, and "
    "<strong>standard</strong> is the nation's usual colours rather than the specific release "
    "worn that year. That file also records the shirt and the socks, which this table leaves "
    "out: the shirt is attached to the prompt as a photograph, so the shorts are the colour "
    "that has to be described. Correct one by editing the file, never this page.",
]
if twice:
    notes.append(
        "A card is one player at one tournament, so the same man needs a card for each. On "
        "this list: " + E(", ".join(twice)) + "."
    )
if no_kit:
    notes.append(
        f"{no_kit} of these cards have no kit recorded. Add the squad to "
        "<code>art/kits.json</code> and re-run the sync."
    )

# Tokens copied out of src/index.css, as docs/players.html copies them: this page ships no
# Tailwind and is opened straight off disk, so it cannot read the app's theme.
CSS = """
:root {
  --ground: #f4f1ea; --panel: #fffdf8; --ink: #16211b; --muted: #5c6660;
  --line: #d8d3c7; --hair: #e7e3d9; --pitch: #2f7d4f; --pitch-deep: #1e3a2a;
  --amber: #8a5a0f; --loss: #a4303f; --dim: #6f7873;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #121714; --panel: #1a201c; --ink: #eef2ef; --muted: #a3aca7;
    --line: #2c332e; --hair: #232a25; --pitch: #4aa76c; --pitch-deep: #0f1a13;
    --amber: #d99a3a; --loss: #d4707c; --dim: #98a19c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 20px 72px; background: var(--ground); color: var(--ink);
  font: 15px/1.5 "Schibsted Grotesk", "Segoe UI", system-ui, sans-serif;
}
.wrap { max-width: 1180px; margin: 0 auto; }
h1 {
  font: 700 30px/1.15 Archivo, "Segoe UI", system-ui, sans-serif;
  letter-spacing: -0.01em; margin: 0 0 4px;
}
.eyebrow {
  font: 600 11px/1 "Spline Sans Mono", ui-monospace, monospace; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--muted); margin: 0 0 18px;
}
.stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 8px; padding: 0; list-style: none; }
.stats li {
  border: 1px solid var(--line); background: var(--panel); border-radius: 6px;
  padding: 8px 14px; min-width: 132px;
}
.stats b { display: block; font: 600 22px/1.2 "Spline Sans Mono", ui-monospace, monospace; }
.stats span { font-size: 12px; color: var(--muted); }
.sub { color: var(--muted); margin: 0 0 24px; font-size: 13px; }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); }
table { border-collapse: collapse; width: 100%; min-width: 900px; }
thead th {
  background: var(--pitch-deep); color: #fff; text-align: left; padding: 10px 12px;
  font: 600 11px/1 "Spline Sans Mono", ui-monospace, monospace; letter-spacing: 0.1em;
  text-transform: uppercase; position: sticky; top: 0;
}
tbody th, tbody td { border-top: 1px solid var(--hair); padding: 10px 12px; vertical-align: top; text-align: left; }
tbody th { font-weight: 600; }
.num { font-family: "Spline Sans Mono", ui-monospace, monospace; text-align: right; white-space: nowrap; }
code { font-family: "Spline Sans Mono", ui-monospace, monospace; font-size: 12.5px; }
.file { white-space: nowrap; }
.tier {
  display: inline-block; border: 1px solid var(--line); border-radius: 999px;
  padding: 2px 9px; font-size: 12px; white-space: nowrap;
}
.t-monumental { border-color: var(--amber); color: var(--amber); font-weight: 600; }
.t-iconic { border-color: var(--pitch); color: var(--pitch); }
.kit { min-width: 210px; }
.kit .line { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.kit .lbl {
  width: 46px; flex: none; font: 600 10px/1 "Spline Sans Mono", ui-monospace, monospace;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
.sw {
  width: 15px; height: 15px; flex: none; border-radius: 3px; border: 1px solid var(--line);
}
.swn { font-size: 13px; }
.conf {
  display: inline-block; margin-top: 5px; border: 1px solid var(--line); border-radius: 3px;
  padding: 1px 6px; font: 600 10px/1.5 "Spline Sans Mono", ui-monospace, monospace;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
.c-verified { color: var(--pitch); border-color: var(--pitch); }
.c-standard { color: var(--amber); border-color: var(--amber); }
.note { margin: 5px 0 0; font-size: 12.5px; color: var(--dim); max-width: 44ch; }
.pnote { max-width: 30ch; font-weight: 400; }
.none { color: var(--dim); font-style: italic; }
.new {
  display: inline-block; margin-left: 7px; border-radius: 3px; padding: 1px 6px;
  background: var(--amber); color: var(--ground);
  font: 600 10px/1.6 "Spline Sans Mono", ui-monospace, monospace; letter-spacing: 0.08em;
  text-transform: uppercase; vertical-align: 1px;
}
h2 {
  font: 700 15px/1.2 Archivo, "Segoe UI", system-ui, sans-serif; margin: 34px 0 10px;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.btn-copy {
  background: var(--pitch); color: #fff; border: none; border-radius: 4px;
  padding: 6px 12px; cursor: pointer;
  font: 600 12px "Spline Sans Mono", ui-monospace, monospace;
}
.btn-copy:hover { background: var(--pitch-deep); }
.btn-copy:active { transform: scale(0.96); }
.btn-copy.copied { background: var(--amber); }
.bool-val {
  font-family: "Spline Sans Mono", ui-monospace, monospace; text-align: center;
}
.notes { margin: 0; padding-left: 20px; color: var(--muted); font-size: 13.5px; }
.notes li { margin-bottom: 8px; max-width: 92ch; }
"""

parts = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Sticker art still to draw</title>",
    f"<!-- fingerprint: {stamp} -->",
    "<!-- Generated by `npm run ratings:sync`. Do not edit by hand. -->",
    f"<style>{CSS}</style>",
    "</head>",
    "<body>",
    '<div class="wrap">',
    '<p class="eyebrow">Mondialino / sticker album</p>',
    "<h1>Sticker art still to draw</h1>",
    '<ul class="stats">',
]
for label, value in stats:
    parts.append(f"<li><b>{value}</b><span>{label}</span></li>")
parts.append("</ul>")
parts.append(
    f'<p class="sub">{tier_line or "nothing outstanding"}. '
    + (f"{n_fresh} of them new since the last pass. " if n_fresh else "")
    + f'Card set last changed {E(str(data["generated"]))}, with the dataset at '
    + f'<code>{E(str(data["commit"]))}</code>.</p>'
)

if cards:
    parts.append('<div class="scroll"><table>')
    parts.append(
        "<thead><tr>"
        "<th>Player</th><th>No.</th><th>Nation</th><th>World Cup</th><th>Rating</th>"
        "<th>Tier</th><th>Shorts</th><th>Number on front</th><th>Prompt</th>"
        "<th>File to add</th>"
        "</tr></thead><tbody>"
    )
    parts.extend(rows)
    parts.append("</tbody></table></div>")
else:
    parts.append("<p>Every collectible has artwork. Nothing to draw.</p>")

# The drawing prompt, which is what this page is FOR: the author generates each card from
# it. Rendered per row as a button rather than as text, because it is 3,000 characters and
# would bury the table. The function is the author's own wording, carried through verbatim -
# only the values it reads come from the dataset and art/kits.json.
PROMPT_FIELDS = [
    {
        "name": c["name"],
        "no": c["number"],
        "nation": c["nation"],
        "year": c["year"],
        "colorName": ((c.get("kit") or {}).get("shorts") or {}).get("name", "team-coloured"),
        "numOnFront": number_on_front(c),
    }
    for c in cards
]
SCRIPT = (
    "const players = " + json.dumps(PROMPT_FIELDS, ensure_ascii=False) + ";"
    + PROMPT_FN
    + """
function copyPrompt(index, btn) {
  navigator.clipboard.writeText(buildPrompt(players[index])).then(() => {
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy prompt';
      btn.classList.remove('copied');
    }, 2000);
  });
}
"""
)

parts.append("<h2>Notes</h2>")
parts.append('<ul class="notes">')
parts.extend(f"<li>{note}</li>" for note in notes)
parts.append("</ul>")
parts.append("</div>")
if cards:
    parts.append(f"<script>{SCRIPT}</script>")
parts.append("</body></html>")

with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(parts) + "\n")

print(f"build-art-worklist: {OUT} - {len(cards)} cards to draw, {n_fresh} new")
