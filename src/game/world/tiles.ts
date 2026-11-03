/** Terrain symbols shared by maps, movement, and rendering without import cycles. */
export const BLOCKED = new Set(["#", "w", "x"]);
export const ENCOUNTER_TILES = new Set([",", "m", "s"]);
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
