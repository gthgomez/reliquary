#!/usr/bin/env python3
"""Original, deterministic creature/effect animation authoring for Reliquary.

Every silhouette is composed from primitive shapes at run time; no third-party
or commercial sprite is read, traced, or copied. The editable source of truth is
this generator plus the emitted ``import.json`` declaration and PNG sheet, which
AGES imports through ``sprite-import-external`` and exports as a preview-only
runtime package.

Run:  python tools/ages-animations/generate.py --out /tmp/ages-animations
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, replace
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 64
COLUMNS = 8
PIVOT = [32, 60]
EFFECT_PIVOT = [32, 50]

PALETTES = {
    "emberkit": {
        "body": (232, 117, 43, 255),
        "belly": (255, 219, 168, 255),
        "dark": (90, 42, 18, 255),
        "outline": (48, 22, 12, 255),
        "accent": (255, 193, 49, 255),
        "glow": (255, 150, 50),
    },
    "mirewhelp": {
        "body": (46, 159, 176, 255),
        "belly": (207, 246, 242, 255),
        "dark": (24, 92, 108, 255),
        "outline": (12, 48, 58, 255),
        "accent": (127, 227, 232, 255),
        "glow": (90, 200, 255),
    },
    "briarling": {
        "body": (95, 163, 74, 255),
        "belly": (217, 240, 176, 255),
        "dark": (63, 122, 52, 255),
        "outline": (30, 62, 26, 255),
        "accent": (182, 227, 106, 255),
        "glow": (150, 230, 90),
    },
}

CREATURE_ELEMENT = {"emberkit": "ember", "mirewhelp": "tide", "briarling": "verdant"}


@dataclass(frozen=True)
class Pose:
    dx: float = 0.0
    dy: float = 0.0
    sx: float = 1.0
    sy: float = 1.0
    head_dx: float = 0.0
    head_dy: float = 0.0
    tail: float = 0.0
    leg: float = 0.0
    eye_closed: bool = False
    glow: float = 0.0
    flash: float = 0.0


def _mix(color, target, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(int(a + (b - a) * t) for a, b in zip(color[:3], target[:3])) + (255,)


def _t(x: float, y: float, p: Pose) -> tuple[float, float]:
    return (p.dx + 32 + (x - 32) * p.sx, p.dy + 60 + (y - 60) * p.sy)


def _ell(d, p: Pose, cx, cy, rx, ry, fill, outline=None, ow=1.6):
    x0, y0 = _t(cx - rx, cy - ry, p)
    x1, y1 = _t(cx + rx, cy + ry, p)
    if outline:
        d.ellipse([x0 - ow, y0 - ow, x1 + ow, y1 + ow], fill=outline)
    d.ellipse([x0, y0, x1, y1], fill=fill)


def _poly(d, p: Pose, points, fill, outline=None):
    pts = [_t(x, y, p) for x, y in points]
    d.polygon(pts, fill=fill)
    if outline:
        d.line(pts + [pts[0]], fill=outline, width=2, joint="curve")


def _line(d, p: Pose, points, fill, width=3):
    d.line([_t(x, y, p) for x, y in points], fill=fill, width=width, joint="curve")


def _glow(img: Image.Image, cx: float, cy: float, amount: float, color):
    if amount <= 0:
        return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i, alpha in enumerate((110, 70, 35)):
        r = (2.5 + i * 3.0) * amount
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*color, int(alpha * amount)))
    img.alpha_composite(layer)


def _c_body(c, p: Pose):
    return _mix(c["body"], (255, 255, 255, 255), p.flash)


def draw_creature(img: Image.Image, species: str, p: Pose) -> None:
    c = PALETTES[species]
    d = ImageDraw.Draw(img)
    body = _c_body(c, p)
    outline = c["outline"]
    belly = c["belly"]
    accent = c["accent"]
    dark = c["dark"]

    if species == "emberkit":
        tx, ty = 14 - p.tail, 42 - p.tail * 0.4
        _line(d, p, [(22, 48), (16, 46), (tx, ty)], dark, 4)
        _poly(d, p, [(tx - 3, ty), (tx - 7, ty - 8), (tx - 1, ty - 6),
                     (tx + 1, ty - 13), (tx + 3, ty - 5), (tx + 6, ty - 4)], accent, outline)
        _ell(d, p, 24, 55, 5, 7, dark)
        _ell(d, p, 33, 55, 5, 7, dark)
        _ell(d, p, 30, 46, 15, 10, body, outline)
        _ell(d, p, 33, 49, 10, 6, belly)
        _ell(d, p, 41 + p.leg, 55, 5, 7, dark)
        _ell(d, p, 47 + p.leg, 55, 5, 7, dark)
        _ell(d, p, 46 + p.head_dx, 36 + p.head_dy, 9, 8, body, outline)
        _poly(d, p, [(40, 31), (41, 22), (46, 29)], body, outline)
        _poly(d, p, [(49, 29), (53, 21), (54, 31)], body, outline)
        _ell(d, p, 55 + p.head_dx, 39 + p.head_dy, 5, 4, belly)
        _ell(d, p, 59 + p.head_dx, 38 + p.head_dy, 1.6, 1.6, outline)
        if p.eye_closed:
            _line(d, p, [(47, 35), (51, 35)], outline, 2)
        else:
            _ell(d, p, 49 + p.head_dx, 35 + p.head_dy, 1.9, 1.9, outline)
        _poly(d, p, [(44, 27), (46, 21), (48, 27), (50, 23), (51, 30)], accent, outline)
        _glow(img, 56 + p.head_dx, 40 + p.head_dy, p.glow, c["glow"])

    elif species == "mirewhelp":
        _line(d, p, [(22, 50), (12, 51), (5 - p.tail, 45)], dark, 4)
        _poly(d, p, [(5, 45), (0, 36), (6, 41), (9, 31), (11, 43)], accent, outline)
        _ell(d, p, 24, 56, 5, 6, dark)
        _ell(d, p, 34, 56, 5, 6, dark)
        _ell(d, p, 31, 47, 15, 9, body, outline)
        _ell(d, p, 34, 50, 10, 5, belly)
        _ell(d, p, 42 + p.leg, 56, 5, 6, dark)
        _ell(d, p, 48 + p.leg, 56, 5, 6, dark)
        _ell(d, p, 47 + p.head_dx, 38 + p.head_dy, 10, 8, body, outline)
        _poly(d, p, [(40, 33), (42, 23), (46, 30)], accent, outline)
        _poly(d, p, [(46, 30), (49, 20), (51, 30)], accent, outline)
        _poly(d, p, [(51, 30), (55, 23), (55, 32)], accent, outline)
        _ell(d, p, 56 + p.head_dx, 41 + p.head_dy, 5, 3.5, belly)
        if p.eye_closed:
            _line(d, p, [(48, 37), (52, 37)], outline, 2)
        else:
            _ell(d, p, 50 + p.head_dx, 37 + p.head_dy, 1.9, 1.9, outline)
        _line(d, p, [(41, 41), (36, 38)], accent, 2)
        _glow(img, 58 + p.head_dx, 41 + p.head_dy, p.glow, c["glow"])

    else:  # briarling
        _line(d, p, [(20, 50), (12, 54), (6 - p.tail, 49)], dark, 4)
        _poly(d, p, [(7, 49), (3, 43), (8, 45), (10, 40), (11, 48)], accent, outline)
        _ell(d, p, 24, 56, 5, 6, dark)
        _ell(d, p, 34, 56, 5, 6, dark)
        _ell(d, p, 30, 47, 14, 10, body, outline)
        _ell(d, p, 33, 50, 9, 6, belly)
        _ell(d, p, 42 + p.leg, 56, 5, 6, dark)
        _ell(d, p, 48 + p.leg, 56, 5, 6, dark)
        _ell(d, p, 46 + p.head_dx, 38 + p.head_dy, 9, 8, body, outline)
        _poly(d, p, [(42, 31), (39, 22), (45, 28)], accent, outline)
        _poly(d, p, [(45, 29), (46, 19), (49, 28)], accent, outline)
        _poly(d, p, [(49, 28), (53, 21), (53, 30)], accent, outline)
        _ell(d, p, 55 + p.head_dx, 41 + p.head_dy, 5, 3.5, belly)
        if p.eye_closed:
            _line(d, p, [(47, 37), (51, 37)], outline, 2)
        else:
            _ell(d, p, 49 + p.head_dx, 37 + p.head_dy, 1.9, 1.9, outline)
        _poly(d, p, [(52, 33), (58, 32), (53, 36)], dark, outline)
        _glow(img, 56 + p.head_dx, 41 + p.head_dy, p.glow, c["glow"])


STATES = {
    "idle": {
        "loop": True,
        "durations": [140, 140, 140, 140],
        "poses": [
            Pose(),
            Pose(dy=-1.0, sy=1.02, head_dy=-0.5, tail=1.0, leg=0.4),
            Pose(tail=2.0, leg=-0.3),
            Pose(dy=1.0, sy=0.99, head_dy=0.5, tail=1.0),
        ],
        "events": [],
    },
    "attack_melee": {
        "loop": False,
        "durations": [110, 90, 80, 120, 160],
        "poses": [
            Pose(dx=-3, sy=0.94, head_dx=-2, leg=-2, tail=-1),
            Pose(dx=-5, sy=0.90, head_dx=-3, leg=-3, tail=-2),
            Pose(dx=14, sy=1.06, head_dx=4, leg=3, tail=2, flash=0.35),
            Pose(dx=10, sy=1.00, head_dx=2, leg=1, tail=1),
            Pose(dx=2, sy=0.98),
        ],
        "events": [{"frame": 2, "name": "impact"}],
    },
    "attack_elemental": {
        "loop": False,
        "durations": [140, 110, 90, 100, 130, 150],
        "poses": [
            Pose(dx=-2, glow=0.35, head_dy=-1, tail=-1),
            Pose(dx=-3, sy=1.03, glow=0.7, head_dy=-1.5, tail=-2),
            Pose(dx=-4, glow=1.0, head_dy=-2, tail=-3),
            Pose(dx=6, glow=0.65, head_dx=3, flash=0.25, tail=2),
            Pose(dx=10, glow=0.25, flash=0.5, head_dx=2, tail=3),
            Pose(dx=2, sy=0.99),
        ],
        "events": [{"frame": 3, "name": "impact"}],
    },
    "hit": {
        "loop": False,
        "durations": [80, 90, 120],
        "poses": [
            Pose(dx=-6, sy=0.96, head_dx=-3, flash=0.45, tail=-2),
            Pose(dx=4, head_dx=2, eye_closed=True, tail=2),
            Pose(dx=-1, sy=0.99),
        ],
        "events": [],
    },
    "faint": {
        "loop": False,
        "durations": [140, 160, 220, 300],
        "poses": [
            Pose(dx=-4, dy=2, sy=0.92, eye_closed=True, head_dy=2),
            Pose(dy=8, sy=0.70, sx=1.05, eye_closed=True, head_dy=3),
            Pose(dy=14, sy=0.46, sx=1.12, eye_closed=True, head_dy=4),
            Pose(dy=16, sy=0.40, sx=1.15, eye_closed=True, head_dy=4),
        ],
        "events": [],
    },
}


def _render_effect(kind: str, t: float) -> Image.Image:
    img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = 32, 30
    fade = int(255 * (1 - t))
    if kind == "melee":
        r = 6 + 24 * t
        d.ellipse([cx - r * 0.35, cy - r * 0.35, cx + r * 0.35, cy + r * 0.35],
                  fill=(255, 255, 240, fade))
        for angle in range(0, 360, 45):
            a = math.radians(angle)
            d.line([cx + math.cos(a) * r * 0.4, cy + math.sin(a) * r * 0.4,
                    cx + math.cos(a) * r, cy + math.sin(a) * r],
                   fill=(255, 226, 120, fade), width=3)
    elif kind == "ember":
        r = 10 + 20 * t
        d.ellipse([cx - 7 - 6 * t, cy - 7 - 6 * t, cx + 7 + 6 * t, cy + 7 + 6 * t],
                  fill=(255, 120, 30, fade))
        for i in range(8):
            a = math.radians(i * 45 + 20)
            px, py = cx + math.cos(a) * r, cy + math.sin(a) * r - 5 * t
            rad = 2.5 + 2.5 * (1 - t)
            d.ellipse([px - rad, py - rad, px + rad, py + rad],
                      fill=(255, 205, 80, fade))
    elif kind == "tide":
        for k in range(3):
            r = 8 + 16 * t + k * 5
            d.arc([cx - r, cy - r, cx + r, cy + r], start=200, end=340,
                  fill=(110, 210, 255, max(0, fade - k * 40)), width=4)
        for i in range(6):
            px = cx + math.cos(i) * (10 + 18 * t)
            py = cy + math.sin(i * 1.7) * (8 + 14 * t)
            rad = 3 + 2 * (1 - t)
            d.ellipse([px - rad, py - rad, px + rad, py + rad],
                      fill=(190, 245, 255, fade))
    elif kind == "verdant":
        r = 8 + 18 * t
        for i in range(7):
            a = math.radians(i * 51 + 15)
            px, py = cx + math.cos(a) * r, cy + math.sin(a) * r
            d.ellipse([px - 5, py - 3, px + 5, py + 3], fill=(150, 225, 90, fade))
            d.line([cx, cy, px, py], fill=(70, 130, 45, max(0, fade - 30)), width=2)
        d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(220, 255, 160, fade))
    else:  # generic spark
        r = 5 + 18 * t
        d.ellipse([cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4],
                  fill=(255, 255, 255, fade))
        for angle in range(0, 360, 60):
            a = math.radians(angle)
            d.line([cx + math.cos(a) * r * 0.5, cy + math.sin(a) * r * 0.5,
                    cx + math.cos(a) * r, cy + math.sin(a) * r],
                   fill=(255, 240, 200, fade), width=2)
    return img


EFFECT_STATES = {
    "impact": ("spark", [60, 60, 60, 60]),
    "impact_melee": ("melee", [55, 55, 55, 55]),
    "impact_ember": ("ember", [60, 65, 70, 75, 80]),
    "impact_tide": ("tide", [60, 65, 70, 75, 80]),
    "impact_verdant": ("verdant", [60, 65, 70, 75, 80]),
}


def _grid(frames: int) -> tuple[int, int]:
    columns = COLUMNS
    rows = max(1, math.ceil(frames / columns))
    return columns, rows


def _write_sheet(frames: list[Image.Image], path: Path) -> tuple[int, int]:
    columns, rows = _grid(len(frames))
    sheet = Image.new("RGBA", (columns * CELL, rows * CELL), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.paste(frame, ((index % columns) * CELL, (index // columns) * CELL))
    sheet.save(path)
    return columns, rows


def build_creature(species: str, out_root: Path) -> dict:
    frames: list[Image.Image] = []
    animations: dict[str, dict] = {}
    for state, spec in STATES.items():
        cells = []
        for index, pose in enumerate(spec["poses"]):
            img = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            draw_creature(img, species, pose)
            frames.append(img)
            cells.append({"cell": len(frames) - 1, "duration_ms": spec["durations"][index]})
        animations[state] = {
            "loop": spec["loop"],
            "pivot": PIVOT,
            "gameplay_root": PIVOT,
            "frames": cells,
            "events": spec["events"],
        }
    target = out_root / species
    target.mkdir(parents=True, exist_ok=True)
    _write_sheet(frames, target / "sheet.png")
    declaration = {
        "schema_version": 1,
        "asset_id": species,
        "asset_type": "sprite",
        "program": {"id": "generic", "version": "ages-procedural-authoring/1.0"},
        "cell": [CELL, CELL],
        "sheet": "sheet.png",
        "animations": animations,
        "license": {
            "identifier": "Original-Procedural-Art",
            "author": "AGES project (procedural)",
            "evidence": "Generated by tools/ages-animations/generate.py; no third-party or commercial sprites used.",
        },
    }
    (target / "import.json").write_text(json.dumps(declaration, indent=2) + "\n", encoding="utf-8")
    return {"species": species, "states": list(animations), "frames": len(frames)}


def build_effects(out_root: Path) -> dict:
    frames: list[Image.Image] = []
    animations: dict[str, dict] = {}
    for state, (kind, durations) in EFFECT_STATES.items():
        cells = []
        for index, duration in enumerate(durations):
            progress = index / max(1, len(durations) - 1)
            frames.append(_render_effect(kind, progress))
            cells.append({"cell": len(frames) - 1, "duration_ms": duration})
        animations[state] = {
            "loop": False,
            "pivot": EFFECT_PIVOT,
            "gameplay_root": EFFECT_PIVOT,
            "frames": cells,
            "events": [],
        }
    target = out_root / "reliquary-effects"
    target.mkdir(parents=True, exist_ok=True)
    _write_sheet(frames, target / "sheet.png")
    declaration = {
        "schema_version": 1,
        "asset_id": "reliquary-effects",
        "asset_type": "effect",
        "program": {"id": "generic", "version": "ages-procedural-authoring/1.0"},
        "cell": [CELL, CELL],
        "sheet": "sheet.png",
        "animations": animations,
        "license": {
            "identifier": "Original-Procedural-Art",
            "author": "AGES project (procedural)",
            "evidence": "Generated by tools/ages-animations/generate.py; no third-party or commercial sprites used.",
        },
    }
    (target / "import.json").write_text(json.dumps(declaration, indent=2) + "\n", encoding="utf-8")
    return {"asset": "reliquary-effects", "states": list(animations), "frames": len(frames)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    root = args.out.absolute()
    root.mkdir(parents=True, exist_ok=True)
    result = {
        "creatures": [build_creature(name, root) for name in PALETTES],
        "effects": build_effects(root),
        "provenance": {
            "tool": "tools/ages-animations/generate.py",
            "version": "1.0",
            "cell": [CELL, CELL],
            "license": "Original-Procedural-Art",
            "rights": "Original procedural geometry; no third-party or commercial sprite sources.",
        },
    }
    (root / "manifest.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
