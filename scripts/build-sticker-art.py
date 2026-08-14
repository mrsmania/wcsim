"""
Turn the sticker source art into the small WebP files the app actually ships.

    python scripts/build-sticker-art.py

Reads:   art/stickers-src/<player-id>.png   (the originals, versioned, not deployed)
Writes:  public/stickers/<player-id>.webp   (what the browser downloads)

Why: the originals are ~1.3 MB each at up to 1024x1536, and the album renders them
in a card a couple of hundred pixels wide - roughly thirty times more pixels than
ever reach the screen. At 400x600 WebP the same image is about 40 KB, so the whole
set goes from ~102 MB to ~3 MB.

Only the WebP files live under public/, so only they are deployed. Re-run this after
adding or replacing any source image; it skips files whose output is already newer.

Requires Pillow (pip install pillow). Deliberately a standalone script rather than a
build step: the art changes rarely and the output is committed.
"""

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

written = skipped = 0
src_bytes = out_bytes = 0

for name in sources:
    src = os.path.join(SRC_DIR, name)
    out = os.path.join(OUT_DIR, os.path.splitext(name)[0] + ".webp")
    src_bytes += os.path.getsize(src)

    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        out_bytes += os.path.getsize(out)
        skipped += 1
        continue

    with Image.open(src) as im:
        im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA") else im.convert("RGB")
        im.thumbnail((MAX_WIDTH, MAX_WIDTH * 4), Image.LANCZOS)
        im.save(out, "webp", quality=QUALITY, method=6)

    out_bytes += os.path.getsize(out)
    written += 1

mb = lambda n: n / 1024 / 1024
print(f"build-sticker-art: {written} written, {skipped} unchanged")
print(f"  sources {mb(src_bytes):.1f} MB  ->  shipped {mb(out_bytes):.1f} MB", end="")
if out_bytes:
    print(f"  ({src_bytes / out_bytes:.0f}x smaller)")
else:
    print()
