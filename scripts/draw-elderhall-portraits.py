"""Rasterize the original Elderhall portrait drawings at their native scale."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw

UNIT = 3
SIZE = (80 * UNIT, 104 * UNIT)
OUT = Path(__file__).resolve().parents[1] / "assets" / "elderhall-portraits"
INK = "#211b20"
GOLD = ("#68452d", "#ad783e", "#e6ad52", "#f7d68a")
SKIN = ("#58362e", "#855141", "#b06e50", "#d28d62", "#e8ad7b", "#f5c18e")
ELDER = ("#5b3e39", "#8e6150", "#b98363", "#d3a17b", "#e7b992", "#f6ceaa")
GOBLIN = ("#3b4129", "#535334", "#71754a", "#919958", "#adac6a", "#c4bc7b")
MOSS = ("#26332b", "#344b34", "#4f6841", "#6c8351", "#93a568")
RUST = ("#39252a", "#653830", "#8c4438", "#b05d40", "#cf8355")
TEAL = ("#202e30", "#344344", "#495e56", "#688276", "#90a18b")
OCHRE = ("#342a24", "#594231", "#796142", "#a48353", "#c1a271")
STEEL = ("#2c303b", "#434a52", "#616b71", "#89918d", "#b2b5a3")
SILVER = ("#4b4146", "#746a68", "#b3aaa0", "#dfd4be", "#fff1d4")
PLUM = ("#292632", "#3d3544", "#584659", "#745c70", "#938196")
NAVY = ("#20242e", "#303849", "#3b4857", "#576479", "#838d97")


class Portrait:
    def __init__(self):
        self.image = Image.new("RGBA", SIZE)
        self.draw = ImageDraw.Draw(self.image)

    def shape(self, color, *points):
        self.draw.polygon(self.coordinates(points), fill=color)

    def line(self, color, *points, width=1):
        self.draw.line(self.coordinates(points), fill=color, width=max(1, round(width * UNIT)))

    def dots(self, color, *points):
        self.draw.point(self.coordinates(points), fill=color)

    @staticmethod
    def coordinates(points):
        return [(round(x * (SIZE[0] - 1) / 79), round(y * (SIZE[1] - 1) / 103)) for x, y in points]

    def mantle(self, cloth, shoulders=0, collar=0):
        self.shape(
            INK, (4, 103), (8, 92), (15, 83), (21, 80 - shoulders),
            (32, 76 - collar), (36, 71), (53, 71), (58, 76 - collar),
            (67, 80 - shoulders), (75, 89), (79, 103),
        )
        self.shape(cloth[0], (7, 103), (11, 92), (22, 83 - shoulders),
                   (35, 77 - collar), (54, 76), (67, 82 - shoulders), (74, 91), (77, 103))
        self.shape(cloth[2], (9, 103), (14, 90), (26, 83 - shoulders), (34, 78),
                   (43, 88), (40, 97), (36, 103))
        self.shape(cloth[1], (23, 103), (27, 93), (34, 85), (41, 90),
                   (50, 86), (58, 80), (67, 84 - shoulders), (73, 94), (75, 103))
        self.shape(cloth[3], (12, 99), (18, 89), (29, 83 - shoulders), (33, 83),
                   (22, 91), (19, 97))
        self.line(cloth[0], (30, 90), (37, 96), (37, 103))
        self.line(cloth[2], (51, 91), (57, 92), (63, 97), (64, 103), width=2)
        self.line(cloth[3], (58, 84), (62, 85), (65, 88))
        self.dots(cloth[4], (19, 89), (22, 87), (25, 85), (28, 85), (13, 97))
        self.dots(cloth[2], (22, 97), (25, 94), (54, 96), (57, 99), (62, 102))

    def head(self, skin, *, round_face=False, aged=False, eyes="#38292a"):
        jaw = 62 if round_face else 58
        self.shape(INK, (24, 30), (29, 24), (47, 21), (58, 28), (64, 43),
                   (64, 57), (jaw, 69), (53, 74), (55, 80), (46, 86),
                   (33, 81), (35, 73), (30, 67), (26, 60), (22, 56), (21, 45))
        self.shape(skin[1], (34, 73), (43, 65), (53, 71), (53, 79), (45, 84), (35, 80))
        self.shape(skin[2], (25, 32), (35, 25), (48, 24), (56, 28),
                   (61, 38), (62, 53), (jaw - 1, 64), (54, 71),
                   (47, 74), (38, 70), (32, 64), (28, 57), (24, 56), (23, 48))
        self.shape(skin[3], (26, 36), (32, 29), (45, 27), (51, 30), (54, 41),
                   (53, 47), (57, 53), (57, 60), (51, 69), (45, 71),
                   (38, 67), (32, 57), (29, 49), (25, 49))
        self.shape(skin[4], (29, 37), (33, 32), (42, 30), (47, 33), (48, 39),
                   (41, 43), (33, 44), (33, 48), (39, 50), (42, 53), (38, 57), (34, 55), (30, 49))
        self.shape(skin[4], (45, 45), (48, 44), (50, 49), (52, 53), (52, 56),
                   (48, 58), (44, 57), (46, 53))
        self.shape(skin[1], (56, 32), (60, 36), (62, 51), (59, 51), (58, 46))
        self.line(skin[5], (32, 37), (35, 34), (41, 33))
        self.line(skin[5], (46, 49), (47, 52), (49, 54))
        self.line(skin[1], (47, 58), (50, 58), (52, 56))
        self.line(skin[1], (23, 51), (26, 51), (27, 54))
        self.line(skin[1], (33, 44), (36, 42), (41, 42), (43, 43))
        self.line(skin[1], (51, 43), (55, 42), (59, 44))
        self.line(eyes, (34, 47), (37, 46), (41, 46), (43, 47))
        self.line(eyes, (52, 47), (55, 46), (58, 47))
        self.line(eyes, (39, 47), (39, 49))
        self.line(eyes, (55, 47), (55, 49))
        self.dots(skin[5], (38, 47), (54, 47), (35, 53), (38, 52))
        self.line(skin[0], (42, 63), (45, 64), (50, 64), (54, 62))
        self.line(skin[4], (44, 66), (49, 66), (51, 65))
        self.line(skin[1], (40, 71), (46, 74), (51, 73))
        if aged:
            self.line(skin[2], (30, 46), (32, 48), (34, 49))
            self.line(skin[2], (34, 52), (38, 53), (41, 52))
            self.line(skin[2], (40, 55), (38, 58), (38, 62))
            self.line(skin[2], (54, 53), (56, 55), (57, 59))
            self.line(skin[4], (31, 40), (36, 38), (42, 38))
            self.dots(skin[1], (42, 68), (43, 69), (56, 51), (34, 51))

    def clasp(self, x, y):
        self.shape(GOLD[0], (x - 5, y), (x - 3, y - 3), (x + 2, y - 3),
                   (x + 4, y), (x + 3, y + 4), (x - 3, y + 4))
        self.line(GOLD[2], (x - 4, y), (x - 2, y - 2), (x + 2, y - 2))
        self.shape(GOLD[1], (x - 2, y), (x, y - 1), (x + 2, y), (x + 2, y + 2), (x, y + 3), (x - 2, y + 2))
        self.dots(GOLD[3], (x - 1, y), (x, y + 1))

    def hood(self, cloth):
        self.shape(INK, (18, 60), (16, 38), (19, 26), (26, 16), (36, 10),
                   (46, 8), (57, 13), (65, 23), (69, 36), (68, 57),
                   (63, 70), (57, 78), (48, 84), (35, 83), (27, 78))
        self.shape(cloth[1], (20, 61), (18, 37), (22, 26), (30, 17), (44, 11),
                   (52, 12), (62, 23), (67, 36), (65, 59), (58, 73), (49, 81), (34, 81), (27, 75))
        self.shape(cloth[3], (19, 41), (22, 28), (29, 20), (40, 15), (50, 14),
                   (58, 20), (49, 19), (39, 22), (30, 29), (26, 39), (24, 57), (27, 68), (22, 62))
        self.line(cloth[4], (22, 35), (26, 26), (33, 20), (44, 16))
        self.shape(cloth[0], (26, 42), (30, 31), (39, 24), (49, 21), (59, 25),
                   (63, 33), (64, 59), (58, 71), (49, 77), (36, 76), (29, 69))

    def hood_edge(self, cloth):
        self.shape(cloth[2], (23, 52), (26, 58), (31, 71), (38, 77), (48, 81), (41, 83),
                   (31, 79), (26, 73), (21, 62))
        self.line(cloth[4], (25, 64), (30, 73), (35, 76))
        self.shape(cloth[0], (63, 41), (66, 37), (66, 56), (62, 67), (56, 76),
                   (49, 82), (42, 83), (55, 72), (60, 61))


def maren():
    p = Portrait()
    p.mantle(NAVY, 3)
    p.shape(MOSS[2], (10, 100), (16, 90), (28, 81), (34, 85), (25, 91), (21, 103))
    p.shape(MOSS[1], (56, 83), (67, 82), (74, 91), (77, 103), (67, 103), (65, 93))
    p.shape(INK, (16, 61), (19, 30), (26, 21), (31, 21), (34, 12),
            (43, 7), (50, 9), (54, 14), (53, 21), (62, 28), (66, 40),
            (64, 66), (60, 82), (53, 91), (36, 87), (26, 75), (19, 72))
    p.shape(SILVER[1], (19, 61), (21, 32), (30, 22), (53, 20), (61, 29),
            (64, 43), (61, 67), (57, 83), (51, 87), (39, 83), (27, 73), (21, 69))
    p.shape(SILVER[2], (34, 20), (35, 14), (44, 9), (49, 11), (52, 16), (50, 23))
    p.line(SILVER[4], (36, 16), (40, 13), (45, 12), (49, 14))
    p.head(ELDER, aged=True)
    p.shape(SILVER[2], (19, 53), (20, 35), (26, 27), (34, 23), (44, 20),
            (51, 22), (55, 28), (47, 28), (39, 33), (29, 37), (25, 47), (25, 58))
    p.shape(SILVER[3], (21, 40), (24, 32), (30, 27), (39, 24), (46, 23), (52, 25),
            (45, 28), (38, 28), (31, 31), (25, 37))
    p.line(SILVER[4], (23, 34), (29, 29), (37, 26), (44, 25))
    p.shape(SILVER[2], (52, 26), (61, 33), (64, 43), (62, 61), (59, 69),
            (59, 78), (53, 88), (49, 87), (50, 79), (54, 74), (56, 64), (59, 54), (59, 40))
    p.line(SILVER[3], (55, 30), (59, 35), (61, 44), (60, 55))
    for x, y in [(59, 61), (57, 67), (56, 73), (54, 79), (51, 85)]:
        p.line(SILVER[4], (x - 2, y), (x, y - 2), (x + 2, y - 1))
        p.line(SILVER[1], (x - 2, y + 2), (x + 1, y + 2))
    p.line(SILVER[2], (24, 52), (26, 60), (24, 68), (25, 76))
    p.line(GOLD[0], (25, 36), (32, 32), (41, 31), (48, 29), (54, 30))
    p.line(GOLD[2], (34, 32), (41, 30), (47, 30))
    p.dots(GOLD[3], (47, 31), (28, 33))
    p.line(MOSS[4], (25, 83), (33, 88), (37, 95), (43, 100))
    p.line(GOLD[1], (39, 84), (43, 90), (47, 94), (51, 89))
    p.clasp(47, 96)
    return p


def cael():
    p = Portrait()
    p.mantle(NAVY, 4, 2)
    p.head(SKIN)
    p.shape(INK, (23, 56), (20, 39), (22, 25), (28, 19), (37, 16), (49, 17),
            (55, 20), (61, 27), (64, 35), (62, 46), (57, 39), (56, 31),
            (48, 29), (38, 32), (31, 34), (27, 45), (26, 52))
    p.shape("#514039", (22, 38), (25, 27), (31, 22), (40, 19), (49, 20), (55, 25),
            (44, 24), (37, 27), (33, 29), (26, 37))
    p.line("#7c5b47", (27, 28), (34, 23), (43, 22), (48, 23))
    p.line("#b56451", (52, 35), (50, 39), (50, 44), (48, 48))
    p.dots(SKIN[5], (51, 39), (49, 44))
    p.line(SKIN[0], (33, 42), (38, 42), (43, 45), width=2)
    p.line("#69483b", (33, 62), (37, 68), (44, 71), (50, 71), (55, 67))
    p.shape(NAVY[0], (26, 76), (33, 72), (38, 79), (47, 84), (57, 74), (63, 78),
            (58, 91), (47, 97), (37, 91))
    for x, y in [(22, 82), (63, 82)]:
        p.shape(INK, (x - 12, y + 5), (x - 8, y - 2), (x + 5, y - 5),
                (x + 10, y), (x + 12, y + 9), (x + 4, y + 13), (x - 10, y + 11))
        p.shape(STEEL[2], (x - 10, y + 5), (x - 5, y - 1), (x + 5, y - 3),
                (x + 8, y + 1), (x + 10, y + 8), (x - 9, y + 9))
        p.line(STEEL[4], (x - 7, y + 3), (x - 4, y), (x + 4, y - 1))
        p.line(STEEL[0], (x - 9, y + 8), (x + 7, y + 5))
        p.line(STEEL[3], (x - 7, y + 10), (x + 6, y + 8))
    p.clasp(47, 94)
    p.line(GOLD[3], (47, 95), (47, 90), (49, 89))
    return p


def guard():
    p = Portrait()
    p.mantle(NAVY, 2)
    p.head(SKIN)
    p.shape(INK, (14, 39), (17, 33), (23, 31), (25, 23), (32, 17), (45, 14),
            (55, 17), (63, 23), (66, 31), (71, 35), (73, 41), (70, 46),
            (59, 47), (54, 43), (35, 42), (26, 45), (16, 44))
    p.shape(STEEL[2], (24, 34), (28, 24), (34, 19), (44, 16), (53, 18),
            (60, 23), (63, 34), (54, 32), (35, 31))
    p.shape(STEEL[3], (27, 32), (31, 23), (39, 19), (46, 18), (43, 23), (36, 26), (35, 32))
    p.line(STEEL[4], (31, 25), (36, 21), (43, 19))
    p.shape(STEEL[0], (16, 39), (19, 36), (29, 33), (56, 33), (67, 36), (71, 39),
            (69, 43), (59, 45), (47, 40), (36, 40), (26, 43), (18, 42))
    p.line(STEEL[4], (18, 38), (28, 34), (42, 33), (55, 34), (64, 36))
    p.line(STEEL[2], (19, 41), (31, 38), (49, 37), (62, 40), (69, 41))
    p.shape(STEEL[1], (22, 43), (27, 44), (27, 60), (32, 67), (32, 74), (22, 68))
    p.shape(STEEL[1], (61, 45), (66, 44), (64, 65), (57, 73), (57, 66))
    p.line(STEEL[3], (24, 45), (24, 58), (27, 64))
    p.line("#57392e", (40, 61), (45, 60), (49, 61), (52, 60), (55, 61), width=2)
    p.shape(STEEL[1], (33, 79), (44, 84), (53, 82), (58, 77), (60, 89), (49, 95), (37, 91))
    p.line(STEEL[3], (35, 82), (44, 87), (53, 85), (56, 82))
    p.clasp(24, 94)
    return p


def traveler():
    p = Portrait()
    p.mantle(PLUM, 1)
    p.hood(PLUM)
    p.head(("#4c3129", "#754b38", "#986448", "#b47f54", "#d69e66", "#e5b17d"))
    p.shape(PLUM[0], (25, 47), (26, 36), (30, 28), (43, 22), (53, 22), (61, 27),
            (63, 39), (58, 36), (52, 32), (42, 32), (31, 37))
    p.hood_edge(PLUM)
    p.line("#78553b", (39, 64), (43, 68), (51, 70), (55, 66))
    p.line(GOLD[1], (20, 88), (28, 90), (35, 96), (38, 103), width=2)
    p.line(GOLD[2], (20, 88), (28, 91), (33, 95))
    p.clasp(30, 88)
    return p


def innkeep():
    p = Portrait()
    p.mantle(RUST, 0)
    p.head(ELDER, round_face=True)
    p.shape("#53372d", (23, 41), (22, 33), (24, 24), (31, 20), (49, 19),
            (59, 25), (65, 37), (62, 53), (59, 49), (57, 37), (48, 31),
            (37, 31), (31, 37), (27, 46))
    p.shape(RUST[2], (21, 35), (24, 25), (31, 19), (40, 15), (51, 16), (62, 23),
            (67, 32), (62, 38), (56, 33), (49, 29), (37, 28), (29, 31))
    p.shape(RUST[3], (24, 28), (31, 21), (41, 18), (51, 19), (59, 24), (51, 24),
            (42, 22), (33, 24), (28, 29))
    p.line(RUST[4], (27, 25), (34, 21), (42, 20))
    p.shape(RUST[1], (62, 27), (72, 22), (71, 31), (66, 35), (70, 40), (64, 42), (61, 37))
    p.dots(GOLD[2], (67, 28), (66, 30), (69, 25))
    p.line("#b77862", (32, 55), (34, 56), (38, 55), width=2)
    p.line("#b77862", (54, 54), (57, 55), (59, 54))
    p.line(ELDER[0], (41, 62), (44, 64), (49, 65), (54, 62))
    p.shape("#a18e70", (26, 84), (33, 82), (39, 88), (50, 89), (57, 83),
            (63, 85), (61, 103), (26, 103))
    p.shape("#d8c29a", (28, 86), (32, 85), (36, 91), (52, 92), (58, 85),
            (60, 86), (57, 100), (53, 103), (30, 103))
    p.line("#f2dbad", (29, 88), (32, 96), (33, 101))
    p.line("#bba27b", (40, 95), (48, 96), (52, 95))
    p.dots(GOLD[0], (28, 87), (59, 87))
    return p


def shopkeep():
    p = Portrait()
    p.mantle(TEAL, 1)
    p.head(SKIN)
    p.shape(INK, (17, 37), (21, 28), (28, 21), (42, 18), (54, 20), (65, 27),
            (70, 32), (70, 37), (64, 40), (48, 39), (33, 41), (21, 43), (17, 41))
    p.shape(OCHRE[2], (20, 36), (24, 29), (31, 23), (43, 21), (53, 23), (61, 27),
            (65, 32), (50, 32), (35, 36))
    p.shape(OCHRE[3], (24, 31), (31, 25), (40, 23), (49, 23), (45, 26),
            (35, 27), (29, 31))
    p.line(OCHRE[4], (28, 28), (34, 25), (43, 24))
    p.shape(OCHRE[0], (22, 37), (46, 32), (63, 32), (69, 34), (66, 37),
            (49, 37), (31, 39), (22, 41), (18, 40))
    p.line(OCHRE[3], (23, 37), (38, 34), (51, 33), (63, 34))
    p.line("#704a37", (35, 62), (40, 69), (47, 72), (53, 70), (57, 66), width=2)
    p.shape("#624130", (39, 61), (46, 58), (50, 60), (53, 59), (57, 61),
            (55, 63), (50, 62), (45, 62), (41, 64), (38, 64))
    p.line(GOLD[1], (39, 86), (45, 90), (46, 103), width=2)
    p.line(TEAL[4], (34, 80), (38, 86), (43, 89))
    p.line(TEAL[4], (54, 80), (51, 84), (46, 88))
    p.dots(GOLD[3], (45, 93), (46, 98), (19, 92))
    p.clasp(59, 89)
    return p


def patch():
    p = Portrait()
    p.mantle(MOSS, 1)
    p.hood(MOSS)
    p.head(GOBLIN, eyes="#37321e")
    p.hood_edge(MOSS)
    p.shape(INK, (7, 41), (20, 42), (30, 49), (31, 60), (24, 62), (16, 56))
    p.shape(GOBLIN[3], (11, 43), (21, 46), (28, 51), (28, 59), (23, 59), (17, 54))
    p.line(GOBLIN[1], (15, 46), (21, 49), (26, 56))
    p.shape(INK, (60, 49), (68, 43), (78, 39), (75, 46), (69, 56), (63, 60), (58, 58))
    p.shape(GOBLIN[3], (60, 52), (67, 46), (74, 43), (71, 49), (66, 55), (61, 57))
    p.line(GOBLIN[1], (62, 55), (67, 51), (71, 47))
    p.line(GOLD[2], (35, 48), (40, 48), (42, 47))
    p.line(GOLD[2], (52, 48), (56, 48), (58, 47))
    p.dots(INK, (39, 48), (55, 48))
    p.shape(GOBLIN[4], (45, 49), (47, 48), (50, 53), (52, 55), (50, 58),
            (44, 57), (43, 55))
    p.line(GOBLIN[1], (44, 58), (49, 59), (52, 57))
    p.line("#3d3624", (39, 61), (44, 64), (48, 65), (54, 63), (58, 60))
    p.dots("#efdaa3", (43, 63), (44, 62), (53, 63), (54, 62))
    p.shape(OCHRE[2], (13, 92), (20, 87), (31, 94), (27, 101), (17, 101))
    p.line(OCHRE[4], (15, 92), (20, 89), (28, 94))
    p.dots("#d3b87b", (18, 91), (24, 92), (28, 95), (26, 98), (18, 99))
    p.clasp(53, 89)
    return p


def replace_colors(p, before, after):
    colors = dict(zip(map(ImageColor.getrgb, before), map(ImageColor.getrgb, after)))
    pixels = p.image.load()
    for y in range(p.image.height):
        for x in range(p.image.width):
            red, green, blue, alpha = pixels[x, y]
            color = colors.get((red, green, blue))
            if color:
                pixels[x, y] = (*color, alpha)
    return p


def keep_guard():
    p = replace_colors(guard(), NAVY, RUST)
    p.shape(STEEL[0], (26.5, 39), (30, 22), (40, 16), (37, 30), (38, 39))
    p.line(STEEL[3], (29, 34), (32, 23), (37, 19), width=0.75)
    p.line(GOLD[2], (34, 29), (33, 34), width=0.65)
    p.line("#74483c", (47, 56), (47, 61), (44, 66), width=0.7)
    return p


def lise():
    p = replace_colors(traveler(), PLUM, OCHRE)
    p.shape(SILVER[2], (26, 40), (34, 31), (44, 29), (51, 34), (43, 33),
            (36, 38), (31, 50), (26, 57))
    p.line(SILVER[3], (29, 42), (34, 36), (42, 32), width=0.65)
    p.line(ELDER[1], (34, 53), (37, 54), (40, 53), width=0.5)
    p.line(ELDER[1], (53, 53), (56, 55), (57, 59), width=0.5)
    return p


def reedcutter():
    p = replace_colors(traveler(), PLUM, TEAL)
    p.shape(OCHRE[1], (19, 40), (28, 32), (40, 27), (58, 27), (68, 29), (73, 34),
            (58, 34), (40, 34), (27, 39))
    p.line(OCHRE[4], (25, 36), (42, 29), (58, 29), (68, 31), width=0.65)
    p.line(OCHRE[3], (31, 36), (42, 33), (61, 32), width=0.6)
    return p


def keep_innkeep():
    p = replace_colors(innkeep(), RUST, PLUM)
    p.shape(SILVER[1], (25, 38), (31, 31), (42, 28), (51, 31), (58, 36),
            (54, 34), (44, 33), (35, 35), (29, 42), (28, 49))
    p.line(SILVER[3], (29, 36), (37, 31), (46, 31), width=0.6)
    p.line(ELDER[1], (32, 51), (35, 53), (39, 52), width=0.52)
    return p


def chandler():
    p = replace_colors(shopkeep(), TEAL, NAVY)
    p.shape(OCHRE[0], (30, 60), (36, 63), (43, 64), (49, 62), (53, 63), (59, 61),
            (57, 68), (49, 74), (42, 73), (35, 68))
    p.line(OCHRE[2], (37, 66), (43, 70), (49, 71), (55, 67), width=0.65)
    p.shape(GOLD[0], (54, 83), (59, 82), (63, 87), (59, 93), (55, 90))
    p.line(GOLD[3], (56, 85), (58, 84), (61, 87), (59, 91), width=0.55)
    return p


def rowan():
    p = Portrait()
    p.mantle(OCHRE, 3, 1)
    p.head(SKIN, eyes="#403827")
    p.shape(INK, (22, 52), (20, 38), (23, 28), (31, 21), (45, 17), (56, 21),
            (63, 28), (65, 40), (60, 45), (52, 33), (43, 30), (35, 36),
            (28, 40), (26, 52))
    p.shape("#7a5539", (22, 39), (25, 30), (35, 23), (46, 20), (57, 24),
            (62, 31), (53, 28), (42, 26), (31, 31))
    p.line("#aa784e", (26, 32), (32, 26), (43, 23), (52, 24), width=0.7)
    p.shape(MOSS[1], (25, 79), (34, 74), (45, 84), (54, 80), (59, 75),
            (65, 80), (59, 91), (47, 96), (35, 88))
    p.line(MOSS[4], (29, 79), (35, 78), (45, 87), (53, 85), width=0.75)
    p.line(GOLD[2], (39, 89), (46, 94), (54, 90), width=0.65)
    p.clasp(47, 96)
    return p


def finish_portrait(p, role):
    """Add native-resolution edges and material marks inside the drawn silhouette."""
    # The half-unit strokes render directly into the selected native canvas.
    seam = (("#859693", "#39434c") if role in {"maren", "cael", "guard"}
            else ("#ab9273", "#554237"))
    for side in (0, 1):
        x = 17 if side == 0 else 64
        step = 1 if side == 0 else -1
        for n in range(11):
            y = 91 + n * 0.86
            p.line(seam[n % 2], (x - n * 0.32 * step, y), (x + (1.2 - n * 0.32) * step, y - 0.7), width=0.33)
    if role == "maren":
        for n in range(11):
            y = 48 + n * 3.55
            x = 60 - max(0, n - 4) * 0.82
            p.line(SILVER[0], (x - 2, y), (x, y + 1.2), (x + 2, y + 0.3), width=0.36)
            p.line(SILVER[4], (x - 2.7, y - 0.55), (x - 0.8, y + 0.4), width=0.34)
        p.line(ELDER[1], (34.2, 38.5), (38.2, 37.6), (42.4, 37.9), width=0.4)
        p.line(ELDER[2], (33.7, 51), (36.1, 52.1), (40.2, 51.5), width=0.36)
    elif role in {"cael", "guard"}:
        for x, y in [(19.5, 86), (62, 85)]:
            for n in range(4):
                p.line(STEEL[1], (x + n * 1.1, y - n * 0.37), (x + n * 1.1 + 0.7, y + 0.6 - n * 0.37), width=0.4)
        p.line(SKIN[4], (49, 57.9), (51, 57.3), (52.2, 55.6), width=0.36)
    elif role == "innkeep":
        for x, y in [(33.5, 53.7), (35.1, 55), (36.8, 53.6), (55, 54.2), (55.9, 55.7), (57.2, 53.8)]:
            p.dots("#8e6150", (x, y))
        for n in range(8):
            p.line("#a58764", (34 + n * 2.5, 99.5), (35 + n * 2.5, 98.8), width=0.34)
    elif role == "shopkeep":
        p.line("#ae8b5c", (28, 36.2), (42, 33.8), (53, 33.2), width=0.4)
        for n in range(5):
            p.line("#3d302a", (39 + n * 3.5, 61.8), (40 + n * 3.5, 60.6), width=0.34)

    # Weave and pigment accents are clipped to their individual materials, so
    # the lithographic detail cannot dirty eyes, edges or transparent pixels.
    textiles = {ImageColor.getrgb(color) for palette in (NAVY, PLUM, MOSS, RUST, TEAL, OCHRE)
                for color in palette[1:4]}
    pixels = p.image.load()
    for y in range(round(SIZE[1] * 0.82), SIZE[1]):
        for x in range(SIZE[0]):
            red, green, blue, alpha = pixels[x, y]
            if not alpha or (red, green, blue) not in textiles:
                continue
            if (x + 3 * y) % 13 == 0:
                pixels[x, y] = (red + 7, green + 5, blue + 4, alpha)
            elif (x + 5 * y) % 19 == 0:
                pixels[x, y] = (red - 5, green - 4, blue - 3, alpha)


def main():
    global UNIT, SIZE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scale", choices=(2, 3), type=int, default=3)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    UNIT = args.scale
    SIZE = (80 * UNIT, 104 * UNIT)
    drawings = (maren, cael, guard, keep_guard, traveler, lise, reedcutter,
                innkeep, keep_innkeep, shopkeep, chandler, patch, rowan)
    source_sha256 = hashlib.sha256(Path(__file__).read_text(encoding="utf-8").encode()).hexdigest()
    args.out.mkdir(parents=True, exist_ok=True)
    assets = []
    for draw_portrait in drawings:
        portrait = draw_portrait()
        finish_portrait(portrait, draw_portrait.__name__)
        path = args.out / f"{draw_portrait.__name__}.png"
        portrait.image.save(path, "PNG", compress_level=9)
        assets.append({
            "id": draw_portrait.__name__,
            "file": path.name,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "dimensions": list(SIZE),
            "alphaBounds": list(portrait.image.getbbox()),
        })
    manifest = {
        "source": "scripts/draw-elderhall-portraits.py",
        "sourceSha256": source_sha256,
        "method": "Original pixel clusters and native-resolution material strokes rendered directly to transparent PNG with Pillow. The 160×208 comparison is rendered separately with --scale 2.",
        "rightsBasis": "Drawn for Reliquary under the repository owner's delegated original-art authorization. Character identities follow Reliquary's existing dialogue roster.",
        "assets": assets,
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
