"""Paint original 32px terrain for Thornkeep, Ashenbarrow and Mirefen.

All pigments, forms and placement guides are defined here. The recipe needs
Pillow and opens no source images. Nothing in this atlas encodes collision.
"""

from argparse import ArgumentParser
from pathlib import Path
from random import Random

from PIL import Image, ImageColor, ImageDraw


SIZE = 32
VARIANTS = 4
LAWN = ("#586348", "#505b44", "#5b674b", "#626d4f", "#6c7556")
TAN = ("#947855", "#896e50", "#8f7352", "#9c805b", "#a98a64")
FLOOR = ("#54585d", "#4c5055", "#565b62", "#5a5e64", "#65696d")
MOSS = ("#535f49", "#495542", "#56634d", "#5d6a50", "#687158")
SILT = ("#45483e", "#3c4138", "#4c4d40", "#555246", "#605a48")
WATER = ("#293e40", "#26393c", "#2d4445", "#334b4b", "#3c5451")
TRAIL = ("#75644e", "#6b5b48", "#786750", "#806e55", "#8b7659")


def pigment(palette, variant, seed, marks, *, flat=False):
    """Break a plane with short, clustered flecks and quiet space."""
    tile = Image.new("RGBA", (SIZE, SIZE), palette[0])
    pen = ImageDraw.Draw(tile)
    rng = Random(seed + 263 * variant)
    for _ in range(marks):
        x, y = rng.randrange(SIZE), rng.randrange(SIZE)
        color = rng.choices(palette[1:], weights=(5, 8, 4, 1))[0]
        length = rng.choices((1, 2, 3), weights=(5, 3, 1))[0]
        for dx in range(length):
            dy = 0 if flat else (dx + rng.randint(0, 1)) // 2
            pen.point(((x + dx) % SIZE, (y + dy) % SIZE), fill=color)
    return tile


def lawn(variant):
    tile = pigment(LAWN, variant, 23017, 59)
    pen = ImageDraw.Draw(tile)
    rng = Random(8312 + variant * 97)
    for _ in range(6):
        x, y = rng.randrange(4, 28), rng.randrange(5, 27)
        pen.line(((x - 1, y + 1), (x, y), (x + 2, y)), fill="#525f47")
        pen.point((x, y - 1), fill=rng.choice(("#626d4f", "#6c7556")))
    return tile


def approach(variant):
    tile = pigment(TAN, variant, 52131, 75, flat=True)
    pen = ImageDraw.Draw(tile)
    rng = Random(60353 + variant * 173)
    for _ in range(9):
        x, y = rng.randrange(3, 27), rng.randrange(3, 29)
        pen.line((x, y + 1, x + 3, y + 1), fill="#876d50")
        pen.line((x + 1, y, x + 2, y), fill="#ac8d66")
    return tile


def cobble(variant):
    tile = Image.new("RGBA", (SIZE, SIZE), "#59544d")
    pen = ImageDraw.Draw(tile)
    rng = Random(6369 + variant * 181)
    stones = ("#716b61", "#797267", "#746e64", "#796d5c", "#6b6964", "#7b6f5f")
    bonds = ((0, 9, 18, 26, 32), (-5, 4, 14, 23, 27),
             (-2, 5, 13, 24, 30), (-7, 2, 10, 17, 25))
    for course, breaks in enumerate(bonds):
        y = -3 + 8 * course
        for left, right in zip(breaks, breaks[1:]):
            face, edge = rng.choice(stones), rng.choice(("#898073", "#877d70", "#82796e"))
            for dx in (-SIZE, 0, SIZE):
                for dy in (0, SIZE):
                    x1, x2, top = left + dx, right + dx - 2, y + dy
                    pen.polygon(((x1 + 1, top), (x2 - 1, top), (x2, top + 1),
                                 (x2, top + 5), (x2 - 1, top + 6),
                                 (x1 + 1, top + 6), (x1, top + 5), (x1, top + 1)), fill=face)
                    pen.line((x1 + 1, top, x2 - 1, top), fill=edge)
                    pen.line((x1, top + 2, x1, top + 4), fill=edge)
                    pen.line((x1 + 2, top + 6, x2 - 1, top + 6), fill="#645d54")
                    pen.point((x1 + 2, top + 3), fill="#6e675e")
    return tile


def cave_floor(variant):
    tile = pigment(FLOOR, variant, 87331, 56)
    pen = ImageDraw.Draw(tile)
    joints = (
        ((2, 12), (10, 9), (22, 11), (26, 9)),
        ((3, 19), (10, 17), (16, 18), (25, 14)),
        ((4, 10), (11, 9), (20, 12), (28, 11)),
        ((2, 17), (9, 15), (23, 18), (29, 16)),
    )
    ledge = joints[variant]
    pen.polygon((*ledge, (26, 20), (10, 24), (5, 21)), fill="#585c62")
    pen.line(ledge, fill="#61646a")
    pen.line(((5, 24), (11, 26), (20, 25), (26, 21)), fill="#4d5156")
    chips = ((9, 6), (19, 26), (25, 5), (8, 27))
    x, y = chips[variant]
    pen.polygon(((x - 2, y), (x + 2, y - 2), (x + 4, y), (x + 1, y + 1)), fill="#64676c")
    pen.line((x - 1, y + 1, x + 3, y + 1), fill="#4e5257")
    return tile


def basalt_wall(variant):
    tile = Image.new("RGBA", (SIZE, SIZE), "#2e3037")
    pen = ImageDraw.Draw(tile)
    left, middle = ((9, 22), (12, 23), (8, 19), (10, 20))[variant]
    # Three tall faces under a jagged crown, each with a dark vertical break.
    pen.polygon(((0, 8), (left - 2, 5), (left + 1, 11), (left - 1, 25),
                 (left - 4, 30), (0, 26)), fill="#383a42")
    pen.polygon(((left, 8), (middle - 4, 5), (middle, 9), (middle + 1, 22),
                 (middle - 3, 28), (left + 1, 25)), fill="#3e414a")
    pen.polygon(((middle + 1, 9), (31, 6), (31, 25), (middle + 1, 30),
                 (middle + 3, 23)), fill="#383b44")
    pen.line(((0, 9), (left - 2, 6), (left + 2, 8), (middle - 4, 5),
              (middle + 1, 8), (31, 6)), fill="#52555d", width=2)
    pen.line((left, 10, left - 2, 25), fill="#24262d", width=2)
    pen.line((middle + 1, 10, middle + 2, 23), fill="#262830", width=2)
    pen.line(((0, 27), (left - 4, 30), (left + 2, 28), (middle, 30),
              (31, 26)), fill="#25272d", width=2)
    rng = Random(9282 + variant * 733)
    for _ in range(19):
        x, y = rng.randrange(3, 30), rng.randrange(11, 27)
        pen.line((x, y, x, y + rng.randint(1, 2)), fill=rng.choice(("#34363d", "#474a52")))
    return tile


def damp_moss(variant):
    tile = pigment(MOSS, variant, 34109, 52)
    pen = ImageDraw.Draw(tile)
    islands = (((6, 9), (21, 24)), ((23, 8), (10, 21)),
               ((9, 8), (23, 21)), ((23, 10), (9, 25)))
    for x, y in islands[variant]:
        pen.polygon(((x - 4, y + 1), (x - 3, y - 2), (x + 1, y - 3),
                     (x + 4, y - 2), (x + 6, y), (x + 2, y + 2)), fill="#59664d")
        pen.line((x - 1, y - 2, x + 2, y - 2), fill="#667155")
        pen.line((x - 3, y + 2, x, y + 2), fill="#4a5542")
    return tile


def encounter_marsh(variant):
    tile = pigment(SILT, variant, 35797, 55, flat=True)
    pen = ImageDraw.Draw(tile)
    puddles = (((3, 13), (17, 26)), ((15, 12), (23, 26)),
               ((5, 23), (21, 12)), ((10, 12), (20, 24)))
    for x, y in puddles[variant]:
        pen.polygon(((x, y), (x + 4, y - 2), (x + 9, y - 1),
                     (x + 6, y + 2), (x + 2, y + 2)), fill="#384943")
        pen.line((x + 2, y, x + 5, y), fill="#4c5b50")
    roots = (((9, 20), (23, 25)), ((8, 26), (23, 18)),
             ((11, 17), (24, 26)), ((7, 19), (19, 26)))
    rng = Random(94121 + variant * 2087)
    for x, y in roots[variant]:
        pen.polygon(((x - 5, y + 1), (x - 3, y - 1), (x + 3, y - 2),
                     (x + 6, y), (x + 4, y + 2), (x - 2, y + 3)), fill="#363c33")
        for stalk in range(6):
            foot_x = x + rng.randint(-3, 3)
            tip_x = foot_x + rng.randint(-3, 3)
            height = rng.randint(6, 12)
            tip_y = y - height
            bend = ((foot_x + tip_x) // 2, y - height // 2)
            pen.line(((foot_x, y), bend, (tip_x, tip_y)), fill="#666949")
            pen.line(((tip_x, tip_y), (tip_x, tip_y + 2)), fill="#837753")
            if stalk % 3 == 0:
                pen.line((bend, (bend[0] + 3, bend[1] - 1)), fill="#747750")
        pen.line((x - 1, y + 4, x + 2, y + 4), fill="#4c584c")
    return tile


def fen_water(variant):
    tile = pigment(WATER, variant, 59029, 46, flat=True)
    pen = ImageDraw.Draw(tile)
    rng = Random(7649 + variant * 223)
    for _ in range(8):
        x, y = rng.randrange(3, 23), rng.randrange(3, 29)
        length = rng.randint(4, 9)
        pen.line((x, y + 1, x + length, y + 1), fill="#263739")
        pen.line((x + 2, y, x + length - 1, y), fill=rng.choice(WATER[3:]))
        if length > 6:
            pen.point((x + length + 1, y - 1), fill="#39514f")
    return tile


def fen_trail(variant):
    tile = pigment(TRAIL, variant, 78317, 62, flat=True)
    pen = ImageDraw.Draw(tile)
    for i, (x, y) in enumerate(((6, 10), (20, 5), (11, 25), (21, 20))):
        x += (variant + i) % 3 - 1
        y += (variant * 3 + i) % 3 - 1
        pen.polygon(((x - 3, y), (x, y - 2), (x + 5, y - 1),
                     (x + 4, y + 1), (x + 1, y + 2)), fill="#6c5d4a")
        pen.line((x + 1, y - 1, x + 3, y - 1), fill="#807058")
    return tile


def plank_bridge(variant):
    tile = Image.new("RGBA", (SIZE, SIZE), "#263334")
    pen = ImageDraw.Draw(tile)
    rng = Random(62733 + variant * 163)
    widths = (5, 6, 4, 7, 5, 5)
    faces = ("#74664f", "#796951", "#6b604d", "#746956", "#776750")
    x = 0
    for width in widths:
        right = x + width - 2
        pen.rectangle((x, 0, right, 31), fill=rng.choice(faces))
        pen.line((x, 0, x, 31), fill="#88785e")
        pen.line((right, 0, right, 31), fill="#5b5142")
        for _ in range(3):
            y = rng.randrange(2, 28)
            pen.line((x + 1, y, x + 1, y + rng.randint(2, 6)), fill="#8b795e")
        for y in (5, 25):
            pen.point((right - 1, y), fill="#4d4740")
        x += width
    return tile


def mixed_pixel(a, b, part, total):
    return tuple((x * (total - part) + y * part + total // 2) // total for x, y in zip(a, b))


def match_edges(tile, template):
    """Make all variants join across the atlas cell, including masonry bonds."""
    data, guide = tile.load(), template.load()
    last = SIZE - 1
    corners = (guide[0, 0], guide[0, last], guide[last, 0], guide[last, last])
    corner = tuple((sum(values) + 2) // 4 for values in zip(*corners))
    for p in range(SIZE):
        horizontal = corner if p in (0, last) else mixed_pixel(guide[p, 0], guide[p, last], 1, 2)
        vertical = corner if p in (0, last) else mixed_pixel(guide[0, p], guide[last, p], 1, 2)
        data[p, 0] = data[p, last] = horizontal
        data[0, p] = data[last, p] = vertical
        if 0 < p < last:
            for point in ((p, 1), (p, last - 1)):
                data[point] = mixed_pixel(data[point], horizontal, 1, 3)
            for point in ((1, p), (last - 1, p)):
                data[point] = mixed_pixel(data[point], vertical, 1, 3)
    return tile


def paint():
    rows = (lawn, approach, cobble, cave_floor, basalt_wall, damp_moss,
            encounter_marsh, fen_water, fen_trail, plank_bridge)
    atlas = Image.new("RGBA", (SIZE * VARIANTS, SIZE * len(rows)))
    for row, painter in enumerate(rows):
        template = painter(0)
        for variant in range(VARIANTS):
            tile = match_edges(painter(variant), template)
            atlas.paste(tile, (variant * SIZE, row * SIZE))
    return atlas


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "public/game/tiles/chapter-route-atlas.png")
    args = parser.parse_args()
    paint().save(args.output, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
