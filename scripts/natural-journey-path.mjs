import { isOccupied } from "../src/game/world/movement.ts";

const dirs = [
  { dx: 0, dy: -1, key: "KeyW" },
  { dx: 0, dy: 1, key: "KeyS" },
  { dx: -1, dy: 0, key: "KeyA" },
  { dx: 1, dy: 0, key: "KeyD" },
];

/** Plan a walking route without crossing unintended warp tiles. */
export function pathFor(map, start, target, starterChosen) {
  const key = (x, y) => `${x},${y}`;
  const todo = [{ ...start, path: [] }];
  const seen = new Set([key(start.x, start.y)]);
  while (todo.length) {
    const point = todo.shift();
    if (point.x === target.x && point.y === target.y) return point.path;
    for (const dir of dirs) {
      const x = point.x + dir.dx;
      const y = point.y + dir.dy;
      if (y < 0 || x < 0 || y >= map.ground.length || x >= map.ground[0].length || seen.has(key(x, y))) continue;
      const warp = map.warps.some((item) => item.x === x && item.y === y);
      if (warp && (x !== target.x || y !== target.y)) continue;
      // Use gameplay collision, including split post footprints on an arch.
      if (!warp && isOccupied(map, { starter: starterChosen }, x, y)) continue;
      seen.add(key(x, y));
      todo.push({ x, y, path: [...point.path, { x, y, key: dir.key, warp }] });
    }
  }
  throw new Error(`No route through ${map.id} to ${key(target.x, target.y)}`);
}
