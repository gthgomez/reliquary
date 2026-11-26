"""Draw six original Elderhall props at their manifest canvas sizes.

Run with Python 3 and Pillow: python scripts/draw-elderhall-landmarks.py --out path/to/output
Add --preview to write a separate visual QA sheet beside the six sprites.
All art is drawn on blank canvases from the coordinates and palettes below.
"""

from argparse import ArgumentParser
from pathlib import Path

from PIL import Image, ImageDraw


INK = "#282a26"
WOOD_DARK = "#46332b"
WOOD = "#65432f"
WOOD_LIT = "#a87547"
WOOD_GOLD = "#ca9a5b"
GOLD = "#d7aa60"
GLINT = "#f1ce82"
PLASTER = "#d7ad6a"
PLASTER_LIT = "#e9c781"
PLASTER_SHADE = "#b08951"
PANE = "#3e554b"
PANE_DARK = "#2a3d3a"

# From cast shade to the exposed face of a tile or stone.
CLAY = ("#61413b", "#8d5744", "#9d6147", "#ab694a", "#bb7751", "#cf8b5d", "#e1a06b")
GREEN = ("#293f35", "#3e5945", "#4a664b", "#537050", "#607d54", "#728c5a", "#8e9e65")
SLATE = ("#33423f", "#4a5b57", "#526661", "#5b706a", "#637b73", "#789087", "#8fa498")
STONE = ("#575953", "#797b70", "#85877a", "#8f9181", "#9d9c88", "#aaa792", "#bdb9a1")
SIDE_STONE = ("#494c46", "#62665d", "#6a6e62", "#717568", "#7b7e6f", "#888a78", "#9a9b85")


class Sprite:
    """Crisp, integer-coordinate drawing on a transparent RGBA canvas."""

    def __init__(self, width, height):
        self.image = Image.new("RGBA", (width, height))
        self.draw = ImageDraw.Draw(self.image)

    def polygon(self, points, fill, outline=None):
        self.draw.polygon(points, fill=fill, outline=outline)

    def rect(self, box, fill, outline=None):
        self.draw.rectangle(box, fill=fill, outline=outline)

    def line(self, points, fill, width=1):
        self.draw.line(points, fill=fill, width=width)


def variation(column, row, seed):
    """Stable tile variation; this intentionally has no random global state."""
    value = (column + 31) * 374761393 + (row + 19) * 668265263 + seed * 1447
    return ((value ^ (value >> 13)) * 1274126177) >> 17


def course_surface(s, quad, palette, columns, rows, seed, roofing=False):
    """Fit staggered courses to a planar roof or wall, ordered TL, TR, BR, BL."""
    top_left, top_right, bottom_right, bottom_left = quad

    def point(u, v):
        left = tuple(a + (b - a) * v for a, b in zip(top_left, bottom_left))
        right = tuple(a + (b - a) * v for a, b in zip(top_right, bottom_right))
        return tuple(round(a + (b - a) * u) for a, b in zip(left, right))

    s.polygon(quad, palette[0])
    for row in range(rows):
        upper = (row + 0.07) / rows
        lower = (row + (0.88 if roofing else 0.91)) / rows
        for column in range(columns + 1):
            offset = 0.5 if row % 2 == 1 else 0
            left = max(0.012, (column - offset + 0.05) / columns)
            right = min(0.988, (column - offset + 0.96) / columns)
            if right <= left:
                continue
            tone = variation(column, row, seed)
            shade = 2 + tone % 3
            if roofing and row < 2 and column < columns // 2:
                shade += 1
            s.polygon([point(left, upper), point(right, upper),
                       point(right, lower), point(left, lower)], palette[shade])
            if right - left > 0.045 and tone % 5 != 0:
                if roofing:
                    # The curled lower edge of a shingle catches the light.
                    s.line([point(left + 0.012, lower), point(right - 0.013, lower)], palette[shade + 1])
                else:
                    s.line([point(left + 0.008, upper), point(left + (right - left) * 0.56, upper)],
                           palette[shade + 1])
    s.line([*quad, top_left], palette[0])


def roof_eave(s, left, right, palette, drop=4):
    x1, y1 = left
    x2, y2 = right
    s.polygon([left, right, (x2, y2 + drop), (x1 + 1, y1 + drop)], WOOD_DARK, INK)
    s.line([(x1 + 1, y1), (x2 - 1, y2)], palette[-1])
    s.line([(x1 + 2, y1 + 2), (x2 - 1, y2 + 2)], palette[1])


def beam(s, start, end, thickness=5, bright=WOOD_LIT):
    """A timber with a continuous lit edge and a narrow grain streak."""
    s.line([start, end], WOOD_DARK, thickness)
    s.line([(start[0] - 1, start[1] - 1), (end[0] - 1, end[1] - 1)], bright)


def post(s, x, top, bottom, width, side=5):
    s.polygon([(x, top), (x + width, top), (x + width, bottom),
               (x + 1, bottom), (x, bottom - 2)], WOOD_DARK, INK)
    s.rect((x + 2, top + 1, x + width - side, bottom - 2), WOOD)
    s.line([(x + 2, top + 2), (x + 2, bottom - 3)], WOOD_LIT)
    s.line([(x + width - side - 2, top + 6), (x + width - side - 2, bottom - 6)], "#835736")
    s.line([(x + 4, top + 7), (x + 4, top + 13), (x + 5, top + 16)], "#96643e")


def window(s, x, y, width, height, trim=WOOD_LIT):
    """Small south-facing leaded glass, warmed at the upper-left corner."""
    s.rect((x, y, x + width, y + height), WOOD_DARK, INK)
    s.rect((x + 2, y + 2, x + width - 2, y + height - 2), PANE_DARK)
    s.polygon([(x + 2, y + 2), (x + width - 3, y + 2),
               (x + 3, y + height - 3), (x + 2, y + height - 3)], PANE)
    s.line([(x + 3, y + 3), (x + 5, y + 3), (x + 3, y + 5)], GOLD)
    s.line([(x + width // 2, y + 2), (x + width // 2, y + height - 2)], trim)
    s.line([(x + 2, y + height // 2), (x + width - 2, y + height // 2)], trim)
    s.line([(x - 2, y + height), (x + width + 2, y + height)], trim, 2)


def boarded_door(s, x, y, width, height, face):
    right, bottom = x + width, y + height
    s.polygon([(x, y + 6), (x + 5, y), (right - 5, y), (right, y + 6),
               (right, bottom), (x, bottom)], WOOD_DARK, INK)
    s.polygon([(x + 3, y + 7), (x + 7, y + 3), (right - 6, y + 3),
               (right - 3, y + 7), (right - 3, bottom - 1), (x + 3, bottom - 1)], face)
    for board in range(x + 7, right - 4, 5):
        s.line([(board, y + 5), (board, bottom - 1)], WOOD_DARK)
    s.line([(x + 1, bottom - 1), (x + 1, y + 7), (x + 5, y + 2), (right - 6, y + 2)], WOOD_GOLD)
    hinge_x = right - 7
    for hinge_y in (y + 11, bottom - 8):
        s.line([(hinge_x - 4, hinge_y), (right - 2, hinge_y)], INK, 2)
        s.rect((hinge_x - 4, hinge_y, hinge_x - 3, hinge_y), WOOD_LIT)
    s.rect((x + 5, y + height // 2 + 2, x + 7, y + height // 2 + 4), GOLD, WOOD_DARK)
    s.rect((x + 5, y + height // 2 + 2, x + 6, y + height // 2 + 3), GLINT)


def cottage():
    s = Sprite(160, 160)
    # Long earth-plaster wall and shaded right gable.
    s.polygon([(14, 91), (100, 91), (100, 151), (20, 151), (14, 146)], PLASTER, INK)
    s.polygon([(96, 91), (116, 49), (145, 68), (145, 133), (98, 151)], PLASTER_SHADE, INK)
    s.polygon([(15, 97), (91, 97), (95, 107), (27, 105), (22, 140), (16, 143)], PLASTER_LIT)
    s.polygon([(102, 94), (144, 72), (144, 88), (126, 97), (127, 133), (101, 144)], "#a77f4a")
    course_surface(s, [(16, 141), (99, 141), (99, 152), (20, 152)], STONE, 9, 2, 15)
    course_surface(s, [(99, 141), (145, 123), (145, 134), (99, 152)], SIDE_STONE, 6, 2, 11)
    beam(s, (18, 102), (97, 102), 5)
    beam(s, (100, 102), (143, 83), 5)
    beam(s, (101, 129), (142, 111))
    beam(s, (105, 100), (119, 120))
    beam(s, (131, 88), (142, 98), 4)
    beam(s, (20, 136), (36, 105), 5)
    beam(s, (93, 134), (85, 109), 4)
    post(s, 15, 94, 143, 7, 3)
    post(s, 47, 100, 141, 6, 3)
    post(s, 94, 94, 145, 8, 3)
    post(s, 139, 73, 129, 6, 3)
    window(s, 27, 112, 17, 15)
    window(s, 80, 112, 11, 15)
    s.polygon([(112, 105), (130, 97), (130, 115), (112, 123)], WOOD_DARK, INK)
    s.polygon([(114, 106), (128, 100), (128, 114), (114, 120)], PANE_DARK)
    s.polygon([(114, 106), (126, 101), (116, 117), (114, 118)], PANE)
    s.line([(121, 103), (121, 117)], WOOD_LIT)
    s.line([(111, 123), (131, 115)], WOOD_LIT, 2)
    boarded_door(s, 53, 111, 22, 39, "#a56d43")
    s.polygon([(50, 149), (77, 149), (83, 153), (81, 156), (48, 156), (47, 153)], STONE[1], INK)
    s.line([(49, 153), (80, 153)], STONE[6])

    # The ridge runs right, with the return plane climbing away from the viewer.
    s.polygon([(115, 45), (146, 65), (150, 72), (143, 70), (101, 92)], CLAY[0], INK)
    course_surface(s, [(32, 45), (116, 45), (99, 92), (8, 92)], CLAY, 11, 8, 37, roofing=True)
    s.line([(8, 91), (31, 46), (34, 44), (115, 44), (119, 46), (147, 65)], WOOD_DARK, 3)
    s.line([(10, 89), (33, 45), (114, 45)], CLAY[6])
    s.line([(147, 68), (101, 93)], WOOD_LIT, 2)
    roof_eave(s, (8, 92), (99, 92), CLAY, 6)
    s.line([(19, 98), (89, 98)], INK)

    # Small hooded loft window and a projecting chimney with a dark flue.
    s.polygon([(27, 78), (35, 64), (55, 64), (61, 80), (57, 86), (27, 86)], WOOD_DARK, INK)
    s.polygon([(30, 77), (55, 77), (55, 84), (30, 84)], PLASTER_SHADE)
    s.rect((37, 74, 49, 82), PANE_DARK, WOOD_LIT)
    s.line([(42, 74), (42, 82)], WOOD_LIT)
    s.polygon([(27, 77), (35, 63), (51, 62), (59, 76), (52, 78)], CLAY[4], WOOD_DARK)
    s.line([(29, 75), (36, 64), (50, 63), (56, 73)], CLAY[6])
    s.line([(38, 79), (41, 79)], GOLD)
    s.line([(35, 84), (51, 84)], WOOD_GOLD)
    s.polygon([(93, 28), (110, 28), (119, 32), (119, 53), (108, 60), (93, 58)], CLAY[0], INK)
    course_surface(s, [(94, 32), (109, 33), (109, 59), (94, 57)], CLAY, 2, 5, 7)
    s.polygon([(109, 33), (118, 31), (118, 54), (109, 59)], CLAY[1], WOOD_DARK)
    s.polygon([(91, 28), (101, 24), (113, 24), (121, 29), (119, 33),
               (109, 36), (91, 33)], CLAY[5], WOOD_DARK)
    s.polygon([(96, 28), (103, 26), (113, 26), (117, 28), (108, 31), (97, 30)], WOOD_DARK)
    s.line([(92, 29), (109, 33), (118, 30)], CLAY[6])

    # A terracotta planter with foliage grouped around four blooms.
    s.polygon([(25, 129), (46, 129), (44, 136), (28, 136)], CLAY[2], WOOD_DARK)
    s.line([(26, 130), (45, 130)], CLAY[6])
    s.polygon([(26, 128), (27, 124), (30, 125), (32, 121), (34, 125),
               (37, 124), (40, 121), (41, 125), (45, 124), (46, 129)], GREEN[3])
    for x, y, color in [(29, 124, GLINT), (32, 122, "#e6a086"), (39, 123, GLINT), (43, 125, "#d78376")]:
        s.line([(x - 1, y), (x + 1, y)], color)
        s.line([(x, y - 1), (x, y + 1)], color)
    return s


def stone_arch(s, x, y, width, height, face, kind):
    """A stepped round arch with separate light and shadow faces."""
    right, bottom = x + width, y + height
    span = [(x, bottom), (x, y + 13), (x + 3, y + 6), (x + 8, y + 2),
            (x + 13, y), (right - 13, y), (right - 8, y + 2),
            (right - 3, y + 6), (right, y + 13), (right, bottom)]
    s.polygon(span, STONE[1], WOOD_DARK)
    s.line(span[:6], STONE[6], 2)
    s.line(span[6:], SIDE_STONE[0], 2)
    inset = [(x + 5, bottom), (x + 5, y + 14), (x + 8, y + 9), (x + 14, y + 5),
             (right - 14, y + 5), (right - 8, y + 9), (right - 5, y + 14), (right - 5, bottom)]
    s.polygon(inset, face, INK)
    for points in [[(x, y + 19), (x + 4, y + 19)], [(x, bottom - 7), (x + 4, bottom - 7)],
                   [(right - 4, y + 19), (right, y + 19)], [(right - 4, bottom - 7), (right, bottom - 7)],
                   [(x + 7, y + 4), (x + 10, y + 8)], [(right - 8, y + 4), (right - 10, y + 8)]]:
        s.line(points, SIDE_STONE[0])
    center = x + width // 2
    s.polygon([(center - 4, y), (center + 4, y), (center + 3, y + 7),
               (center - 3, y + 7)], STONE[5], STONE[0])
    s.line([(center - 3, y + 1), (center + 3, y + 1)], STONE[6])
    if kind == "door":
        for board in (center - 10, center - 5, center + 5, center + 10):
            s.line([(board, y + 9), (board, bottom)], WOOD_DARK)
        s.line([(center, y + 6), (center, bottom)], INK, 2)
        for hinge_y in (y + 18, bottom - 9):
            s.line([(x + 6, hinge_y), (center - 7, hinge_y)], INK, 2)
            s.line([(center + 7, hinge_y), (right - 6, hinge_y)], INK, 2)
        s.rect((center - 5, y + 24, center - 4, y + 26), GLINT)
        s.rect((center + 4, y + 24, center + 5, y + 26), GOLD)
    else:
        s.line([(center, y + 8), (center, bottom)], STONE[4], 2)
        s.line([(x + 6, y + 17), (right - 6, y + 17)], STONE[3])
        s.line([(x + 9, y + 13), (x + 13, y + 9)], GOLD)
        s.line([(x - 2, bottom), (right + 2, bottom)], STONE[5], 2)


def banner(s, x, y):
    s.line([(x - 3, y), (x + 13, y)], WOOD_DARK, 3)
    s.line([(x - 2, y - 1), (x + 12, y - 1)], GOLD)
    s.polygon([(x, y + 2), (x + 10, y + 2), (x + 10, y + 22),
               (x + 5, y + 28), (x, y + 24)], GREEN[2], WOOD_DARK)
    s.line([(x + 1, y + 3), (x + 1, y + 22), (x + 5, y + 26)], GREEN[5])
    s.polygon([(x + 5, y + 7), (x + 8, y + 12), (x + 5, y + 16), (x + 2, y + 12)], GOLD)
    s.line([(x + 5, y + 9), (x + 5, y + 14)], GLINT)


def guild():
    s = Sprite(160, 160)
    # Stone wings behind the projecting, two-story assembly hall.
    s.polygon([(126, 62), (140, 31), (152, 50), (152, 135), (126, 149)], SIDE_STONE[1], INK)
    course_surface(s, [(125, 69), (151, 53), (151, 136), (125, 149)], SIDE_STONE, 3, 12, 48)
    course_surface(s, [(10, 63), (126, 63), (126, 150), (10, 150)], STONE, 12, 12, 57)
    s.line([(10, 89), (126, 89), (152, 73)], WOOD_DARK, 4)
    s.line([(11, 88), (126, 88), (151, 73)], STONE[5], 2)
    s.line([(10, 139), (126, 139), (151, 126)], STONE[5], 2)
    s.line([(13, 72), (13, 144)], STONE[5], 3)
    s.line([(124, 70), (124, 145)], STONE[1], 3)
    for x in (19, 107):
        window(s, x, 72, 12, 13, STONE[5])
        window(s, x, 104, 13, 25, STONE[5])
        s.line([(x - 2, 104), (x + 15, 104)], STONE[5], 2)
    s.polygon([(134, 87), (146, 79), (146, 113), (134, 120)], SIDE_STONE[5], INK)
    s.polygon([(136, 88), (144, 82), (144, 112), (136, 116)], PANE_DARK)
    s.line([(140, 85), (140, 114)], SIDE_STONE[3])
    s.line([(136, 101), (144, 97)], SIDE_STONE[4])

    # Low wings and a tall, independently framed central gable.
    s.polygon([(139, 27), (156, 45), (156, 51), (127, 64), (128, 50)], SLATE[0], INK)
    course_surface(s, [(22, 27), (140, 27), (130, 63), (5, 63)], SLATE, 15, 6, 21, roofing=True)
    s.line([(6, 61), (21, 27), (140, 27), (155, 44)], SLATE[6], 2)
    roof_eave(s, (5, 63), (130, 63), SLATE, 5)
    s.line([(131, 63), (155, 49)], SLATE[4], 2)
    s.polygon([(32, 63), (66, 20), (102, 65), (102, 150), (33, 150)], WOOD_DARK, INK)
    s.polygon([(102, 65), (111, 58), (111, 144), (102, 150)], SIDE_STONE[1], INK)
    course_surface(s, [(102, 75), (110, 69), (110, 144), (102, 149)], SIDE_STONE, 1, 11, 17)
    s.polygon([(37, 64), (67, 25), (97, 64), (97, 96), (37, 96)], "#b49765")
    s.polygon([(39, 64), (67, 26), (69, 35), (45, 68), (45, 87), (38, 88)], "#cbb281")
    course_surface(s, [(33, 94), (101, 94), (101, 150), (33, 150)], STONE, 7, 8, 71)
    beam(s, (36, 66), (99, 66), 5)
    beam(s, (67, 28), (67, 92), 5)
    beam(s, (38, 92), (56, 68), 4)
    beam(s, (96, 91), (81, 68), 4)
    post(s, 33, 66, 96, 6, 2)
    post(s, 96, 66, 96, 6, 2)
    s.line([(33, 92), (102, 92), (111, 86)], WOOD_DARK, 4)
    s.line([(33, 91), (102, 91), (111, 85)], STONE[6])

    # Steep slate rake and the upper hall's three lights.
    course_surface(s, [(67, 13), (78, 9), (111, 57), (102, 66)], SLATE, 3, 8, 71, roofing=True)
    s.polygon([(29, 65), (65, 15), (77, 9), (108, 59), (102, 68), (67, 23),
               (34, 70)], SLATE[0], INK)
    s.line([(30, 65), (66, 15), (77, 9)], SLATE[6], 2)
    s.line([(66, 16), (102, 65)], SLATE[5], 2)
    s.line([(33, 68), (67, 23), (101, 67)], WOOD_LIT)
    s.polygon([(65, 14), (67, 9), (69, 14), (67, 18)], GOLD, WOOD_DARK)
    window(s, 48, 73, 10, 11, WOOD_GOLD)
    window(s, 75, 73, 10, 11, WOOD_GOLD)
    s.polygon([(67, 47), (75, 55), (67, 63), (59, 55)], WOOD_DARK, INK)
    s.polygon([(67, 49), (72, 55), (67, 60), (62, 55)], GOLD)
    s.line([(67, 52), (67, 57)], GLINT)

    stone_arch(s, 46, 106, 42, 42, "#80583c", "door")
    banner(s, 31, 99)
    banner(s, 92, 99)
    s.polygon([(45, 147), (89, 147), (95, 152), (95, 156), (40, 156),
               (39, 153)], STONE[2], INK)
    s.line([(45, 147), (89, 147)], STONE[6])
    s.line([(41, 152), (93, 152)], STONE[6])
    s.line([(41, 154), (94, 154)], STONE[0])
    return s


def shop():
    s = Sprite(160, 160)
    s.polygon([(15, 87), (113, 87), (113, 152), (17, 152)], PLASTER, INK)
    s.polygon([(111, 87), (131, 42), (146, 62), (146, 134), (113, 152)], PLASTER_SHADE, INK)
    s.polygon([(18, 100), (110, 100), (107, 119), (18, 126)], "#c29d5d")
    s.polygon([(115, 89), (144, 72), (144, 89), (116, 107)], "#986f47")
    course_surface(s, [(16, 143), (112, 143), (112, 152), (16, 152)], STONE, 10, 2, 27)
    course_surface(s, [(112, 143), (146, 125), (146, 134), (112, 152)], SIDE_STONE, 5, 2, 27)
    for x in (16, 73, 109):
        post(s, x, 87, 145, 7, 3)
    post(s, 140, 74, 130, 6, 2)
    beam(s, (113, 102), (144, 83), 5)
    beam(s, (114, 139), (124, 107), 5)
    s.polygon([(123, 102), (138, 94), (138, 114), (123, 122)], WOOD_DARK, INK)
    s.polygon([(125, 104), (136, 98), (136, 112), (125, 118)], GREEN[2])
    s.line([(129, 102), (129, 116)], GREEN[5])
    s.line([(133, 100), (133, 114)], GREEN[4])
    s.line([(122, 122), (139, 113)], WOOD_LIT, 2)
    boarded_door(s, 82, 110, 24, 40, GREEN[3])
    s.polygon([(80, 149), (106, 149), (110, 153), (109, 156), (77, 156),
               (77, 153)], STONE[1], INK)
    s.line([(78, 153), (108, 153)], STONE[5])
    s.rect((25, 110, 70, 138), WOOD_DARK, INK)
    s.rect((28, 112, 67, 134), PANE_DARK)
    for x in (29, 42, 55):
        s.polygon([(x, 113), (x + 11, 113), (x + 1, 127), (x, 127)], PANE)
        s.line([(x, 112), (x, 135)], WOOD_GOLD)
    s.line([(29, 125), (66, 125)], WOOD_LIT)
    # Three pottery silhouettes on the shop shelf.
    for x, y, color in [(33, 128, CLAY[4]), (48, 126, GOLD), (60, 129, GREEN[5])]:
        s.polygon([(x, y), (x + 4, y), (x + 4, y + 2), (x + 6, y + 3),
                   (x + 5, 135), (x, 135), (x - 1, y + 3)], color, WOOD_DARK)
        s.line([(x, y), (x + 3, y)], GLINT)
    s.polygon([(24, 136), (71, 136), (72, 140), (69, 142), (25, 142)], WOOD, INK)
    s.line([(25, 137), (70, 137)], WOOD_GOLD)

    # Broad green shingled roof with a gabled storefront cap set into it.
    s.polygon([(129, 43), (151, 62), (153, 68), (117, 88), (112, 85)], GREEN[0], INK)
    course_surface(s, [(28, 42), (132, 42), (118, 88), (8, 88)], GREEN, 13, 8, 12, roofing=True)
    s.line([(10, 85), (28, 42), (133, 42), (151, 62)], GREEN[6], 2)
    s.line([(118, 88), (151, 66)], GREEN[5], 2)
    roof_eave(s, (8, 88), (118, 88), GREEN, 5)
    s.polygon([(16, 89), (45, 51), (76, 88), (76, 99), (16, 99)], WOOD_DARK, INK)
    s.polygon([(22, 87), (45, 57), (70, 88), (70, 99), (22, 99)], PLASTER_LIT)
    s.polygon([(45, 51), (58, 47), (84, 80), (76, 91)], GREEN[2], INK)
    s.line([(59, 50), (81, 80)], GREEN[5], 2)
    s.line([(56, 58), (62, 55)], GREEN[4])
    s.line([(62, 66), (68, 63)], GREEN[4])
    s.line([(69, 75), (76, 71)], GREEN[4])
    s.line([(16, 89), (45, 51), (76, 89)], WOOD_DARK, 4)
    s.line([(17, 87), (45, 51), (74, 87)], GREEN[6], 2)
    s.line([(23, 89), (67, 89)], WOOD_LIT, 2)
    window(s, 39, 68, 12, 13, WOOD_GOLD)
    s.line([(28, 88), (37, 76)], WOOD_LIT, 2)
    s.line([(61, 88), (53, 77)], WOOD_LIT, 2)

    # Green and linen canvas, with uneven scalloped hem and a hanging sprig sign.
    s.polygon([(20, 95), (75, 95), (80, 107), (78, 112), (18, 112),
               (13, 108)], WOOD_DARK, INK)
    for stripe in range(7):
        left, right = 21 + stripe * 7, 27 + stripe * 7
        lower_left, lower_right = 15 + stripe * 9, 23 + stripe * 9
        cloth, shade, sheen = ((GREEN[4], GREEN[1], GREEN[6]) if stripe % 2 == 0
                               else ("#dbb777", "#a9844f", "#f0d392"))
        s.polygon([(left, 96), (right, 96), (lower_right, 107), (lower_left, 107)], cloth)
        s.polygon([(lower_left, 107), (lower_right, 107), (lower_right - 1, 110),
                   (lower_left + 1, 111)], shade)
        s.line([(lower_left + 1, 106), (lower_right - 1, 106)], sheen)
    s.line([(107, 96), (133, 96), (136, 98)], WOOD_DARK, 3)
    s.line([(108, 95), (133, 95)], WOOD_GOLD)
    s.line([(116, 96), (116, 101)], GOLD)
    s.line([(131, 96), (131, 101)], GOLD)
    s.polygon([(114, 100), (133, 100), (135, 103), (135, 116),
               (132, 120), (114, 120), (111, 117), (111, 103)], WOOD_DARK, INK)
    s.polygon([(115, 102), (132, 102), (133, 104), (133, 116),
               (131, 118), (115, 118), (113, 116), (113, 104)], GREEN[1], GOLD)
    s.line([(118, 115), (129, 105)], GLINT)
    s.polygon([(120, 112), (118, 110), (117, 106), (121, 108), (122, 110)], GOLD)
    s.polygon([(124, 110), (130, 110), (128, 113), (121, 114)], GOLD)
    s.polygon([(123, 108), (124, 104), (128, 103), (127, 107)], GLINT)
    return s


def well():
    s = Sprite(128, 160)
    # Octagonal masonry, with exposed water in the gap between timber uprights.
    outer = [(22, 106), (36, 98), (84, 98), (102, 108),
             (109, 119), (97, 130), (79, 137), (42, 137), (22, 129), (15, 119)]
    s.polygon([(15, 119), (22, 112), (104, 112), (109, 119), (108, 139),
               (96, 150), (79, 156), (42, 156), (21, 148), (15, 138)], STONE[1], INK)
    course_surface(s, [(16, 120), (42, 131), (42, 155), (16, 138)], STONE, 3, 4, 12)
    course_surface(s, [(42, 131), (79, 131), (79, 155), (42, 155)], STONE, 5, 4, 24)
    course_surface(s, [(79, 131), (108, 119), (108, 138), (79, 155)], SIDE_STONE, 3, 4, 16)
    s.polygon(outer, STONE[5], STONE[0])
    s.polygon([(26, 111), (40, 103), (82, 103), (98, 111), (102, 119),
               (93, 126), (77, 132), (43, 132), (27, 125), (22, 119)], "#283f3b", STONE[0])
    s.polygon([(28, 119), (40, 113), (78, 114), (96, 120), (91, 125),
               (77, 130), (44, 130), (29, 124)], "#467264")
    s.polygon([(36, 120), (57, 117), (84, 119), (88, 122), (67, 122),
               (63, 126), (43, 126)], "#619786")
    s.line([(43, 121), (55, 121)], "#99b8a3")
    s.line([(71, 125), (78, 125)], "#8aab96")
    s.line([(26, 126), (43, 133), (78, 133), (95, 127)], STONE[6], 2)
    for start, end in [((35, 101), (41, 104)), ((20, 110), (26, 113)),
                       ((29, 133), (33, 129)), ((47, 137), (48, 133)),
                       ((62, 137), (63, 133)), ((78, 137), (77, 133)),
                       ((94, 131), (92, 127)), ((106, 122), (101, 120))]:
        s.line([start, end], STONE[1])

    # Pin, windlass, rope and a bucket visibly above the water line.
    post(s, 24, 71, 126, 10, 3)
    post(s, 92, 69, 125, 10, 4)
    beam(s, (30, 94), (97, 92), 7)
    s.polygon([(52, 89), (70, 88), (73, 91), (73, 96), (70, 99),
               (52, 99), (49, 96), (49, 92)], WOOD_LIT, WOOD_DARK)
    for x in range(52, 70, 3):
        s.line([(x, 90), (x - 1, 97)], GOLD)
    s.line([(64, 97), (64, 113)], GOLD, 2)
    s.polygon([(58, 116), (61, 111), (67, 111), (71, 116)], WOOD_DARK)
    s.line([(62, 112), (66, 112)], WOOD_GOLD)
    s.polygon([(56, 115), (73, 115), (71, 125), (58, 125)], WOOD, INK)
    s.line([(57, 116), (72, 116)], WOOD_GOLD, 2)
    s.line([(59, 122), (71, 122)], STONE[4], 2)
    s.line([(98, 93), (105, 93), (106, 100), (112, 100)], WOOD_DARK, 3)
    s.line([(99, 92), (104, 92), (105, 99)], GOLD)
    s.rect((109, 98, 114, 101), WOOD_LIT, WOOD_DARK)
    beam(s, (29, 91), (42, 73), 5)
    beam(s, (97, 91), (85, 73), 5)

    # Deep overhanging cap; its underside frames the well opening.
    s.polygon([(16, 71), (103, 71), (112, 63), (110, 70), (101, 82),
               (24, 82), (17, 77)], WOOD_DARK, INK)
    s.polygon([(82, 32), (110, 56), (113, 64), (97, 76), (91, 65)], CLAY[0], INK)
    course_surface(s, [(39, 32), (83, 32), (99, 74), (14, 74)], CLAY, 8, 7, 19, roofing=True)
    s.line([(14, 72), (38, 32), (84, 32), (111, 56)], WOOD_DARK, 3)
    s.line([(17, 71), (39, 32), (83, 32), (93, 40)], CLAY[6])
    s.line([(100, 73), (111, 63)], CLAY[4], 2)
    roof_eave(s, (14, 74), (99, 74), CLAY, 5)
    s.line([(24, 81), (95, 81)], INK)
    s.polygon([(34, 34), (38, 28), (44, 30), (44, 34)], WOOD_DARK)
    s.line([(35, 33), (38, 29), (42, 30)], CLAY[6])
    return s


def tree():
    s = Sprite(160, 144)
    # Bent trunk and branches, two forks visible beneath the low boughs.
    s.polygon([(61, 139), (65, 135), (73, 131), (75, 121), (74, 104), (63, 93),
               (55, 81), (61, 76), (68, 89), (77, 96), (78, 84), (87, 77),
               (91, 81), (87, 95), (92, 100), (101, 91), (109, 89), (111, 94),
               (98, 103), (89, 115), (89, 129), (93, 134), (104, 137),
               (108, 140), (97, 140), (87, 137), (82, 140), (73, 140),
               (75, 137), (66, 140)], WOOD_DARK, INK)
    s.polygon([(66, 137), (75, 132), (78, 119), (77, 104), (66, 93), (62, 84),
               (67, 89), (80, 101), (83, 96), (85, 87), (89, 84), (85, 103),
               (87, 115), (85, 130), (86, 135), (81, 138), (75, 137)], WOOD_LIT)
    s.polygon([(76, 134), (80, 123), (79, 108), (83, 105),
               (84, 113), (82, 128), (82, 134)], WOOD_GOLD)
    s.line([(88, 110), (94, 101), (105, 93)], "#91603a", 2)
    s.line([(88, 129), (91, 135), (100, 138)], "#91603a", 2)
    s.line([(77, 116), (79, 119), (78, 125)], WOOD_DARK)
    s.line([(81, 107), (84, 111), (83, 116)], WOOD)

    # Large crown shapes are hand-drawn; smaller crowns overlap their bases.
    crown = [(5, 65), (5, 56), (10, 51), (11, 43), (17, 39), (21, 31),
             (32, 28), (38, 22), (44, 22), (50, 13), (59, 12), (65, 7),
             (79, 7), (85, 10), (95, 8), (105, 13), (109, 19), (118, 20),
             (124, 26), (133, 27), (138, 33), (144, 35), (147, 44),
             (153, 50), (154, 60), (157, 66), (154, 75), (155, 82),
             (148, 90), (142, 91), (139, 98), (128, 102), (123, 107),
             (113, 107), (107, 104), (100, 109), (90, 106), (86, 110),
             (76, 108), (72, 103), (64, 105), (57, 102), (51, 104),
             (42, 101), (39, 96), (30, 98), (22, 94), (21, 89), (14, 88),
             (9, 82), (9, 76), (4, 72)]
    s.polygon(crown, "#324932", "#252f29")
    s.polygon([(15, 77), (31, 69), (60, 71), (91, 81), (108, 74), (129, 75),
               (151, 68), (153, 78), (148, 86), (137, 90), (135, 96), (121, 102),
               (110, 100), (100, 104), (90, 101), (84, 106), (77, 104), (72, 98),
               (65, 100), (54, 97), (49, 101), (42, 98), (38, 91), (31, 93),
               (24, 90), (23, 85), (16, 85)], "#284134")
    s.polygon([(18, 39), (30, 32), (44, 29), (52, 18), (64, 14), (74, 10),
               (90, 13), (101, 13), (109, 22), (123, 26), (132, 35), (143, 42),
               (149, 49), (147, 63), (140, 70), (131, 70), (123, 82), (106, 85),
               (100, 79), (92, 84), (81, 82), (75, 90), (62, 89), (55, 84),
               (47, 86), (41, 81), (29, 83), (23, 77), (14, 76), (9, 67),
               (11, 56), (17, 51)], "#4b6239")

    def foliage(x, y, scale, light, mid, dark, flip=False):
        """Each lobe has a lit crown jutting forward over a darker skirt."""
        def shape(points):
            direction = -1 if flip else 1
            return [(x + round(px * scale * direction), y + round(py * scale)) for px, py in points]

        s.polygon(shape([(-21, 2), (-19, -5), (-14, -8), (-11, -14), (-4, -14),
                         (0, -17), (8, -15), (11, -11), (18, -9), (20, -4),
                         (23, 0), (21, 6), (17, 9), (14, 14), (6, 14),
                         (0, 17), (-7, 14), (-13, 14), (-16, 9), (-21, 8)]), dark)
        s.polygon(shape([(-20, 2), (-17, -5), (-12, -7), (-10, -13), (-3, -13),
                         (1, -16), (8, -14), (10, -10), (17, -8), (20, -3),
                         (19, 2), (15, 3), (11, 8), (5, 7), (0, 11),
                         (-6, 9), (-11, 10), (-14, 6), (-19, 6)]), mid)
        s.polygon(shape([(-16, -4), (-11, -7), (-9, -11), (-3, -11), (1, -14),
                         (7, -12), (8, -9), (13, -8), (14, -5), (7, -4),
                         (4, -1), (-1, -2), (-5, 2), (-11, 1), (-13, -1), (-17, 0)]), light)

    leaf_dark = "#354e35"
    leaf_mid = "#56713f"
    leaf_light = "#78904c"
    foliage(120, 55, 1.31, "#627b46", "#50683d", leaf_dark, flip=True)
    foliage(129, 76, 1.02, "#5d7846", "#486743", "#314e3b")
    foliage(99, 78, 1.36, "#688048", "#4d6a42", "#304e39", flip=True)
    foliage(69, 83, 1.15, "#6c8347", "#557346", "#37563d")
    foliage(30, 63, 1.05, "#6e8547", "#587142", leaf_dark, flip=True)
    foliage(101, 35, 1.22, leaf_light, "#64804a", "#49613c")
    foliage(51, 47, 1.29, "#81974e", "#697f43", "#4c673d", flip=True)
    foliage(69, 25, 1.04, "#96a960", "#7f944f", "#586e3f")
    foliage(39, 38, 0.77, "#9aac61", "#81974f", "#607946")
    foliage(76, 55, 1.00, "#889e57", "#6e8950", "#4f6b40")
    foliage(41, 75, 0.79, "#829955", "#68854d", "#4a6b40")
    foliage(106, 64, 0.82, "#77934f", "#617d4a", "#45603d", flip=True)
    foliage(92, 22, 0.62, "#8ca058", "#71874a", leaf_mid, flip=True)
    foliage(19, 58, 0.47, leaf_light, leaf_mid, leaf_dark)

    # Hand-placed leaf glints and deeper, sparse grouped gaps. No pixel noise.
    for x, y, color in [
        (32, 33, "#b2bb6a"), (41, 29, "#adb968"), (58, 20, "#aeb96d"),
        (65, 15, "#b5bd73"), (73, 19, "#aab66a"), (85, 18, "#9aab61"),
        (54, 34, "#a0ae62"), (45, 39, "#96aa5d"), (56, 42, "#99ac60"),
        (34, 51, "#8ea35a"), (22, 54, "#91a75d"), (67, 52, "#a0b269"),
        (74, 45, "#a7b469"), (83, 49, "#99ad62"), (96, 32, "#92a65e"),
        (105, 26, "#8fa15a"), (118, 43, "#829750"), (107, 55, "#8fa45e"),
        (38, 66, "#98aa61"), (30, 73, "#879e56"), (48, 70, "#879e55"),
        (55, 57, "#9dac61"), (59, 70, "#849c55"), (68, 67, "#94a75b"),
        (87, 62, "#89a057"), (99, 65, "#8ea461"), (112, 66, "#849b59"),
        (123, 63, "#768f51"), (135, 60, "#728a4b"), (130, 76, "#7e9858"),
        (115, 80, "#789456"), (96, 77, "#799353"), (66, 80, "#7c9855"),
        (50, 88, "#648447"), (79, 88, "#65844a"), (103, 95, "#597e46"),
        (132, 92, "#56784a"), (124, 96, "#577d4b"), (145, 78, "#5b7847"),
    ]:
        s.polygon([(x - 2, y + 1), (x - 1, y - 1), (x + 2, y - 1),
                   (x + 3, y), (x + 1, y + 1)], color)
    for x, y in [(19, 78), (34, 86), (52, 92), (61, 91), (72, 96),
                 (85, 90), (96, 95), (114, 91), (118, 99), (140, 88)]:
        s.line([(x - 1, y), (x + 1, y), (x + 2, y - 1)], "#253a30", 2)
    return s


def gate():
    s = Sprite(160, 112)
    # The lower piers stay in source x 0..37 and 122..159. The overhang can
    # render separately above sprites walking underneath the opening.
    for offset in (0, 117):
        x = 7 + offset
        post(s, x + 4, 36, 93, 22, 6)
        s.polygon([(x, 84), (x + 22, 84), (x + 30, 79), (x + 30, 101),
                   (x + 23, 108), (x + 1, 108), (x, 106)], STONE[1], INK)
        course_surface(s, [(x + 23, 87), (x + 30, 82), (x + 30, 101),
                           (x + 23, 107)], SIDE_STONE, 1, 3, 13 + offset)
        course_surface(s, [(x + 1, 87), (x + 23, 87), (x + 23, 107),
                           (x + 1, 107)], STONE, 3, 3, 7 + offset)
        s.polygon([(x, 85), (x + 5, 81), (x + 22, 81), (x + 29, 78),
                   (x + 30, 82), (x + 23, 87), (x + 1, 87)], STONE[5], STONE[0])
        s.line([(x + 2, 85), (x + 22, 85), (x + 28, 81)], STONE[6])
        s.rect((x + 5, 70, x + 24, 74), "#4b4e44", INK)
        s.line([(x + 6, 71), (x + 23, 71)], STONE[2])
        s.rect((x + 8, 71, x + 9, 72), GOLD)
        s.rect((x + 20, 71, x + 21, 72), GOLD)

    # Joints, diagonal knee braces and an unobstructed opening below them.
    s.polygon([(24, 49), (49, 43), (62, 44), (48, 52), (37, 62),
               (30, 71), (24, 68)], WOOD, INK)
    s.line([(26, 63), (38, 51), (50, 47)], WOOD_LIT, 2)
    s.line([(30, 68), (40, 55), (51, 49)], WOOD_DARK, 2)
    s.polygon([(111, 47), (126, 44), (140, 51), (140, 68), (133, 71),
               (127, 64), (120, 55)], WOOD, INK)
    s.line([(115, 49), (124, 56), (132, 66)], WOOD_LIT, 2)
    s.line([(129, 52), (136, 67)], WOOD_DARK, 2)
    s.polygon([(11, 36), (141, 36), (150, 33), (150, 45), (141, 53),
               (11, 53)], WOOD_DARK, INK)
    s.rect((12, 43, 140, 50), WOOD)
    s.line([(12, 44), (140, 44)], WOOD_LIT)
    s.line([(33, 48), (56, 48)], "#976740")
    s.line([(94, 48), (122, 48)], "#8d603c")
    for x in (19, 31, 128, 137):
        s.rect((x, 46, x + 2, 48), WOOD_DARK)
        s.rect((x, 46, x + 1, 47), GOLD)

    # Long hipped roof, slightly upturned eaves and a bronze civic shield.
    s.polygon([(122, 15), (145, 26), (157, 36), (156, 41), (143, 46),
               (132, 39)], GREEN[0], INK)
    course_surface(s, [(24, 14), (125, 14), (145, 39), (5, 39)], GREEN, 17, 5, 64, roofing=True)
    s.polygon([(5, 37), (19, 22), (24, 14), (30, 12), (25, 17), (18, 28),
               (13, 37), (5, 40), (2, 38)], GREEN[2], WOOD_DARK)
    s.line([(6, 36), (19, 22), (24, 14), (30, 12), (122, 12), (130, 15)], GREEN[6], 2)
    s.line([(25, 16), (121, 16)], GREEN[5])
    s.line([(125, 15), (144, 26), (155, 36)], GREEN[4])
    roof_eave(s, (3, 38), (145, 38), GREEN, 5)
    s.line([(145, 42), (156, 36)], GREEN[5], 2)
    s.line([(9, 40), (144, 40)], GOLD)
    for x in (10, 27, 44, 112, 129, 143):
        s.line([(x, 42), (x + 3, 42)], WOOD_GOLD)
    s.polygon([(66, 36), (86, 36), (87, 46), (83, 52), (77, 56),
               (69, 52), (65, 46)], WOOD_DARK, INK)
    s.polygon([(68, 38), (84, 38), (84, 46), (81, 50), (76, 53),
               (71, 50), (68, 46)], GOLD, CLAY[1])
    s.line([(69, 39), (82, 39)], GLINT)
    s.polygon([(76, 41), (80, 45), (76, 49), (72, 45)], GREEN[1])
    s.line([(76, 43), (76, 47)], GREEN[6])
    return s


# The anchor is consumed externally by the game. It is retained here to make
# the placement contract verifiable without including PNG text chunks.
ASSETS = (
    ("elderhall.cottage-reference", (160, 160), (80, 156), (3, 3), cottage),
    ("elderhall.guild-reference", (160, 160), (80, 156), (3, 3), guild),
    ("elderhall.shop-reference", (160, 160), (80, 156), (3, 3), shop),
    ("elderhall.well-reference", (128, 160), (64, 156), (1.5, 1.875), well),
    ("elderhall.tree-reference", (160, 144), (80, 140), (2.8, 2.52), tree),
    ("elderhall.gate-reference", (160, 112), (80, 108), (4.5, 3.15), gate),
)


def review_sheet(images):
    """Standalone proof: native pixels and nominal map sizes on a plain field."""
    sheet = Image.new("RGB", (632, 570), "#28382e")
    draw = ImageDraw.Draw(sheet)
    draw.text((9, 7), "ELDERHALL   /   ORIGINAL PIXEL ART", fill=GLINT)
    draw.text((9, 28), "NATIVE PNG  /  1x", fill="#cbd2b7")
    for index, (image, (asset_id, _, anchor, _, _)) in enumerate(zip(images, ASSETS)):
        x = 8 + index % 3 * 208
        y = 44 + index // 3 * 183
        draw.rectangle((x, y, x + 199, y + 163), fill="#394e3c")
        sheet.paste(image, (x + 100 - anchor[0], y + 157 - anchor[1]), image)
        name = asset_id.removeprefix("elderhall.").removesuffix("-reference")
        draw.text((x + 4, y + 166), name.upper(), fill="#e3d8b3")
    draw.text((9, 416), "NOMINAL MAP SIZE  /  32 PX PER TILE", fill="#cbd2b7")
    draw.rectangle((8, 435, 623, 553), fill="#546445")
    draw.rectangle((8, 532, 623, 553), fill="#827556")
    x = 11
    for image, (_, _, anchor, tile_size, _) in zip(images, ASSETS):
        size = tuple(round(side * 32) for side in tile_size)
        mini = image.resize(size, Image.Resampling.NEAREST)
        y = 545 - round(anchor[1] * size[1] / image.height)
        sheet.paste(mini, (x, y), mini)
        x += size[0] + 8
    return sheet


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="directory for the six sprite PNGs")
    parser.add_argument("--preview", action="store_true", help="also save a visual QA sheet")
    args = parser.parse_args()
    output_dir = args.out
    output_dir.mkdir(parents=True, exist_ok=True)
    images = []
    for asset_id, dimensions, anchor, _, draw_asset in ASSETS:
        image = draw_asset().image
        alpha = image.getchannel("A")
        assert image.size == dimensions and set(alpha.getdata()) == {0, 255}, asset_id
        assert alpha.getbbox()[3] == anchor[1] + 1, (asset_id, alpha.getbbox())
        if asset_id == "elderhall.gate-reference":
            assert alpha.crop((38, 64, 122, 112)).getbbox() is None
            assert alpha.crop((0, 103, 38, 109)).getbbox() is not None
            assert alpha.crop((122, 103, 160, 109)).getbbox() is not None
        image.save(output_dir / f"{asset_id}.png", compress_level=9)
        images.append(image)
    if args.preview:
        review_sheet(images).save(output_dir / "elderhall-original-review.png", compress_level=9)


if __name__ == "__main__":
    main()
