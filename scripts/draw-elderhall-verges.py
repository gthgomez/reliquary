"""Paint original non-solid grass edge and road wear details for Elderhall."""

from pathlib import Path
from random import Random

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "public/game/props"

grass = Image.new("RGBA", (64, 32))
draw = ImageDraw.Draw(grass)
rng = Random(430)
for x, y, spread in [(9, 23, 9), (22, 20, 11), (42, 13, 17), (53, 9, 10)]:
    draw.ellipse((x - spread, y - 3, x + spread, y + 3), fill=(45, 67, 32, 85))
    for _ in range(21):
        px, py = x + rng.randrange(-spread, spread + 1), y + rng.randrange(-2, 3)
        height = rng.randrange(1, 8)
        color = rng.choice(("#526840", "#738650", "#889460", "#9b9a63"))
        draw.line([(px, py), (px + rng.randrange(-2, 3), py - height)], fill=color)
    for _ in range(5):
        px, py = x + rng.randrange(-spread, spread + 1), y + rng.randrange(-2, 3)
        draw.point((px, py), fill=rng.choice(("#baae75", "#655945", "#ac966d")))
grass.save(OUT / "elderhall-verge-grass.png", optimize=True)

wear = Image.new("RGBA", (64, 27))
draw = ImageDraw.Draw(wear)
for x, y, run in [(3, 19, 15), (18, 15, 24), (31, 13, 17), (47, 8, 14)]:
    draw.line([(x, y), (x + run // 2, y - 2), (x + run, y - 4)], fill=(91, 69, 43, 74), width=2)
    for _ in range(8):
        dx, dy = rng.randrange(run), rng.randrange(-3, 4)
        brush = rng.choice(("#b9976e", "#88775a", "#826247"))
        draw.line([(x + dx, y + dy), (x + dx + 1, y + dy)], fill=brush)
wear.save(OUT / "elderhall-road-wear.png", optimize=True)
