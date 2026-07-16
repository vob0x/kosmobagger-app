#!/usr/bin/env python3
"""Erzeugt die PWA-App-Icons aus einer Maschinen-Grafik auf kosmischem Grund.
    python3 make_pwa_icons.py
Ergebnis: icons/icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png
"""
import os, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

HIER = Path(__file__).resolve().parent
SUBJ = HIER.parent / "05_Pipeline" / "artwork" / "maschinen_freigestellt" / "KOS-6_frei.png"
OUT = HIER / "icons"; OUT.mkdir(exist_ok=True)
random.seed(7)


def kosmos(size, glow=(90, 130, 255)):
    """Kosmischer Hintergrund: radialer Verlauf + Sterne + weicher Glow."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    cx, cy = size / 2, size * 0.46
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / (size * 0.72)
            d = min(1, d)
            r = int(30 * (1 - d) + 8 * d);  g = int(40 * (1 - d) + 12 * d);  b = int(78 * (1 - d) + 22 * d)
            px[x, y] = (r, g, b)
    d = ImageDraw.Draw(img)
    for _ in range(int(size * 0.9)):
        x, y = random.random() * size, random.random() * size
        a = random.random(); rr = random.choice([1, 1, 1, 2])
        c = int(150 + 105 * a)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(c, c + 10, 255))
    # weicher Glow-Kreis
    gl = Image.new("RGB", (size, size), (0, 0, 0))
    gd = ImageDraw.Draw(gl)
    gd.ellipse([size * .2, size * .18, size * .8, size * .78], fill=glow)
    gl = gl.filter(ImageFilter.GaussianBlur(size * 0.14))
    img = Image.blend(img, Image.blend(img, gl, 0.0), 0.0)
    img = Image.composite(Image.new("RGB", (size, size), glow), img, gl.convert("L").point(lambda v: int(v * 0.35)))
    return img


def build(size, subj_frac, opaque=True, name="icon.png"):
    bg = kosmos(size)
    subj = Image.open(SUBJ).convert("RGBA")
    target = int(size * subj_frac)
    sc = min(target / subj.width, target / subj.height)
    subj = subj.resize((max(1, int(subj.width * sc)), max(1, int(subj.height * sc))), Image.LANCZOS)
    # Schlagschatten
    sh = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    sh.paste((0, 0, 0, 150), ((size - subj.width) // 2 + int(size*0.01), (size - subj.height) // 2 + int(size*0.02)), subj)
    sh = sh.filter(ImageFilter.GaussianBlur(size * 0.02))
    out = bg.convert("RGBA"); out.alpha_composite(sh)
    out.alpha_composite(subj, ((size - subj.width) // 2, (size - subj.height) // 2))
    out = out.convert("RGB") if opaque else out
    out.save(OUT / name)
    return name


build(512, 0.74, True, "icon-512.png")
build(192, 0.74, True, "icon-192.png")
build(512, 0.60, True, "icon-512-maskable.png")   # mehr Rand fuer die Maskable-Safe-Zone
build(180, 0.74, True, "apple-touch-icon.png")
# favicon
Image.open(OUT / "icon-192.png").resize((64, 64), Image.LANCZOS).save(OUT / "favicon-64.png")
print("Icons erzeugt in", OUT)
for f in sorted(os.listdir(OUT)):
    print("  ", f)
