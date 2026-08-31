#!/usr/bin/env python3
"""Restore clean player frames and strip leftover chroma film from sprites."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
PUB = ROOT / "public" / "game"
ART = ROOT / "assets" / "sprites"

BEAST_PACK = [
    "mothwisp",
    "gravepup",
    "pebblet",
    "galeskip",
    "ironnewt",
    "bogwallow",
    "hollowowl",
    "chapelite",
    "rootwight",
]
PLAYER_LABELS = [f"{d}{i}" for d in ("down", "left", "right", "up") for i in range(4)]


def chroma(im: Image.Image, thresh: float = 110.0, edge: float = 175.0) -> Image.Image:
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    dist = np.sqrt((r - 255) ** 2 + g**2 + (b - 255) ** 2)
    alpha = arr[:, :, 3]
    alpha[dist < thresh] = 0
    spill = (dist >= thresh) & (dist < edge)
    fade = (dist[spill] - thresh) / (edge - thresh)
    alpha[spill] *= fade
    mag = np.minimum(r, b)
    kill = mag > g + 24
    arr[:, :, 0] = np.where(kill, np.minimum(r, g + 18), r)
    arr[:, :, 2] = np.where(kill, np.minimum(b, g + 18), b)
    arr[:, :, 3] = alpha
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def flood_bg(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    h, w = a.shape[:2]
    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def push(y: int, x: int) -> None:
        if 0 <= y < h and 0 <= x < w and not vis[y, x]:
            vis[y, x] = True
            q.append((y, x))

    for x in range(w):
        push(0, x)
        push(h - 1, x)
    for y in range(h):
        push(y, 0)
        push(y, w - 1)

    while q:
        y, x = q.popleft()
        r, g, b, al = (int(v) for v in a[y, x])
        mag = ((r - 255) ** 2 + g * g + (b - 255) ** 2) ** 0.5
        dark_film = al < 170 and r < 48 and b < 48 and g < 36
        mag_like = mag < 95 or (r > 90 and b > 90 and g + 20 < min(r, b) and al < 230)
        if not (al < 40 or dark_film or mag_like):
            vis[y, x] = False
            continue
        a[y, x, 3] = 0
        push(y + 1, x)
        push(y - 1, x)
        push(y, x + 1)
        push(y, x - 1)

    a[:, :, 3] = np.where(a[:, :, 3] < 30, 0, a[:, :, 3])
    return Image.fromarray(a, "RGBA")


def keep_largest(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    h, w = a.shape[:2]
    mask = a[:, :, 3] >= 40
    seen = np.zeros((h, w), dtype=bool)
    best: list[tuple[int, int]] = []
    best_n = 0
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            comp: list[tuple[int, int]] = []
            while stack:
                cy, cx = stack.pop()
                comp.append((cy, cx))
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(comp) > best_n:
                best_n = len(comp)
                best = comp
    out = np.zeros_like(a)
    for y, x in best:
        out[y, x] = a[y, x]
    return Image.fromarray(out, "RGBA")


def fit_square(im: Image.Image, size: int) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    a[:, :, 3] = np.where(a[:, :, 3] < 30, 0, a[:, :, 3])
    im = Image.fromarray(a, "RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    scale = min(size / max(w, 1), size / max(h, 1)) * 0.92
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, size - nh), resized)
    return canvas


def split_grid(im: Image.Image, rows: int, cols: int) -> list[Image.Image]:
    w, h = im.size
    cw, ch = w // cols, h // rows
    frames = []
    for ry in range(rows):
        for cx in range(cols):
            frames.append(im.crop((cx * cw, ry * ch, (cx + 1) * cw, (ry + 1) * ch)))
    return frames


def cook_player() -> None:
    dest = PUB / "sprites" / "player"
    dest.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (96 * 4, 96 * 4), (0, 0, 0, 0))
    for i, lab in enumerate(PLAYER_LABELS):
        src = ART / "player" / f"player_sheet-{i + 1}.png"
        im = flood_bg(Image.open(src))
        im = keep_largest(im)
        im = fit_square(im, 96)
        im.save(dest / f"{lab}.png", "PNG")
        sheet.paste(im, ((i % 4) * 96, (i // 4) * 96), im)
    sheet.save(PUB / "sprites" / "player.png", "PNG")
    print("player frames", len(PLAYER_LABELS))


def cook_beast_pack() -> None:
    raw = chroma(Image.open(ART / "beasts" / "raw-sheet.png"))
    raw = flood_bg(raw)
    frames = split_grid(raw, 3, 3)
    dest = PUB / "sprites"
    for im, name in zip(frames, BEAST_PACK):
        out = fit_square(keep_largest(flood_bg(im)), 256)
        out.save(dest / f"{name}.png", "PNG")
        print("beast", name, "opaque", round(np.mean(np.array(out)[:, :, 3] > 10) * 100, 1))


def recook_file(path: Path, size: int | None = None) -> None:
    im = flood_bg(Image.open(path))
    im = keep_largest(im)
    if size:
        im = fit_square(im, size)
    else:
        a = np.array(im)
        a[:, :, 3] = np.where(a[:, :, 3] < 30, 0, a[:, :, 3])
        im = Image.fromarray(a, "RGBA")
    im.save(path, "PNG")
    print("cleaned", path.name, "opaque", round(np.mean(np.array(im)[:, :, 3] > 10) * 100, 1))


def main() -> None:
    cook_player()
    cook_beast_pack()
    extras = [
        "briarling",
        "sunhart",
        "elderbramble",
        "thornback",
        "emberkit",
        "mirewhelp",
        "pyrefox",
        "crownwyrm",
        "riverguard",
        "tidemark",
        "keepdrake",
        "fenwitch",
    ]
    for name in extras:
        p = PUB / "sprites" / f"{name}.png"
        if p.exists():
            recook_file(p, 256)
    for p in (PUB / "sprites" / "npc").glob("*.png"):
        recook_file(p, 48)


if __name__ == "__main__":
    main()
