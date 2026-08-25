"""
Turn the sticker source art into the small WebP files the app actually ships.

    python scripts/build-sticker-art.py
    python scripts/build-sticker-art.py --force   # re-encode everything

Reads:   art/stickers-src/<player-id>.png   (the originals, versioned, not deployed)
Writes:  public/stickers/<player-id>.webp   (what the browser downloads)

Why: the originals are ~1.3 MB each at up to 1024x1536, and the album renders them
in a card a couple of hundred pixels wide - roughly thirty times more pixels than
ever reach the screen. At 400x600 WebP the same image is about 40 KB, so the whole
set goes from ~102 MB to ~3 MB.

Only the WebP files live under public/, so only they are deployed. Re-run this after
adding or replacing any source image; it skips sources whose CONTENT it has already
encoded, recorded as digests in art/stickers-src/.art-digests.json. Use --force after
changing MAX_WIDTH or QUALITY, where the sources have not moved.

Requires Pillow (pip install pillow). Deliberately a standalone script rather than a
build step: the art changes rarely and the output is committed.
"""

import hashlib
import json
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("build-sticker-art: needs Pillow.  pip install pillow")

SRC_DIR = os.path.join("art", "stickers-src")
OUT_DIR = os.path.join("public", "stickers")

# Card art is portrait 2:3 and rendered a few hundred pixels wide; 400 wide covers a
# high-DPI phone with room to spare.
MAX_WIDTH = 400
QUALITY = 82

if not os.path.isdir(SRC_DIR):
    sys.exit(f"build-sticker-art: {SRC_DIR} not found (that is where the originals live)")

os.makedirs(OUT_DIR, exist_ok=True)

sources = sorted(f for f in os.listdir(SRC_DIR) if f.lower().endswith((".png", ".jpg", ".jpeg")))
if not sources:
    sys.exit(f"build-sticker-art: no images in {SRC_DIR}")

# --force re-encodes everything, for a quality or width change (where the sources have
# not moved and so no digest has).
FORCE = "--force" in sys.argv[1:]

# Beside the SOURCES, not the outputs: OUT_DIR is under public/, so a sidecar there would
# be deployed with the site for no reason.
STAMP_PATH = os.path.join(SRC_DIR, ".art-digests.json")


def _digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


try:
    with open(STAMP_PATH, encoding="utf-8") as fh:
        stamps = json.load(fh)
    if not isinstance(stamps, dict):
        stamps = {}
except (OSError, ValueError):
    stamps = {}

written = skipped = 0
src_bytes = out_bytes = 0

for name in sources:
    src = os.path.join(SRC_DIR, name)
    out = os.path.join(OUT_DIR, os.path.splitext(name)[0] + ".webp")
    src_bytes += os.path.getsize(src)

    # Freshness by CONTENT, not by mtime. mtime said "already done" for a source that had
    # been restored from a backup, checked out again, or rsync -t'd into place with its old
    # timestamp - so replacing a piece of art could silently ship the previous one
    # (hygiene H100). The digests live in a small sidecar next to the output.
    digest = _digest(src)
    if os.path.exists(out) and stamps.get(name) == digest and not FORCE:
        out_bytes += os.path.getsize(out)
        skipped += 1
        continue

    with Image.open(src) as im:
        im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") else im.convert("RGB")
        im.thumbnail((MAX_WIDTH, MAX_WIDTH * 4), Image.LANCZOS)
        im.save(out, "webp", quality=QUALITY, method=6)

    out_bytes += os.path.getsize(out)
    stamps[name] = digest
    written += 1

# Written once at the end, so an interrupted run simply re-encodes next time rather than
# recording work it did not finish.
try:
    with open(STAMP_PATH, "w", encoding="utf-8") as fh:
        json.dump(stamps, fh, indent=0, sort_keys=True)
except OSError as err:
    print(f"  (could not write {STAMP_PATH}: {err} - the next run will re-encode)")

mb = lambda n: n / 1024 / 1024
print(f"build-sticker-art: {written} written, {skipped} unchanged")
print(f"  sources {mb(src_bytes):.1f} MB  ->  shipped {mb(out_bytes):.1f} MB", end="")
if out_bytes:
    print(f"  ({src_bytes / out_bytes:.0f}x smaller)")
else:
    print()
