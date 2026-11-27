"""Paint original Briar Road and Wildwood materials at 32 pixels per tile."""

from pathlib import Path
from random import Random

from PIL import Image, ImageColor, ImageDraw

TILE = 32
COLUMNS = 4
ROWS = 6
OUTPUT = Path(__file__).resolve().parents[1] / "public/game/tiles/woodland-atlas.png"

MEADOW = ("#4c5e36", "#435231", "#53633a", "#5a6940", "#68764a", "#75804f")
FOREST = ("#394d36", "#314331", "#41543b", "#495d40", "#566746", "#626a48")
EARTH = ("#876347", "#795841", "#8f6b4d", "#997452", "#a48260", "#b2926c")


def material(colors, variant, dirt=False):
    """Keep the background constant across neighbors. Place grain across the sprite edges."""
    tile = Image.new("RGBA", (TILE, TILE), colors[0])
    rng = Random(74803 + variant * 811)
    grain = [ImageColor.getcolor(color, "RGBA") for color in colors[1:]]
    for _ in range(63 if dirt else 58):
        x, y = rng.randrange(TILE), rng.randrange(TILE)
        shade = rng.choices(grain, weights=(7, 9, 7, 3, 1))[0]
        leaf = ((0, 0), (1, 0), (2, 0), (1, 1)) if dirt else ((0, 0), (0, 1), (1, 1), (1, 2))
        for dx, dy in leaf[:rng.randint(1, 4)]:
            tile.putpixel(((x + dx) % TILE, (y + dy) % TILE), shade)
    brush = ImageDraw.Draw(tile)
    for _ in range(6):
        x, y = rng.randint(3, 28), rng.randint(4, 27)
        if dirt:
            brush.line((x, y + 1, x + 2, y + 1), fill=colors[1])
            brush.line((x, y, x + rng.randint(1, 3), y), fill=colors[4])
        else:
            brush.line([(x - 1, y - 2), (x, y), (x, y + 2)], fill=colors[2])
            brush.point((x - 1, y - 2), fill=colors[4])
    return tile


def brambles(variant):
    tile = Image.new("RGBA", (TILE, TILE))
    brush = ImageDraw.Draw(tile)
    rng = Random(9301 + variant * 361)
    # Uneven plant groups share the soil shadow. Every stalk is ground-anchored.
    clumps = [((5, 17), (15, 23), (26, 15)), ((6, 27), (15, 17), (27, 21)),
              ((5, 19), (16, 15), (23, 26)), ((8, 14), (14, 25), (26, 18))][variant]
    for x, y in clumps:
        brush.polygon([(x - 7, y + 1), (x - 5, y - 2), (x + 1, y - 3),
                       (x + 7, y - 1), (x + 5, y + 3), (x - 4, y + 3)], fill=(32, 43, 27, 116))
        for _ in range(rng.randint(7, 11)):
            foot_x = x + rng.randint(-5, 5)
            foot_y = y + rng.randint(-1, 3)
            tip_x = foot_x + rng.randint(-4, 4)
            tip_y = foot_y - rng.randint(4, 12)
            elbow = ((foot_x + tip_x) // 2, tip_y + 3)
            brush.line([(foot_x, foot_y), elbow, (tip_x, tip_y)], fill=rng.choice(("#3b482a", "#475530", "#59653a")))
            blade = rng.choice(("#657340", "#75834b", "#7c864a", "#889058"))
            brush.line([(tip_x, tip_y), elbow], fill=blade)
            if rng.randrange(4) == 0:
                brush.point((tip_x, tip_y), fill="#9b985a")
    # Thorn leaves and occasional hips break the vertical shapes without flowers on safe grass.
    for x, y in clumps[:2]:
        brush.line([(x - 5, y - 2), (x - 3, y - 6), (x, y - 8), (x + 3, y - 5)], fill="#4e5930")
        brush.line((x - 4, y - 7, x - 2, y - 6), fill="#6b7850")
        brush.line((x, y - 7, x + 2, y - 8), fill="#788150")
        brush.polygon([(x - 3, y - 7), (x - 4, y - 10), (x - 1, y - 9), (x + 1, y - 6)],
                      fill="#647349")
        brush.polygon([(x, y - 7), (x + 2, y - 10), (x + 4, y - 9), (x + 2, y - 6)],
                      fill="#77834f")
        if rng.randrange(2) == 0:
            brush.point((x + 2, y - 8), fill="#ab7755")
    return tile


def fern_bed(variant):
    tile = Image.new("RGBA", (TILE, TILE))
    brush = ImageDraw.Draw(tile)
    rng = Random(12371 + variant * 313)
    centers = (((9, 18), (23, 24)), ((7, 24), (21, 18)), ((11, 24), (23, 17)), ((7, 16), (21, 25)))
    for x, y in centers[variant]:
        brush.polygon([(x - 9, y + 2), (x - 6, y - 2), (x + 2, y - 3),
                       (x + 7, y + 1), (x + 5, y + 4), (x - 6, y + 4)], fill=(25, 42, 31, 138))
        for bend in (-7, -3, 1, 5, 8):
            reach = rng.randint(7, 13)
            points = [(x, y), (x + bend // 2, y - reach // 2), (x + bend, y - reach)]
            brush.line(points, fill="#5b7550")
            for step in (1, 2, 3):
                along = step / 4
                px, py = x + round(bend * along), y - round(reach * along)
                width = 3 if step < 3 else 2
                brush.polygon([(px, py), (px - width, py - 2), (px - width, py - 1),
                               (px, py + 1), (px + width, py - 2)], fill=rng.choice(("#55724d", "#668154", "#718754")))
            brush.point(points[-1], fill="#85945f")
    return tile


def verge(variant):
    tile = Image.new("RGBA", (TILE, TILE))
    brush = ImageDraw.Draw(tile)
    rng = Random(89102 + variant * 141)
    for start in (1, 9, 18, 26):
        x, y = start + rng.randrange(3), rng.choice((4, 5, 6, 7))
        if rng.randrange(5) == 0:
            continue
        width = rng.randint(2, 5)
        brush.polygon([(x - 1, y), (x + 1, y - 2), (x + width, y - 1),
                       (x + width, y + 1), (x + 1, y + 2)], fill=(47, 48, 33, 132))
        brush.polygon([(x, y), (x + 1, y - 1), (x + width - 1, y - 1),
                       (x + width, y), (x + width - 1, y + 1), (x + 1, y + 1)], fill=rng.choice(("#77745a", "#868068", "#786b54")))
        brush.point((x + 1, y - 1), fill="#a09878")
        brush.line([(x - 1, y - 3), (x, y)], fill="#697345")
    return tile


def main():
    atlas = Image.new("RGBA", (TILE * COLUMNS, TILE * ROWS))
    for v in range(COLUMNS):
        rows = [material(MEADOW, v), material(FOREST, v), material(EARTH, v, dirt=True),
                brambles(v), fern_bed(v), verge(v)]
        for row, tile in enumerate(rows):
            atlas.paste(tile, (v * TILE, row * TILE))
    atlas.save(OUTPUT, optimize=True)


if __name__ == "__main__":
    main()
