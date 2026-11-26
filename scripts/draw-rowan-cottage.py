"""Paint Reliquary's original cottage room at 16 art pixels per world tile."""

from math import hypot
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 176, 144
TILE = 16
DOOR_X = 5 * TILE
ART = Path(__file__).resolve().parents[1] / "public/game/rooms/rowan-cottage.png"


def paint_floor(room, brush):
    """Stagger oak boards and light them from the hearth and central sill."""
    rng = Random(416)
    for y in range(20, 130, 7):
        x = 5
        while x < WIDTH - 5:
            end = min(WIDTH - 5, x + rng.randrange(17, 42))
            grain_y = rng.randrange(2, 6)
            grain_x = x + rng.randrange(2, 12)
            tone = rng.choice((-5, -2, 0, 2, 5))
            for py in range(y, min(130, y + 7)):
                for px in range(x, end):
                    fire = max(0.0, 1 - hypot(px - 41, (py - 85) * 1.1) / 63)
                    day = max(0.0, 1 - hypot((px - 89) * 1.35, py - 20) / 71)
                    shadow = min(11, max(0, 13 - min(px, WIDTH - px)))
                    edge = -10 if py == y or px == x else 3 if py == y + 1 else 0
                    grain = 3 if py == y + grain_y and grain_x <= px < grain_x + 14 else 0
                    value = 8 * round((tone + shadow * -1 + edge + grain + fire * 35 + day * 19) / 8)
                    room.putpixel((px, py), (91 + value, 57 + value, 37 + round(0.65 * value)))
            x = end

    # Patterned wool hearth rug. Its fringe is well clear of the entry.
    brush.rectangle((53, 78, 95, 106), fill="#35232c")
    brush.rectangle((55, 79, 93, 105), fill="#6b3d35")
    brush.rectangle((58, 82, 90, 102), outline="#be9362")
    for x in range(62, 89, 6):
        brush.polygon([(x, 87), (x + 3, 92), (x, 97), (x - 3, 92)], fill="#46594a")
        brush.point((x, 92), fill="#e4b985")
    for y in range(80, 106, 3):
        brush.line((51, y, 54, y), fill="#a9896a")
        brush.line((94, y, 97, y), fill="#a9896a")


def paint_walls(brush):
    """Frame the playable floor with a timber wall, window, and open sill."""
    brush.rectangle((1, 1, 174, 21), fill="#744e38")
    for x in (6, 31, 57, 114, 142, 166):
        brush.rectangle((x, 3, x + 19, 16), fill="#956747")
        brush.line((x, 4, x + 19, 4), fill="#a47755")
    for x in (3, 27, 53, 109, 138, 163, 171):
        brush.rectangle((x, 1, x + 3, 21), fill="#473126")
        brush.line((x, 2, x, 17), fill="#684733")
    brush.rectangle((1, 0, 174, 3), fill="#2c2121")
    brush.rectangle((1, 17, 174, 20), fill="#503023")
    brush.line((4, 17, 172, 17), fill="#b68451")
    brush.rectangle((0, 20, 4, 129), fill="#483327")
    brush.rectangle((171, 20, 175, 129), fill="#3e2c26")
    brush.line((4, 22, 4, 124), fill="#805537")

    # Small dawn window above the lantern, with the roofline still visible.
    brush.polygon([(72, 18), (72, 8), (77, 3), (97, 3), (102, 8), (102, 18)], fill="#342925")
    brush.polygon([(75, 16), (75, 9), (79, 5), (95, 5), (99, 9), (99, 16)], fill="#d0a570")
    brush.polygon([(76, 15), (83, 12), (89, 14), (96, 12), (98, 15)], fill="#7c715c")
    brush.line((87, 5, 87, 16), fill="#584332", width=2)
    brush.line((75, 10, 99, 10), fill="#584332")
    brush.rectangle((70, 17, 105, 20), fill="#644332")
    brush.line((70, 17, 105, 17), fill="#bc8960")
    brush.rectangle((100, 10, 105, 16), fill="#422c23")
    brush.rectangle((101, 11, 104, 15), fill="#dc9144")
    brush.point((103, 13), fill="#ffe8a4")
    brush.line((101, 8, 104, 8), fill="#846548")

    # The Pactwarden's stitched pennant hangs beside the bed.
    brush.polygon([(42, 4), (51, 4), (51, 20), (47, 23), (42, 20)], fill="#344a41")
    brush.line((41, 4, 52, 4), fill="#b48a55")
    brush.polygon([(46, 8), (49, 12), (46, 17), (44, 12)], outline="#d3ac6e")
    brush.point((47, 12), fill="#f2cb81")

    # Splayed posts and three treads on the actual walk-through door tile.
    brush.rectangle((0, 130, 175, 143), fill="#302321")
    brush.rectangle((DOOR_X + 1, 128, DOOR_X + TILE - 2, 143), fill="#96704c")
    for y in (130, 135, 140):
        brush.line((DOOR_X + 2, y, DOOR_X + TILE - 3, y), fill="#cba072")
        brush.line((DOOR_X + 2, y + 1, DOOR_X + TILE - 3, y + 1), fill="#684d37")
    brush.rectangle((0, 128, DOOR_X, 131), fill="#4b3228")
    brush.rectangle((DOOR_X + TILE - 1, 128, 175, 131), fill="#4b3228")
    brush.line((0, 128, DOOR_X, 128), fill="#996844")
    brush.line((DOOR_X + TILE - 1, 128, 175, 128), fill="#996844")


def main():
    room = Image.new("RGB", (WIDTH, HEIGHT), "#261d20")
    brush = ImageDraw.Draw(room)
    paint_floor(room, brush)
    paint_walls(brush)
    ART.parent.mkdir(parents=True, exist_ok=True)
    room.save(ART, optimize=True)


if __name__ == "__main__":
    main()
