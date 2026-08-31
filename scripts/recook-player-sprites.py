#!/usr/bin/env python3
"""Replate player frames: magenta-key JPEG edits, hard alpha, shared-scale 32x48."""
from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
PUB = ROOT / "public" / "game" / "sprites" / "player"
SRC = ROOT / "assets" / "sprites" / "player" / "replate"
LABELS = [f"{d}{i}" for d in ("down", "left", "right", "up") for i in range(4)]

# imagine_image_to_image outputs (16 direction frames, magenta bg, no tan plate)
RAW = {
    "down0": "fac3c37f-f272-4274-bbe7-a9fde1fea6f6.jpg",
    "down1": "a5a7f675-610e-498d-95ba-0ba335083d8d.jpg",
    "down2": "937530e5-eda6-4f81-9988-92ee160b48d0.jpg",
    "down3": "9ac970cd-fb5e-47d2-be67-45233a066a09.jpg",
    "left0": "9b10ff25-8a09-423c-80c1-58a5a1ebbdbe.jpg",
    "left1": "2cba389b-9bb2-405d-aaaf-a8102c79e625.jpg",
    "left2": "2adebc58-c1ba-4623-b261-0f20583cfd11.jpg",
    "left3": "d5803ad1-5b2f-486b-975b-32d65b72d810.jpg",
    "right0": "bae72ca0-7fa6-4840-9547-a81801318505.jpg",
    "right1": "240038bf-1422-4586-bed9-a09ae8bf66db.jpg",
    "right2": "91f0d17c-22bb-4aa4-9721-cc29fa4c7c99.jpg",
    "right3": "52cbbeb5-24d9-43f6-8496-d270a07fe947.jpg",
    "up0": "f03a0b64-1355-4ab9-b34b-047ecf0c3460.jpg",
    "up1": "d6aee63e-bb96-4eaa-a19f-047a49b922ce.jpg",
    "up2": "75ba036a-56a0-409f-a555-fd6d6fdce6e7.jpg",
    "up3": "9c6ac5aa-04bb-4681-8316-5518ded2c562.jpg",
}


def dilate(m: np.ndarray) -> np.ndarray:
    o = m.copy()
    o[1:, :] |= m[:-1, :]
    o[:-1, :] |= m[1:, :]
    o[:, 1:] |= m[:, :-1]
    o[:, :-1] |= m[:, 1:]
    return o


def magenta_key(im: Image.Image, thresh: int = 135, edge: int = 175) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    r = a[:, :, 0].astype(np.int32)
    g = a[:, :, 1].astype(np.int32)
    b = a[:, :, 2].astype(np.int32)
    mag = np.sqrt((r - 255) ** 2 + g.astype(np.int32) ** 2 + (b - 255) ** 2)
    pink = (r > 170) & (b > 130) & (g < 100)
    drop = (mag < thresh) | pink
    a[drop, 3] = 0
    trans = a[:, :, 3] == 0
    near = mag < edge
    for _ in range(10):
        grow = dilate(trans) & near & (a[:, :, 3] > 0)
        if not grow.any():
            break
        a[grow, 3] = 0
        trans = a[:, :, 3] == 0
    # despill remaining magenta tint on the silhouette
    keep = a[:, :, 3] > 0
    spill = keep & (r > g + 12) & (b > g + 12)
    a[spill, 0] = np.clip(g[spill] + 8, 0, 255).astype(np.uint8)
    a[spill, 2] = np.clip(g[spill] + 8, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def keep_largest(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    mask = a[:, :, 3] > 0
    if not mask.any():
        return im
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
    sub = mask[y0:y1, x0:x1]
    # downsample for CC
    step = 4 if min(sub.shape) > 80 else 1
    small = sub[::step, ::step]
    sh, sw = small.shape
    seen = np.zeros_like(small, dtype=bool)
    best = None
    best_n = 0
    for y in range(sh):
        for x in range(sw):
            if not small[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            n = 0
            cells: list[tuple[int, int]] = []
            while stack:
                cy, cx = stack.pop()
                cells.append((cy, cx))
                n += 1
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if n > best_n:
                best_n = n
                best = cells
    keep_small = np.zeros_like(small, dtype=bool)
    if best:
        for y, x in best:
            keep_small[y, x] = True
    keep_small = dilate(keep_small)
    # upsample
    keep = np.zeros_like(mask, dtype=bool)
    up = np.repeat(np.repeat(keep_small, step, axis=0), step, axis=1)[: sub.shape[0], : sub.shape[1]]
    keep[y0:y1, x0:x1] = up
    out = np.zeros_like(a)
    out[keep] = a[keep]
    return Image.fromarray(out, "RGBA")


def hard_alpha(im: Image.Image, cut: int = 180) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    r = a[:, :, 0].astype(np.int32)
    g = a[:, :, 1].astype(np.int32)
    b = a[:, :, 2].astype(np.int32)
    mag = np.sqrt((r - 255) ** 2 + g.astype(np.int32) ** 2 + (b - 255) ** 2)
    drop = (a[:, :, 3] < cut) | (mag < 90)
    a[drop, 3] = 0
    a[~drop, 3] = 255
    return Image.fromarray(a, "RGBA")


def main() -> None:
    art = ROOT / "artifacts" / "imagine_images"
    SRC.mkdir(parents=True, exist_ok=True)
    keyed: list[Image.Image] = []
    boxes: list[tuple[int, int, int, int]] = []
    for lab in LABELS:
        src = art / RAW[lab]
        dest = SRC / f"{lab}.jpg"
        shutil.copy2(src, dest)
        im = hard_alpha(keep_largest(magenta_key(Image.open(src))))
        bbox = im.getbbox()
        if not bbox:
            raise SystemExit(f"empty frame {lab}")
        keyed.append(im)
        boxes.append(bbox)
        print(lab, "bbox", bbox, "w", bbox[2] - bbox[0], "h", bbox[3] - bbox[1])

    max_w = max(b[2] - b[0] for b in boxes)
    max_h = max(b[3] - b[1] for b in boxes)
    tw, th = 32, 48
    scale = min((tw - 2) / max_w, (th - 2) / max_h)
    print("shared", max_w, max_h, "scale", round(scale, 4))

    PUB.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (tw * 4, th * 4), (0, 0, 0, 0))
    for i, lab in enumerate(LABELS):
        im = keyed[i]
        bbox = boxes[i]
        crop = im.crop(bbox)
        nw = max(1, int(round((bbox[2] - bbox[0]) * scale)))
        nh = max(1, int(round((bbox[3] - bbox[1]) * scale)))
        resized = crop.resize((nw, nh), Image.Resampling.BOX)
        resized = hard_alpha(resized, cut=160)
        canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        canvas.paste(resized, ((tw - nw) // 2, th - nh), resized)
        canvas.save(PUB / f"{lab}.png", "PNG")
        sheet.paste(canvas, ((i % 4) * tw, (i // 4) * th), canvas)
        opaque = float(np.mean(np.array(canvas)[:, :, 3] > 0) * 100)
        print("out", lab, f"{opaque:.1f}%")
    sheet.save(ROOT / "public" / "game" / "sprites" / "player.png", "PNG")

    # green strip for visual QC
    strip = Image.new("RGB", (tw * 4 * 6 + 8, th * 6 + 8), (20, 170, 70))
    for i, lab in enumerate(LABELS[:4]):
        fr = Image.open(PUB / f"{lab}.png").convert("RGBA")
        big = fr.resize((tw * 6, th * 6), Image.Resampling.NEAREST)
        bg = Image.new("RGBA", big.size, (20, 170, 70, 255))
        strip.paste(Image.alpha_composite(bg, big), (4 + i * tw * 6, 4))
    qc = ROOT / "screenshots" / "player-clean.jpg"
    strip.save(qc, "JPEG", quality=92)
    print("qc", qc)


if __name__ == "__main__":
    main()
