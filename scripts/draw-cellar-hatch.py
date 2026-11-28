"""Paint the interactable Calders' Sundries cellar hatch on the 32px prop grid."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / "public/game/props/cellar-hatch.png"
image = Image.new("RGBA", (32, 32))
draw = ImageDraw.Draw(image)
draw.polygon([(2, 17), (26, 17), (31, 29), (27, 31), (2, 31), (0, 25)], fill="#3c2c26")
draw.polygon([(5, 15), (24, 15), (29, 27), (26, 29), (4, 29), (1, 25)], fill="#624831")
draw.polygon([(6, 17), (23, 17), (27, 26), (25, 27), (5, 27), (3, 25)], fill="#98704b")
for start, end in [((6, 21), (25, 21)), ((4, 25), (26, 25))]:
    draw.line([start, end], fill="#513b2b")
draw.line([(7, 18), (21, 18)], fill="#b09366")
draw.line([(8, 24), (19, 24)], fill="#be9260")
draw.rectangle((6, 18, 8, 20), fill="#504d43")
draw.rectangle((20, 18, 22, 20), fill="#504d43")
draw.ellipse((12, 21, 19, 26), outline="#e0b77b")
draw.ellipse((14, 22, 17, 24), outline="#544133")
image.save(out, optimize=True)
