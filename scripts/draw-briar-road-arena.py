"""Paint the original Briar Road encounter verge for Reliquary."""

from pathlib import Path
from random import Random

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 960, 768
FOOTING_Y = 432
OUT = Path(__file__).resolve().parents[1] / "public/game/bg/bg_briar_road.webp"


def shade(top, bottom, fraction):
    return tuple(round(a + (b - a) * fraction) for a, b in zip(top, bottom))


def wash(draw, start, end, top, bottom):
    for y in range(start, end + 1):
        color = shade(top, bottom, (y - start) / (end - start))
        draw.line((0, y, WIDTH, y), fill=color)


def copse(draw, rng, top, lower, dark, crown, count):
    for index in range(count):
        x = round(index * WIDTH / (count - 1)) + rng.randint(-20, 20)
        base = lower + rng.randint(-15, 15)
        y = top + rng.randint(-44, 82)
        width = rng.randint(15, 34)
        lean = rng.randint(-19, 25)
        draw.polygon([(x - width, base), (x + lean, y), (x + width, base)], fill=dark)
        for offset in (24, 49, 73, 94):
            y_branch = y + offset
            reach = width + offset // 4
            draw.polygon([(x + lean, y_branch - 38), (x - reach, y_branch + 18),
                          (x - reach // 4, y_branch + 11), (x + reach, y_branch + 29)],
                         fill=crown)


def verge(draw, rng):
    # The far edge is a low, irregular hedge. Keep the center calm behind the
    # two creature silhouettes and put tall seed heads towards the sides.
    edge = [(x, 359 + rng.randint(-12, 12)) for x in range(0, WIDTH + 1, 24)]
    draw.polygon(edge + [(WIDTH, 419), (0, 419)], fill="#686a43")
    draw.polygon([(0, 397), (161, 381), (292, 396), (448, 372), (619, 376),
                  (765, 392), (960, 375), (960, HEIGHT), (0, HEIGHT)], fill="#81734e")
    wash(draw, FOOTING_Y - 12, HEIGHT - 1, (126, 111, 73), (61, 55, 42))
    draw.polygon([(0, 397), (162, 389), (305, 408), (470, 381), (613, 385),
                  (767, 404), (960, 382), (960, FOOTING_Y - 13), (0, FOOTING_Y - 13)],
                 fill="#8c7a51")
    for _ in range(560):
        x = rng.randrange(WIDTH)
        y = rng.randrange(365, HEIGHT)
        if 399 <= y <= 455 and 170 < x < 790 and rng.randrange(4):
            continue
        color = rng.choice(("#917e55", "#a18e60", "#675a43", "#b3a073", "#514d38"))
        size = rng.randint(1, 5 + (y - 365) // 50)
        draw.polygon([(x - size, y), (x, y - size // 2), (x + size, y),
                      (x + size // 2, y + 1)], fill=color)
    for _ in range(310):
        x = rng.randrange(WIDTH)
        y = rng.randrange(379, 412)
        side = 1 - abs(WIDTH / 2 - x) / (WIDTH / 2)
        height = rng.randint(10, 55) if side < 0.5 else rng.randint(4, 24)
        lean = rng.randint(-12, 10)
        stem = rng.choice(("#54583b", "#72734b", "#828256", "#9e9362"))
        draw.line([(x, y), (x + lean // 2, y - height // 2), (x + lean, y - height)], fill=stem, width=2)
        if height > 30:
            draw.line([(x + lean - 2, y - height + 6), (x + lean, y - height - 3)],
                      fill="#b1a171", width=2)


def hedgerow(draw, rng, x, y):
    draw.polygon([(x - 43, y + 20), (x - 30, y - 49), (x - 42, y - 120),
                  (x - 28, y - 202), (x - 6, y - 250), (x + 15, y - 250),
                  (x + 12, y - 137), (x + 28, y - 48), (x + 44, y + 19),
                  (x + 11, y + 8), (x - 5, y + 21)], fill="#342f29")
    draw.line([(x - 18, y + 12), (x - 13, y - 62), (x - 26, y - 127),
               (x - 14, y - 204), (x, y - 245)], fill="#5e4b38", width=8)
    for _ in range(34):
        px = x + rng.randint(-41, 37)
        py = y + rng.randint(-242, -31)
        draw.line([(px, py), (px + rng.randint(-3, 4), py - rng.randint(4, 20))],
                  fill=rng.choice(("#473c31", "#514333", "#66513c")), width=2)
    for shift, dy in [(-65, -167), (-27, -192), (28, -218), (57, -178)]:
        cx, cy = x + shift, y + dy
        draw.polygon([(cx - 75, cy + 6), (cx - 42, cy - 38), (cx + 12, cy - 62),
                      (cx + 69, cy - 26), (cx + 89, cy + 13), (cx + 27, cy + 33),
                      (cx - 39, cy + 30)], fill="#3c4a39")
        draw.polygon([(cx - 51, cy - 12), (cx - 28, cy - 37), (cx + 9, cy - 43),
                      (cx + 41, cy - 29), (cx + 50, cy - 9), (cx + 3, cy - 21)],
                     fill="#576044")


def paint():
    rng = Random(1728)
    image = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    wash(draw, 0, HEIGHT - 1, (72, 88, 79), (177, 155, 96))
    draw.polygon([(0, 278), (128, 233), (301, 225), (451, 248), (553, 228),
                  (742, 221), (960, 245), (960, 405), (0, 405)], fill="#697758")
    copse(draw, rng, 203, 363, "#627056", "#728060", 27)
    copse(draw, rng, 241, 376, "#526247", "#637150", 20)
    verge(draw, rng)
    for x, y in [(30, 421), (216, 388), (751, 401), (925, 428)]:
        hedgerow(draw, rng, x, y)
    return image


if __name__ == "__main__":
    paint().save(OUT, format="WEBP", lossless=True, method=6)
