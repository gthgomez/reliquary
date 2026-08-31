import type { MapDef, MapObj } from "./types.ts";

function tree(id: string, x: number, y: number): MapObj {
  return { id, sprite: "tree", x, y, w: 2, h: 2, foot: 1, solid: true };
}
function house(id: string, sprite: string, x: number, y: number, interact: string): MapObj {
  return { id, sprite, x, y, w: 3, h: 3, foot: 2, solid: true, interact };
}
function prop(id: string, sprite: string, x: number, y: number, interact?: string): MapObj {
  return { id, sprite, x, y, w: 1, h: 1, foot: 1, solid: true, interact };
}

const elderhall: MapDef = {
  id: "elderhall",
  name: "Elderhall",
  region: "Hollowmere",
  battleBg: "grass",
  encounterRate: 0,
  encounters: [],
  spawn: { x: 12, y: 14 },
  ground: [
    "........................",
    "..........pp............",
    "..........pp............",
    "....ccc...pp...ccc......",
    "....ccc...pp...ccc......",
    "..........pp............",
    "..........pp............",
    "....ccc...pp...ccc......",
    "....ccc...pp...ccc......",
    "pppppp....pp............",
    "ppppcccccccccccccccc....",
    "..........pp............",
    "..........pp............",
    "....ccc...pp............",
    "....ccc...pp............",
    "..........pp............",
    "..........pp............",
    "........................",
  ],
  objects: [
    tree("t1", 0, 0), tree("t2", 2, 0), tree("t3", 4, 0), tree("t4", 6, 0), tree("t5", 16, 0), tree("t6", 18, 0), tree("t7", 20, 0), tree("t8", 22, 0),
    tree("t9", 0, 2), tree("t10", 22, 2), tree("t11", 0, 4), tree("t12", 22, 4),
    tree("t14", 22, 8), tree("t15", 0, 12), tree("t16", 22, 12),
    tree("t17", 0, 16), tree("t18", 2, 16), tree("t19", 20, 16), tree("t20", 22, 16),
    house("h_home", "cottage", 4, 12, "enter_home"),
    house("h_guild", "cottage", 4, 6, "enter_guild"),
    house("h_inn", "inn", 16, 2, "enter_inn"),
    house("h_shop", "shop", 16, 6, "enter_shop"),
    { id: "shrine", sprite: "shrine", x: 16, y: 12, w: 1, h: 2, foot: 1, solid: true, interact: "shrine" },
    prop("well", "well", 8, 10),
    prop("sign_n", "sign", 13, 1, "sign_road"),
    prop("sign_w", "sign", 2, 8, "sign_grove"),
    prop("barrel1", "barrel", 19, 9),
    prop("crate1", "crate", 20, 9),
    prop("shrub1", "shrub", 9, 4),
    prop("shrub2", "shrub", 14, 8),
  ],
  npcs: [
    { id: "maren", sprite: "elder", x: 7, y: 9, name: "Elder Maren", talk: "maren" },
    { id: "guard", sprite: "guard", x: 11, y: 2, name: "Gateward", talk: "guard" },
    { id: "villager", sprite: "traveler", x: 15, y: 11, name: "Aunt Lise", talk: "lise" },
  ],
  warps: [
    { x: 10, y: 0, to: "briar_road", tx: 9, ty: 26 },
    { x: 11, y: 0, to: "briar_road", tx: 10, ty: 26 },
    { x: 0, y: 9, to: "grove", tx: 13, ty: 7 },
    { x: 0, y: 10, to: "grove", tx: 13, ty: 7 },
  ],
};

const grove: MapDef = {
  id: "grove",
  name: "Binding Grove",
  region: "Hollowmere",
  battleBg: "forest",
  encounterRate: 0,
  encounters: [],
  spawn: { x: 8, y: 11 },
  ground: [
    "................",
    "..,..........,..",
    "................",
    "......ccc.......",
    "......ccc.......",
    "................",
    "....c.ccc.c...pp",
    "....c.ccc.c...pp",
    "......ccc....ppp",
    "......ppp.......",
    "......ppp.......",
    "......ppp.......",
    "................",
    "................",
  ],
  objects: [
    tree("g1", 0, 0), tree("g2", 2, 0), tree("g3", 4, 0), tree("g4", 10, 0), tree("g5", 12, 0), tree("g6", 14, 0),
    tree("g7", 0, 3), tree("g8", 12, 3), tree("g9", 0, 6),
    tree("g11", 0, 10), tree("g12", 2, 12), tree("g13", 12, 12),
    { id: "st_ember", sprite: "emberkit", x: 4, y: 6, w: 1, h: 1, foot: 1, solid: true, interact: "starter_emberkit" },
    { id: "st_mire", sprite: "mirewhelp", x: 8, y: 5, w: 1, h: 1, foot: 1, solid: true, interact: "starter_mirewhelp" },
    { id: "st_briar", sprite: "briarling", x: 11, y: 6, w: 1, h: 1, foot: 1, solid: true, interact: "starter_briarling" },
    prop("gsign", "sign", 9, 10, "sign_grove_inner"),
  ],
  npcs: [],
  warps: [
    { x: 15, y: 6, to: "elderhall", tx: 1, ty: 10 },
    { x: 15, y: 7, to: "elderhall", tx: 1, ty: 10 },
    { x: 15, y: 8, to: "elderhall", tx: 1, ty: 10 },
  ],
};

function interior(id: string, name: string, w: number, h: number, doorX: number, to: string, tx: number, ty: number, extras: Partial<MapDef> = {}): MapDef {
  const ground: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      if (y === 0) row += "#";
      else if (x === 0 || x === w - 1 || y === h - 1) row += "x";
      else row += "f";
    }
    ground.push(row);
  }
  const g = ground[h - 1]!.split("");
  g[doorX] = "f";
  ground[h - 1] = g.join("");
  return {
    id,
    name,
    region: "Hollowmere",
    battleBg: "keep",
    encounterRate: 0,
    encounters: [],
    spawn: { x: doorX, y: h - 2 },
    ground,
    objects: extras.objects ?? [],
    npcs: extras.npcs ?? [],
    warps: [{ x: doorX, y: h - 1, to, tx, ty, dir: 0 }],
  };
}

const home = interior("home", "Rowan's Cottage", 11, 9, 5, "elderhall", 5, 15, {
  objects: [
    { id: "bed", sprite: "bed", x: 2, y: 2, w: 1, h: 1, foot: 1, solid: true, interact: "bed" },
    { id: "table", sprite: "table", x: 5, y: 3, w: 1, h: 1, foot: 1, solid: true },
    { id: "chair", sprite: "chair", x: 6, y: 3, w: 1, h: 1, foot: 1, solid: true },
    { id: "books", sprite: "bookshelf", x: 8, y: 1, w: 1, h: 1, foot: 1, solid: true, interact: "books" },
    { id: "hearth", sprite: "hearth", x: 2, y: 5, w: 1, h: 1, foot: 1, solid: true },
  ],
});

const inn_in = interior("inn_in", "The Quiet Lantern", 13, 10, 6, "elderhall", 17, 5, {
  objects: [
    { id: "counter", sprite: "counter", x: 3, y: 3, w: 1, h: 1, foot: 1, solid: true },
    { id: "bed1", sprite: "bed", x: 9, y: 2, w: 1, h: 1, foot: 1, solid: true },
    { id: "bed2", sprite: "bed", x: 9, y: 5, w: 1, h: 1, foot: 1, solid: true },
    { id: "table", sprite: "table", x: 5, y: 5, w: 1, h: 1, foot: 1, solid: true },
    { id: "hearth", sprite: "hearth", x: 1, y: 4, w: 1, h: 1, foot: 1, solid: true },
  ],
  npcs: [{ id: "innkeep", sprite: "innkeep", x: 4, y: 4, name: "Innmother Cald", talk: "innkeep" }],
});

const shop_in = interior("shop_in", "Calders' Sundries", 11, 9, 5, "elderhall", 17, 9, {
  objects: [
    { id: "counter", sprite: "counter", x: 3, y: 3, w: 1, h: 1, foot: 1, solid: true },
    prop("b1", "barrel", 8, 2),
    prop("c1", "crate", 8, 3),
    prop("p1", "pot", 2, 6),
  ],
  npcs: [{ id: "shopkeep", sprite: "shopkeep", x: 4, y: 4, name: "Calder", talk: "shopkeep" }],
});

const guild_in = interior("guild_in", "Reliquary Chapter", 13, 11, 6, "elderhall", 5, 9, {
  objects: [
    { id: "books1", sprite: "bookshelf", x: 2, y: 1, w: 1, h: 1, foot: 1, solid: true },
    { id: "books2", sprite: "bookshelf", x: 3, y: 1, w: 1, h: 1, foot: 1, solid: true },
    { id: "table", sprite: "table", x: 6, y: 4, w: 1, h: 1, foot: 1, solid: true },
    { id: "hearth", sprite: "hearth", x: 10, y: 3, w: 1, h: 1, foot: 1, solid: true },
    { id: "shrine", sprite: "shrine", x: 6, y: 1, w: 1, h: 2, foot: 1, solid: true, interact: "shrine" },
  ],
  npcs: [{ id: "maren2", sprite: "elder", x: 6, y: 6, name: "Elder Maren", talk: "maren_guild" }],
});

const briar_road: MapDef = {
  id: "briar_road",
  name: "Briar Road",
  region: "Hollowmere",
  battleBg: "grass",
  encounterRate: 0.14,
  encounters: [
    { species: "mothwisp", min: 3, max: 6, w: 3 },
    { species: "galeskip", min: 3, max: 6, w: 3 },
    { species: "pebblet", min: 3, max: 5, w: 2 },
    { species: "gravepup", min: 4, max: 7, w: 1 },
  ],
  spawn: { x: 10, y: 26 },
  ground: [
    "....................",
    "..........pp........",
    "....,,,,..pp..,,,,..",
    "....,,,,..pp..,,,,..",
    "..........pp........",
    "..........pp........",
    "..,,,,,,..pp........",
    "..,,,,,,..pp..,,,,..",
    "..........pp..,,,,..",
    "..........pp........",
    "....pppppppppppp....",
    "..........pp........",
    "..........pp..,,,,..",
    "..,,,,....pp..,,,,..",
    "..,,,,....pp........",
    "..........pp........",
    "..........pp........",
    "....,,,,..pp..,,,,..",
    "....,,,,..pp..,,,,..",
    "..........pp........",
    "..........pp........",
    "..,,,,,,..pp........",
    "..,,,,,,..pp........",
    "..........pp........",
    "..........pp........",
    "..........pp........",
    "..........pp........",
    "....................",
  ],
  objects: [
    tree("b1", 0, 0), tree("b2", 2, 0), tree("b3", 16, 0), tree("b4", 18, 0),
    tree("b5", 0, 4), tree("b6", 18, 4), tree("b7", 0, 10), tree("b8", 18, 8),
    tree("b9", 0, 16), tree("b10", 18, 16), tree("b11", 0, 22), tree("b12", 18, 22),
    tree("b13", 0, 26), tree("b14", 2, 26), tree("b15", 16, 26), tree("b16", 18, 26),
    prop("bsign", "sign", 12, 24, "sign_briar"),
    prop("rock1", "boulder", 7, 12),
    prop("rock2", "boulder", 14, 6),
    prop("fence1", "fence", 8, 10),
    { id: "chest_briar", sprite: "crate", x: 16, y: 13, w: 1, h: 1, foot: 1, solid: true, interact: "chest_briar" },
  ],
  npcs: [{ id: "road_traveler", sprite: "traveler", x: 12, y: 16, name: "Wayfarer", talk: "wayfarer" }],
  warps: [
    { x: 9, y: 27, to: "elderhall", tx: 11, ty: 1 },
    { x: 10, y: 27, to: "elderhall", tx: 11, ty: 1 },
    { x: 11, y: 27, to: "elderhall", tx: 11, ty: 1 },
    { x: 9, y: 0, to: "wildwood", tx: 10, ty: 20 },
    { x: 10, y: 0, to: "wildwood", tx: 10, ty: 20 },
    { x: 11, y: 0, to: "wildwood", tx: 10, ty: 20 },
    { x: 19, y: 10, to: "mirefen", tx: 1, ty: 9 },
    { x: 19, y: 11, to: "mirefen", tx: 1, ty: 9 },
  ],
};

const wildwood: MapDef = {
  id: "wildwood",
  name: "Wildwood",
  region: "Hollowmere",
  battleBg: "forest",
  encounterRate: 0.16,
  encounters: [
    { species: "rootwight", min: 6, max: 10, w: 3 },
    { species: "hollowowl", min: 6, max: 10, w: 2 },
    { species: "mothwisp", min: 5, max: 9, w: 2 },
    { species: "sunhart", min: 9, max: 12, w: 1 },
    { species: "briarling", min: 5, max: 8, w: 1 },
  ],
  spawn: { x: 10, y: 20 },
  ground: [
    "......................",
    "......s..,,,,..s......",
    "......s..,,,,..s......",
    "..,,,,....pp....,,,,..",
    "..,,,,....pp....,,,,..",
    "..........pp..........",
    "....,,,,..pp..,,,,....",
    "....,,,,..pp..,,,,....",
    "..........pp..........",
    "..pppppppppppppppp....",
    "..........pp..........",
    "....,,,,..pp..,,,,....",
    "....,,,,..pp..........",
    "..........pp....,,,,..",
    "..........pp....,,,,..",
    "..,,,,....pp..........",
    "..,,,,....pp..........",
    "..........pp..........",
    "..........pp..........",
    "..........pp..........",
    "..........pp..........",
    "......................",
  ],
  objects: [
    tree("w1", 0, 0), tree("w2", 2, 0), tree("w3", 4, 0), tree("w4", 16, 0), tree("w5", 18, 0), tree("w6", 20, 0),
    tree("w7", 0, 4), tree("w8", 20, 4), tree("w9", 0, 8), tree("w10", 18, 8),
    tree("w11", 2, 12), tree("w12", 16, 12), tree("w13", 0, 16), tree("w14", 20, 16),
    tree("w15", 0, 20), tree("w16", 2, 20), tree("w17", 18, 20), tree("w18", 20, 20),
    tree("w19", 8, 6), tree("w20", 12, 14),
    prop("wsign", "sign", 12, 18, "sign_wildwood"),
    { id: "chest_wood", sprite: "crate", x: 18, y: 5, w: 1, h: 1, foot: 1, solid: true, interact: "chest_wood" },
    { id: "cave_mouth", sprite: "boulder", x: 6, y: 1, w: 1, h: 1, foot: 1, solid: false, interact: "enter_cave" },
  ],
  npcs: [],
  warps: [
    { x: 9, y: 21, to: "briar_road", tx: 10, ty: 1 },
    { x: 10, y: 21, to: "briar_road", tx: 10, ty: 1 },
    { x: 11, y: 21, to: "briar_road", tx: 10, ty: 1 },
    { x: 6, y: 1, to: "ashenbarrow", tx: 9, ty: 16 },
    { x: 10, y: 0, to: "thornkeep", tx: 10, ty: 14 },
    { x: 11, y: 0, to: "thornkeep", tx: 10, ty: 14 },
  ],
};

const mirefen: MapDef = {
  id: "mirefen",
  name: "Mirefen",
  region: "Hollowmere",
  battleBg: "marsh",
  encounterRate: 0.15,
  encounters: [
    { species: "bogwallow", min: 6, max: 10, w: 4 },
    { species: "mirewhelp", min: 5, max: 9, w: 2 },
    { species: "fenwitch", min: 9, max: 12, w: 1 },
    { species: "ironnewt", min: 7, max: 10, w: 2 },
  ],
  spawn: { x: 1, y: 9 },
  ground: [
    "....................",
    "..mm....wwww....mm..",
    "..mm....wwww....mm..",
    "........w==w........",
    "..mmmm..w==w..mmmm..",
    "..mmmm..wwww..mmmm..",
    "........wwww........",
    "pppppppp====pppppppp",
    "........wwww........",
    "........w==w........",
    "..mmmm..w==w..mmmm..",
    "..mmmm..wwww..mmmm..",
    "........wwww........",
    "....mm..wwww..mm....",
    "....mm..........mm..",
    "....................",
    "....................",
    "....................",
  ],
  objects: [
    tree("m1", 0, 0), tree("m2", 18, 0), tree("m3", 0, 14), tree("m4", 18, 14),
    prop("msign", "sign", 2, 7, "sign_mire"),
    { id: "chest_mire", sprite: "crate", x: 17, y: 3, w: 1, h: 1, foot: 1, solid: true, interact: "chest_mire" },
    prop("reed1", "shrub", 4, 4),
    prop("reed2", "shrub", 14, 10),
  ],
  npcs: [{ id: "fen_walker", sprite: "traveler", x: 10, y: 14, name: "Reed-cutter", talk: "reedcutter" }],
  warps: [
    { x: 0, y: 7, to: "briar_road", tx: 18, ty: 11 },
    { x: 0, y: 8, to: "briar_road", tx: 18, ty: 11 },
  ],
};

const ashenbarrow: MapDef = {
  id: "ashenbarrow",
  name: "Ashenbarrow",
  region: "Hollowmere",
  battleBg: "cave",
  encounterRate: 0.18,
  encounters: [
    { species: "gravepup", min: 8, max: 12, w: 3 },
    { species: "ironnewt", min: 8, max: 12, w: 3 },
    { species: "pebblet", min: 7, max: 11, w: 2 },
    { species: "chapelite", min: 10, max: 13, w: 1 },
    { species: "keepdrake", min: 12, max: 14, w: 1 },
  ],
  spawn: { x: 9, y: 16 },
  ground: [
    "##################",
    "#ssss##ssss##ssss#",
    "#ssss##ssss##ssss#",
    "#ss#############s#",
    "#ssssssssssssssss#",
    "#ss##ssssss##ssss#",
    "#ss##ssssss##ssss#",
    "#ss##ssssss##ssss#",
    "#ssssssssssssssss#",
    "####ssssssss######",
    "#ssssssssssssssss#",
    "#ss##ssss####ssss#",
    "#ss##ssss####ssss#",
    "#ssssssssssssssss#",
    "#ssssssssssssssss#",
    "#ssssssssssssssss#",
    "#ssssssssssssssss#",
    "##################",
  ],
  objects: [
    { id: "chest_cave", sprite: "crate", x: 15, y: 2, w: 1, h: 1, foot: 1, solid: true, interact: "chest_cave" },
    prop("ore1", "boulder", 4, 6),
    prop("ore2", "boulder", 12, 11),
  ],
  npcs: [],
  warps: [
    { x: 8, y: 16, to: "wildwood", tx: 6, ty: 2 },
    { x: 9, y: 16, to: "wildwood", tx: 6, ty: 2 },
    { x: 10, y: 16, to: "wildwood", tx: 6, ty: 2 },
    { x: 9, y: 1, to: "thornkeep", tx: 4, ty: 8 },
  ],
};

const thornkeep: MapDef = {
  id: "thornkeep",
  name: "Thornkeep",
  region: "Hollowmere",
  battleBg: "grass",
  encounterRate: 0,
  encounters: [],
  spawn: { x: 10, y: 14 },
  ground: [
    "......................",
    "..........cc..........",
    "..........cc..........",
    "....ccc...cc...ccc....",
    "....ccc...cc...ccc....",
    "..........cc..........",
    "....cccccccccccccccc..",
    "..........cc..........",
    "....ccc...cc...ccc....",
    "....ccc...cc..........",
    "..........cc..........",
    "..........cc..........",
    "..........pp..........",
    "..........pp..........",
    "..........pp..........",
    "......................",
  ],
  objects: [
    tree("k1", 0, 0), tree("k2", 2, 0), tree("k3", 18, 0), tree("k4", 20, 0),
    tree("k5", 0, 14), tree("k6", 2, 14), tree("k7", 18, 14), tree("k8", 20, 14),
    house("k_inn", "inn", 4, 2, "enter_keep_inn"),
    house("k_hall", "cottage", 14, 2, "enter_hall"),
    house("k_shop", "shop", 14, 7, "enter_keep_shop"),
    { id: "kshrine", sprite: "shrine", x: 8, y: 7, w: 1, h: 2, foot: 1, solid: true, interact: "shrine" },
    prop("ksign", "sign", 12, 12, "sign_keep"),
  ],
  npcs: [
    { id: "cael", sprite: "warden", x: 11, y: 6, name: "Warden Cael", talk: "cael" },
    { id: "keep_guard", sprite: "guard", x: 10, y: 3, name: "Keep Guard", talk: "keep_guard" },
  ],
  warps: [
    { x: 9, y: 15, to: "wildwood", tx: 10, ty: 1 },
    { x: 10, y: 15, to: "wildwood", tx: 10, ty: 1 },
    { x: 11, y: 15, to: "wildwood", tx: 10, ty: 1 },
  ],
};

const keep_inn = interior("keep_inn", "Thornkeep Inn", 13, 10, 6, "thornkeep", 5, 5, {
  objects: [
    { id: "counter", sprite: "counter", x: 3, y: 3, w: 1, h: 1, foot: 1, solid: true },
    { id: "bed1", sprite: "bed", x: 9, y: 2, w: 1, h: 1, foot: 1, solid: true },
    { id: "hearth", sprite: "hearth", x: 1, y: 4, w: 1, h: 1, foot: 1, solid: true },
  ],
  npcs: [{ id: "keep_innkeep", sprite: "innkeep", x: 4, y: 4, name: "Innmother", talk: "innkeep" }],
});

const keep_shop = interior("keep_shop", "Thornkeep Chandler", 11, 9, 5, "thornkeep", 15, 10, {
  objects: [
    { id: "counter", sprite: "counter", x: 3, y: 3, w: 1, h: 1, foot: 1, solid: true },
    prop("b1", "barrel", 8, 2),
  ],
  npcs: [{ id: "keep_shop", sprite: "shopkeep", x: 4, y: 4, name: "Chandler", talk: "shopkeep" }],
});

const warden_hall: MapDef = {
  id: "warden_hall",
  name: "Warden's Hall",
  region: "Thornkeep",
  battleBg: "keep",
  encounterRate: 0,
  encounters: [],
  spawn: { x: 7, y: 10 },
  ground: [
    "##############",
    "#ffffffffffff#",
    "#ffffffffffff#",
    "#ffffccccffff#",
    "#ffffccccffff#",
    "#ffffccccffff#",
    "#ffffffffffff#",
    "#ffffffffffff#",
    "#ffffffffffff#",
    "#ffffffffffff#",
    "#ffffffffffff#",
    "######pp######",
  ],
  objects: [
    { id: "throne", sprite: "hearth", x: 6, y: 2, w: 1, h: 1, foot: 1, solid: true },
    { id: "b1", sprite: "bookshelf", x: 1, y: 1, w: 1, h: 1, foot: 1, solid: true },
    { id: "b2", sprite: "bookshelf", x: 12, y: 1, w: 1, h: 1, foot: 1, solid: true },
  ],
  npcs: [{ id: "cael_hall", sprite: "warden", x: 7, y: 4, name: "Warden Cael", talk: "cael_trial" }],
  warps: [{ x: 6, y: 11, to: "thornkeep", tx: 15, ty: 5, dir: 0 }, { x: 7, y: 11, to: "thornkeep", tx: 15, ty: 5, dir: 0 }],
};

export const MAPS: Record<string, MapDef> = {
  elderhall,
  grove,
  home,
  inn_in,
  shop_in,
  guild_in,
  briar_road,
  wildwood,
  mirefen,
  ashenbarrow,
  thornkeep,
  keep_inn,
  keep_shop,
  warden_hall,
};

export const BLOCKED = new Set(["#", "w", "x"]);
export const ENCOUNTER_TILES = new Set([",", "m"]);
export const GROUND_TILE: Record<string, string> = {
  ".": "grass",
  ",": "grass",
  p: "dirt",
  c: "cobble",
  w: "water",
  m: "marsh",
  f: "wood",
  s: "cave",
  "#": "wall",
  x: "wood",
  "=": "dirt",
};
