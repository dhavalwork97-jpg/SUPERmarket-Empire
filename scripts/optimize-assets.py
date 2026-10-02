#!/usr/bin/env python3
"""Builds mobile-friendly WebP copies of public/assets/**.png into public/assets/web/**.
Originals are left untouched. Each image is trimmed to its visible bounds and downscaled."""
import glob, os
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "assets")
MAX = {"aisles": 320, "characters": 256, "checkouts": 320, "icons": 128, "effects": 320, "branding": 512, "environment": 512}
KEEP_FULL = {"floor-tile", "floor-tile-dirty"}  # floor tiles are not trimmed (they must tile edge to edge)
for src in sorted(glob.glob(os.path.join(ROOT, "*", "*.png"))):
    folder = os.path.basename(os.path.dirname(src)); name = os.path.basename(src).replace(".png.png", ".png")[:-4]
    im = Image.open(src).convert("RGBA")
    if name not in KEEP_FULL:
        bb = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if bb: im = im.crop(bb)
    m = MAX.get(folder, 256); im.thumbnail((m, m), Image.LANCZOS)
    out_dir = os.path.join(ROOT, "web", folder); os.makedirs(out_dir, exist_ok=True)
    im.save(os.path.join(out_dir, name + ".webp"), "WEBP", quality=82, method=6)
    print(folder, name, im.size)
