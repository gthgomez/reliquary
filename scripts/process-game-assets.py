#!/usr/bin/env python3
"""Copy Imagine outputs, chroma-key sprites, and slice tiles for Reliquary."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace")
ART = ROOT / "artifacts" / "imagine_images"
SPR = ROOT / "assets" / "sprites"
TILES = ROOT / "assets" / "tiles"
PUB = ROOT / "public" / "game"
PROC = ROOT / ".grok" / "skills" / "generate2dsprite" / "scripts" / "generate2dsprite.py"
EXTRACT = ROOT / ".grok" / "skills" / "generate2dmap" / "scripts" / "extract_prop_pack.py"

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
    "title": "e6cd5a1b-5c99-4add-a090-c051c9ddb041.jpg",
    "bg_grass": "eced3071-112a-4903-b9ec-fc703cc23e1f.jpg",
    "bg_forest": "6155a2cc-3a16-4ebd-95a4-bf74e4057465.jpg",
    "bg_cave": "7cca101f-7ccb-4dac-b591-56d111e95e29.jpg",
    "bg_marsh": "7c953e76-29a7-4897-8f84-065a7dd8f01f.jpg",
    "bg_keep": "ef1e870a-6e4a-41fd-8dce-f34580a9b210.jpg",
}

BEAST_LABELS = [
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
NPC_LABELS = ["elder", "innkeep", "shopkeep", "warden", "guard", "traveler"]
PROP_LABELS = [
    "sign",
    "barrel",
    "crate",
    "shrub",
    "boulder",
    "fence",
    "tallgrass",
    "pot",
    "well",
]
FURN_LABELS = ["bed", "table", "chair", "bookshelf", "hearth", "counter"]
SINGLES = [
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
    "tree",
    "cottage",
    "inn",
    "shop",
    "shrine",
]


def to_png(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGB")
    im.save(dest, "PNG")


def make_tile(src: Path, dest: Path, size: int = 32) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGB")
    tile = im.resize((size, size), Image.Resampling.BOX)
    tile.save(dest, "PNG")
    qc = Image.new("RGB", (size * 2, size * 2))
    for y in range(2):
        for x in range(2):
            qc.paste(tile, (x * size, y * size))
    qc.save(dest.with_name(dest.stem + "-2x2.png"), "PNG")


def process_sheet(name: str, target: str, mode: str, rows: int, cols: int, labels: str | None = None) -> None:
    raw = SPR / name / "raw-sheet.png"
    out = SPR / name
    cmd = [
        "python3",
        str(PROC),
        "process",
        "--input",
        str(raw),
        "--target",
        target,
        "--mode",
        mode,
        "--rows",
        str(rows),
        "--cols",
        str(cols),
        "--output-dir",
        str(out),
        "--shared-scale",
        "--align",
        "feet" if target in ("player", "npc", "creature") else "center",
        "--component-mode",
        "largest",
    ]
    if labels:
        cmd += ["--label-prefix", labels]
    print("PROCESS", name, flush=True)
    subprocess.run(cmd, check=True)


def copy_public(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def main() -> None:
    for key, fname in RAW.items():
        src = ART / fname
        if not src.exists():
            print("MISSING", key, src)
            continue
        if key in (
            "grass",
            "dirt",
            "water",
            "cobble",
            "wood",
            "cave",
            "marsh",
            "wall",
        ):
            to_png(src, TILES / f"{key}-raw.png")
            make_tile(src, PUB / "tiles" / f"{key}.png", 32)
            make_tile(src, TILES / f"{key}-64.png", 64)
        elif key.startswith("bg_") or key == "title":
            dest = PUB / "bg" / f"{key}.jpg"
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            to_png(src, PUB / "bg" / f"{key}.png")
        elif key == "panel":
            to_png(src, SPR / "panel" / "raw-sheet.png")
        else:
            to_png(src, SPR / key / "raw-sheet.png")

    process_sheet("player", "player", "player_sheet", 4, 4)
    for name in SINGLES:
        target = "creature" if name not in ("tree", "cottage", "inn", "shop", "shrine") else "asset"
        process_sheet(name, target, "single", 1, 1)
    process_sheet("beasts", "creature", "sheet", 3, 3, "beast")
    process_sheet("npcs", "npc", "sheet", 2, 3, "npc")
    process_sheet("props", "asset", "sheet", 3, 3, "prop")
    process_sheet("furniture", "asset", "sheet", 2, 3, "furn")
    process_sheet("panel", "asset", "single", 1, 1)

    # Public copies
    player_sheet = SPR / "player" / "sheet-transparent.png"
    if player_sheet.exists():
        copy_public(player_sheet, PUB / "sprites" / "player.png")
    for name in SINGLES:
        t = SPR / name / "sheet-transparent.png"
        if t.exists():
            folder = "sprites" if name not in ("tree", "cottage", "inn", "shop", "shrine") else "props"
            copy_public(t, PUB / folder / f"{name}.png")
        # also copy first frame if present
        frames = sorted((SPR / name).glob("frame*.png"))
        if frames:
            folder = "sprites" if name not in ("tree", "cottage", "inn", "shop", "shrine") else "props"
            copy_public(frames[0], PUB / folder / f"{name}.png")

    # Beasts frames
    beast_frames = sorted((SPR / "beasts").glob("*.png"))
    print("beast files", [p.name for p in beast_frames])
    npc_frames = sorted((SPR / "npcs").glob("*.png"))
    print("npc files", [p.name for p in npc_frames])
    prop_frames = sorted((SPR / "props").glob("*.png"))
    print("prop files", [p.name for p in prop_frames])
    furn_frames = sorted((SPR / "furniture").glob("*.png"))
    print("furn files", [p.name for p in furn_frames])

    panel = SPR / "panel" / "sheet-transparent.png"
    if panel.exists():
        copy_public(panel, PUB / "ui" / "panel.png")


if __name__ == "__main__":
    main()
