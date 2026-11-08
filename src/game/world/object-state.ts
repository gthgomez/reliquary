import type { MapObj } from "../types.ts";

/** Objects hidden after story flags (boss removed, chest opened, etc.). */
const HIDE_WHEN_FLAG: Record<string, string> = {
  slime_king_statue: "defeated_slime_king",
  goblin_king_npc: "defeated_goblin_king",
};

const OPEN_CHEST_PREFIX = "chest_";

export function objectHidden(obj: MapObj, flags: Record<string, boolean>): boolean {
  const hideFlag = HIDE_WHEN_FLAG[obj.id];
  if (hideFlag && flags[hideFlag]) return true;
  if (obj.interact?.startsWith(OPEN_CHEST_PREFIX) && flags[obj.interact]) return true;
  return false;
}

export function isObjectSolidAt(obj: MapObj, flags: Record<string, boolean>, x: number, y: number): boolean {
  if (!obj.solid || objectHidden(obj, flags)) return false;
  if (obj.collision) return obj.collision.some((box) => x >= obj.x + box.x && x < obj.x + box.x + box.w && y >= obj.y + box.y && y < obj.y + box.y + box.h);
  const fy = obj.y + obj.h - obj.foot;
  return x >= obj.x && x < obj.x + obj.w && y >= fy && y < obj.y + obj.h;
}

export function visibleObjects(objects: MapObj[], flags: Record<string, boolean>): MapObj[] {
  return objects.filter((o) => !objectHidden(o, flags));
}
