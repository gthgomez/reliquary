"""Draw the Binding Grove's low stonework on the game's existing 16px art grid."""

from math import cos, pi, sin
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parents[1] / "public/game/props/grove-ritual.png"
STONE_PALETTE = ("#7c8064", "#929077", "#a0987c", "#848a75")


def slate(brush, x, y, width, height, top, notch=2):
    """A flat, weathered stone with a darker near edge and a chipped corner."""
    right = x + width
    bottom = y + height
    brush.polygon([(x + 2, y + 2), (right + 2, y + 3), (right + 1, bottom + 2), (x, bottom + 1)],
                  fill=(32, 38, 29, 108))
    brush.polygon([(x, y + 1), (right - notch, y), (right, y + 2), (right - 1, bottom),
                   (x + notch, bottom), (x, bottom - 2)], fill="#4f5743")
    brush.polygon([(x, y + 1), (right - notch, y), (right - 1, y + 2), (right - 2, bottom - 2),
                   (x + notch, bottom - 2)], fill=top)
    brush.line((x + notch, y + 1, right - notch - 1, y + 1), fill="#a1a383")


def paint_grove(brush):
    rng = Random(192)
    # Wide seams and breaks leave the actual road through the clearing readable.
    for i in range(28):
        angle = i * 2 * pi / 28
        if i in {0, 1, 2, 12, 13, 14, 15, 24}:
            continue
        x = round(80 + 61 * cos(angle)) + rng.randrange(-2, 3)
        y = round(26 + 11 * sin(angle)) + rng.randrange(-2, 3)
        slate(brush, x - 5, y, rng.randrange(8, 13), rng.randrange(4, 7), rng.choice(STONE_PALETTE))
        brush.line((x - 2, y + 3, x + 1, y + 3), fill="#566644")

    # Visible ground anchors under Emberkit, Mirewhelp and Briarling.
    for x, y, accent in [(24, 31, "#be8054"), (88, 15, "#78aba2"), (136, 31, "#a6ac66")]:
        brush.ellipse((x - 12, y - 5, x + 13, y + 6), fill=(42, 51, 30, 115))
        slate(brush, x - 11, y - 5, 22, 9, "#a39776", notch=4)
        brush.line((x - 7, y + 1, x + 7, y + 1), fill=accent, width=2)
        brush.point((x - 4, y - 3), fill="#cabf97")
        brush.point((x + 5, y - 2), fill="#5f6951")

    # A small inlaid knot at the center of the worn ring.
    brush.ellipse((65, 25, 95, 42), outline=(63, 76, 51, 197), width=2)
    brush.ellipse((68, 28, 92, 39), outline="#ac9e75")
    brush.polygon([(80, 28), (85, 33), (80, 38), (75, 33)], outline="#d3bf8f")
    brush.line((79, 33, 81, 33), fill="#c6b186")

    # Moss and a few leaf-litter pixels feather the edges into the grass.
    for x, y in [(15, 25), (33, 6), (50, 11), (127, 16), (146, 24), (25, 44), (112, 45), (134, 42)]:
        for _ in range(12):
            place = (x + rng.randrange(-4, 5), y + rng.randrange(-2, 3))
            brush.point(place, fill=rng.choice(("#68764b", "#758054", "#9c945f", "#4f6243")))


if __name__ == "__main__":
    art = Image.new("RGBA", (160, 48))
    paint_grove(ImageDraw.Draw(art))
    art.save(ART, optimize=True)
