import type { Dir, MapObj } from "../types.ts";

export type InteractionTarget =
	| { kind: "npc"; id: string; name: string; talk: string }
	| { kind: "object"; object: MapObj };

/** Canonical adjacent-tile target resolution shared by confirm and guidance. */
export function selectInteractionTarget(
	npcs: readonly { id: string; name: string; talk: string; x: number; y: number }[],
	objects: readonly MapObj[],
	fx: number,
	fy: number,
	facing: Dir,
): InteractionTarget | undefined {
	const npc = npcs.find((candidate) => candidate.x === fx && candidate.y === fy);
	if (npc) return { kind: "npc", id: npc.id, name: npc.name, talk: npc.talk };
	const object = pickInteractObject(objects, fx, fy, facing);
	return object?.interact ? { kind: "object", object } : undefined;
}

/** Whether a map tile can target this object's interaction (door tiles, etc.). */
export function objectInteractTile(obj: MapObj, fx: number, fy: number): boolean {
  if (obj.interactZone) {
    const z = obj.interactZone;
    return fx >= obj.x + z.x && fx < obj.x + z.x + z.w && fy >= obj.y + z.y && fy < obj.y + z.y + z.h;
  }
  return fx >= obj.x && fx < obj.x + obj.w && fy >= obj.y && fy < obj.y + obj.h;
}

/** Prefer interactive objects when décor shares a tile footprint. */
export function pickInteractObject(
  objects: readonly MapObj[],
  fx: number,
  fy: number,
  facing?: Dir,
): MapObj | undefined {
  const hits = objects.filter((o) => objectInteractTile(o, fx, fy) &&
    (!o.interactDirections || facing === undefined || o.interactDirections.includes(facing)));
  return hits.find((o) => o.interact) ?? hits[0];
}
