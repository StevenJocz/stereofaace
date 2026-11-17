"""Genera los GIFs propios de la bandeja del chat (public/chat/gifs). Uso: python scripts/make-chat-gifs.py"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "chat", "gifs")
os.makedirs(OUT, exist_ok=True)
S = 160
BG = (14, 16, 20)
ACC = (198, 255, 0)
VIO = (155, 107, 255)
WHITE = (242, 242, 238)
FONT = "C:/Windows/Fonts/arialbd.ttf"


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default(size)


def frame(draw_fn, i, n):
    im = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(im)
    draw_fn(d, i, n)
    return im


def save(name, draw_fn, n=12, ms=80):
    frames = [frame(draw_fn, i, n) for i in range(n)]
    frames[0].save(os.path.join(OUT, name + ".gif"), save_all=True, append_images=frames[1:], duration=ms, loop=0, optimize=True, disposal=2)


def center_text(d, text, y, size, fill):
    f = font(size)
    w = d.textlength(text, font=f)
    d.text(((S - w) / 2, y), text, font=f, fill=fill)


def fuego(d, i, n):
    t = i / n * 2 * math.pi
    for k, (col, sc) in enumerate([((255, 80, 20), 1.0), ((255, 160, 20), 0.72), ((255, 230, 120), 0.42)]):
        w = 46 * sc
        h = 92 * sc + 8 * math.sin(t * 2 + k)
        cx = 80 + 4 * math.sin(t + k)
        base = 138
        pts = [(cx - w, base), (cx - w * 0.9, base - h * 0.45), (cx - w * 0.3 + 5 * math.sin(t * 3), base - h * 0.7), (cx + 4 * math.sin(t * 2), base - h), (cx + w * 0.4, base - h * 0.62), (cx + w * 0.95, base - h * 0.4), (cx + w, base)]
        d.polygon(pts, fill=col)
    center_text(d, "FUEGO", 140, 16, ACC)


def baile(d, i, n):
    t = i / n * 2 * math.pi
    # barras de ecualizador
    for k in range(7):
        h = 20 + 50 * abs(math.sin(t + k * 0.8))
        x = 18 + k * 20
        d.rectangle([x, 150 - h, x + 12, 150], fill=ACC if k % 2 == 0 else VIO)
    # bailarín
    bob = 5 * math.sin(t * 2)
    cx, cy = 80, 50 + bob
    d.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], fill=WHITE)
    d.line([cx, cy + 11, cx, cy + 46], fill=WHITE, width=6)
    a = math.sin(t) * 0.9
    d.line([cx, cy + 20, cx - 26, cy + 4 - 22 * a], fill=WHITE, width=5)
    d.line([cx, cy + 20, cx + 26, cy + 4 + 22 * a], fill=WHITE, width=5)
    d.line([cx, cy + 46, cx - 14 - 8 * a, cy + 78], fill=WHITE, width=5)
    d.line([cx, cy + 46, cx + 14 + 8 * a, cy + 78], fill=WHITE, width=5)


def aplauso(d, i, n):
    t = i / n * 2 * math.pi
    gap = 8 + 22 * (0.5 + 0.5 * math.cos(t * 2))
    for sx in (-1, 1):
        x = 80 + sx * gap
        d.rounded_rectangle([x - 18, 48, x + 18, 112], radius=16, fill=(255, 205, 150))
    if gap < 14:
        for ang in range(0, 360, 45):
            r1, r2 = 54, 70
            a = math.radians(ang)
            d.line([80 + r1 * math.cos(a), 80 + r1 * math.sin(a), 80 + r2 * math.cos(a), 80 + r2 * math.sin(a)], fill=ACC, width=4)
    center_text(d, "BRAVO", 128, 20, ACC)


def corazon(d, i, n):
    t = i / n * 2 * math.pi
    sc = 1 + 0.18 * math.sin(t * 2)
    r = 30 * sc
    cx, cy = 80, 70
    d.ellipse([cx - 2 * r + r * 0.3, cy - r, cx + r * 0.3, cy + r * 0.3 + 4], fill=(255, 60, 110))
    d.ellipse([cx - r * 0.3, cy - r, cx + 2 * r - r * 0.3, cy + r * 0.3 + 4], fill=(255, 60, 110))
    d.polygon([(cx - 2 * r + r * 0.42, cy - r * 0.05), (cx + 2 * r - r * 0.42, cy - r * 0.05), (cx, cy + 2.3 * r)], fill=(255, 60, 110))
    center_text(d, "AMOR", 132, 20, WHITE)


def onair(d, i, n):
    on = (i // 3) % 2 == 0
    col = (255, 60, 60) if on else (90, 25, 25)
    d.rounded_rectangle([14, 38, S - 14, 112], radius=14, fill=(26, 14, 14), outline=col, width=5)
    center_text(d, "ON AIR", 52, 36, col)
    d.ellipse([S - 38, 46, S - 26, 58], fill=col)


def gracias(d, i, n):
    t = i / n * 2 * math.pi
    word = "GRACIAS"
    f = font(22)
    total = sum(d.textlength(c, font=f) for c in word)
    x = (S - total) / 2
    for k, c in enumerate(word):
        y = 62 + 12 * math.sin(t + k * 0.8)
        d.text((x, y), c, font=f, fill=ACC if k % 2 == 0 else VIO)
        x += d.textlength(c, font=f)
    for k in range(6):
        a = t + k * 1.1
        d.ellipse([80 + 58 * math.cos(a) - 3, 80 + 52 * math.sin(a) - 3, 80 + 58 * math.cos(a) + 3, 80 + 52 * math.sin(a) + 3], fill=WHITE)


def wow(d, i, n):
    t = i / n
    cx = cy = 80
    for k in range(12):
        ang = k / 12 * 2 * math.pi + t * 0.6
        r1 = 18 + 40 * t
        r2 = r1 + 26
        d.line([cx + r1 * math.cos(ang), cy + r1 * math.sin(ang), cx + r2 * math.cos(ang), cy + r2 * math.sin(ang)], fill=ACC if k % 2 else VIO, width=5)
    center_text(d, "WOW", 58, 38, WHITE)


def vinilo(d, i, n):
    ang = i / n * 2 * math.pi
    cx = cy = 80
    d.ellipse([cx - 62, cy - 62, cx + 62, cy + 62], fill=(30, 32, 38))
    for r in (54, 46, 38):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(52, 56, 66), width=2)
    d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=ACC)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=BG)
    d.line([cx, cy, cx + 20 * math.cos(ang), cy + 20 * math.sin(ang)], fill=BG, width=4)
    # brillo que gira
    d.arc([cx - 62, cy - 62, cx + 62, cy + 62], start=math.degrees(ang) % 360, end=(math.degrees(ang) + 40) % 360, fill=WHITE, width=3)


for name, fn in [("fuego", fuego), ("baile", baile), ("aplauso", aplauso), ("corazon", corazon), ("onair", onair), ("gracias", gracias), ("wow", wow), ("vinilo", vinilo)]:
    save(name, fn)
    print("ok", name)
