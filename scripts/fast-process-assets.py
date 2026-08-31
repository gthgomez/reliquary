#!/usr/bin/env python3
"""Fast chroma-key, sheet split, and pixel-tile cook. No GIFs."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
ART = ROOT / "artifacts" / "imagine_images"
SPR = ROOT / "assets" / "sprites"
PUB = ROOT / "public" / "game"

RAW = {
    "player": "19df1da2-ebda-4b38-a561-c682e1fabb41.jpg",
    "grass": "d46e3719-6bae-4224-aead-6918728ff3a1.jpg",
    "dirt": "cff382e5-ed2c-4e37-9947-96538be5ae5f.jpg",
    "water": "82a9d4a6-ac58-42c4-878e-1238de725207.jpg",
    "cobble": "71ea4106-0c44-4941-958b-e13ee155673e.jpg",
    "wood": "ec8e94a3-7c20-45fe-8c18-387ca500fa21.jpg",
    "cave": "67f339cc-d447-4857-a006-9bd96a9084e2.jpg",
    "marsh": "310e1929-30ea-4acd-96f8-b8b975989dbd.jpg",
    "wall": "11f408be-a935-4050-bf4a-bee6bc7bbbf4.jpg",
    "emberkit": "deef0161-a741-4db1-a06d-a73950315d0e.jpg",
    "mirewhelp": "d93b7c60-8689-4bc5-86db-d7bc8a1626d0.jpg",
    "briarling": "5f597097-b5ab-49e5-996c-5f77246f528b.jpg",
    "pyrefox": "6e7db686-b331-4c4e-a562-ad2d3914cc2e.jpg",
    "crownwyrm": "574587d7-f6a6-4e8f-9d1a-837570ef7b9f.jpg",
    "riverguard": "8900c9dc-7600-4a3a-9495-49bdf2c7d029.jpg",
    "tidemark": "3ce3d82a-a06f-40e9-9e4d-3e370606cca7.jpg",
    "thornback": "a7626cb1-bedf-4c46-8537-29ea84058e8d.jpg",
    "elderbramble": "e38b8746-9c6a-49eb-a525-0d40180c3e2e.jpg",
    "keepdrake": "cf00b83b-ae2e-4c69-8719-0fd9512bda7e.jpg",
    "sunhart": "41362bf6-f757-4052-9d7e-a70a2da5b838.jpg",
    "fenwitch": "f3282d8e-21da-46a7-9705-92763b990375.jpg",
    "beasts": "b201e409-d462-416a-b636-1031be86eb0f.jpg",
    "npcs": "664c13ad-9e8a-446c-874b-ad77c0e1db42.jpg",
    "tree": "72ddd196-e23f-4dda-a1a1-46e7e6e28456.jpg",
    "cottage": "05fec91d-1bf6-48f9-90b7-3f24e045d135.jpg",
    "inn": "f03928c7-1963-430a-9d5e-007d9adbd0f3.jpg",
    "shop": "8392fa72-4403-4aa2-b70d-43068ee2fc10.jpg",
    "shrine": "7782318a-d378-4e31-a510-1370b220d7a1.jpg",
    "props": "b2ff36c4-115f-4551-a02c-f195f10456d5.jpg",
    "furniture": "4382e573-2610-4bce-a998-dfbbd6b5b566.jpg",
    "panel": "a7ba3d04-cde5-405c-a81a-ee15324aa6b6.jpg",
}

BEASTS = [
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
NPCS = ["elder", "innkeep", "shopkeep", "warden", "guard", "traveler"]
PROPS = ["sign", "barrel", "crate", "shrub", "boulder", "fence", "tallgrass", "pot", "well"]
FURN = ["bed", "table", "chair", "bookshelf", "hearth", "counter"]
CREATURES = [
    "emberkit",
    "mirewhelp",
    "briarling",
    "pyrefox",
    "crownwyrm",
    "riverguard",
    "tidemark",
    "thornback",
    "elderbramble",
    "keepdrake",
    "sunhart",
    "fenwitch",
]
BUILDINGS = ["tree", "cottage", "inn", "shop", "shrine"]


def chroma(im: Image.Image, thresh: float = 90.0, edge: float = 140.0) -> Image.Image:
    rgba = im.convert("RGBA")
    arr = np.array(rgba).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    dist = np.sqrt((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2)
    alpha = arr[:, :, 3]
    alpha[dist < thresh] = 0
    # edge despill: fade toward transparent and kill magenta channel
    spill = (dist >= thresh) & (dist < edge)
    fade = (dist[spill] - thresh) / (edge - thresh)
    alpha[spill] *= fade
    # remove remaining magenta tint
    mag = np.minimum(r, b)
    kill = mag > g + 30
    arr[:, :, 0] = np.where(kill, np.minimum(r, g + 20), r)
    arr[:, :, 2] = np.where(kill, np.minimum(b, g + 20), b)
    arr[:, :, 3] = alpha
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    return out


def split_grid(im: Image.Image, rows: int, cols: int) -> list[Image.Image]:
    w, h = im.size
    cw, ch = w // cols, h // rows
    frames = []
    for ry in range(rows):
        for cx in range(cols):
            cell = im.crop((cx * cw, ry * ch, (cx + 1) * cw, (ry + 1) * ch))
            frames.append(cell)
    return frames


def trim_alpha(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit_square(im: Image.Image, size: int) -> Image.Image:
    im = trim_alpha(im, 6)
    w, h = im.size
    scale = min(size / max(w, 1), size / max(h, 1))
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, size - nh), resized)
    return canvas


def pixel_tile(src: Path, dest: Path, cells: int = 16, display: int = 32, colors: int = 8) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    side = min(w, h) // 2
    left = (w - side) // 2
    top = (h - side) // 2
    crop = im.crop((left, top, left + side, top + side))
    small = crop.resize((cells, cells), Image.Resampling.BOX)
    pal = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    tile = pal.convert("RGB").resize((display, display), Image.Resampling.NEAREST)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tile.save(dest, "PNG")
    qc = Image.new("RGB", (display * 2, display * 2))
    for y in range(2):
        for x in range(2):
            qc.paste(tile, (x * display, y * display))
    qc.save(dest.with_name(dest.stem + "-2x2.png"), "PNG")


def save_frames(frames: list[Image.Image], dest_dir: Path, labels: list[str], size: int) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    for im, label in zip(frames, labels):
        keyed = chroma(im)
        fitted = fit_square(keyed, size)
        fitted.save(dest_dir / f"{label}.png", "PNG")


def main() -> None:
    # Tiles
    for name, colors in [
        ("grass", 6),
        ("dirt", 6),
        ("water", 7),
        ("cobble", 8),
        ("wood", 6),
        ("cave", 6),
        ("marsh", 7),
        ("wall", 6),
    ]:
        pixel_tile(ART / RAW[name], PUB / "tiles" / f"{name}.png", cells=16, display=32, colors=colors)

    # Player 4x4 at 48px cells, also assemble a sheet
    player = chroma(Image.open(ART / RAW["player"]))
    pframes = split_grid(player, 4, 4)
    labels = [f"{d}{i}" for d in ("down", "left", "right", "up") for i in range(4)]
    save_frames(pframes, PUB / "sprites" / "player", labels, 48)
    sheet = Image.new("RGBA", (48 * 4, 48 * 4), (0, 0, 0, 0))
    for i, lab in enumerate(labels):
        fr = Image.open(PUB / "sprites" / "player" / f"{lab}.png")
        sheet.paste(fr, ((i % 4) * 48, (i // 4) * 48), fr)
    sheet.save(PUB / "sprites" / "player.png", "PNG")

    # Creatures
    for name in CREATURES:
        keyed = chroma(Image.open(ART / RAW[name]))
        fit_square(keyed, 256).save(PUB / "sprites" / f"{name}.png", "PNG")

    # Beast pack 3x3
    beasts = chroma(Image.open(ART / RAW["beasts"]))
    save_frames(split_grid(beasts, 3, 3), PUB / "sprites", BEASTS, 256)

    # NPCs 2x3
    npcs = chroma(Image.open(ART / RAW["npcs"]))
    save_frames(split_grid(npcs, 2, 3), PUB / "sprites" / "npc", NPCS, 48)

    # Buildings / tree
    for name in BUILDINGS:
        keyed = chroma(Image.open(ART / RAW[name]))
        size = 128 if name == "tree" else 160 if name in ("cottage", "inn", "shop") else 96
        fit_square(keyed, size).save(PUB / "props" / f"{name}.png", "PNG")

    # Props 3x3
    props = chroma(Image.open(ART / RAW["props"]))
    save_frames(split_grid(props, 3, 3), PUB / "props", PROPS, 48)

    # Furniture 2x3
    furn = chroma(Image.open(ART / RAW["furniture"]))
    save_frames(split_grid(furn, 2, 3), PUB / "props", FURN, 64)

    # Panel
    panel = chroma(Image.open(ART / RAW["panel"]))
    trim_alpha(panel, 4).save(PUB / "ui" / "panel.png", "PNG")

    manifest = {
        "beasts": CREATURES + BEASTS,
        "npcs": NPCS,
        "props": BUILDINGS + PROPS + FURN,
        "tiles": ["grass", "dirt", "water", "cobble", "wood", "cave", "marsh", "wall"],
    }
    (PUB / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("done", json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
