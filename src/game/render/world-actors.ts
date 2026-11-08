import type { MapObj } from "../types.ts";

/** Grounding shadow for overworld sprites (player, NPCs, tall props). */

export function paintWorldActorShadow(
  ctx: CanvasRenderingContext2D,
  footX: number,
  footY: number,
  width: number,
): void {
  if (typeof ctx.beginPath !== "function" || typeof ctx.ellipse !== "function") return;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(footX + width * 0.5, footY, width * 0.38, Math.max(3, width * 0.08), 0, 0, Math.PI * 2);
  ctx.fill();
}

// Fractions of the shipped sprite canvas occupied by visible pixels near the
// base. Several props have transparent bottom/side margins, so the image box
// itself is not their point of contact with the ground.
const PROP_BASE: Record<string, { left: number; width: number; bottom: number }> = {
  "elderhall-bench": { left: 16 / 96, width: 64 / 96, bottom: 43 / 48 },
  "elderhall-well-reference": { left: 27 / 128, width: 74 / 128, bottom: 156 / 160 },
  "elderhall-cottage-reference": { left: 20 / 160, width: 120 / 160, bottom: 156 / 160 },
  "elderhall-tree-reference": { left: 55 / 160, width: 50 / 160, bottom: 140 / 144 },
  tree: { left: 44 / 128, width: 40 / 128, bottom: 115 / 128 },
  well: { left: 3 / 48, width: 35 / 48, bottom: 33 / 48 },
  shrub: { left: 10 / 48, width: 32 / 48, bottom: 35 / 48 },
  boulder: { left: 7 / 48, width: 30 / 48, bottom: 35 / 48 },
  cottage: { left: 28 / 160, width: 125 / 160, bottom: 158 / 160 },
  inn: { left: 25 / 160, width: 125 / 160, bottom: 158 / 160 },
  shop: { left: 27 / 160, width: 125 / 160, bottom: 158 / 160 },
};

/** Resolve source-art placement independently of collision and interaction geometry. */
export function resolveWorldPropLayout(obj: MapObj, tileSize: number): {
  x: number; y: number; width: number; height: number; baseline: number;
} {
  const visual = obj.visual;
  const width = (visual?.width ?? obj.w) * tileSize;
  const height = (visual?.height ?? obj.h) * tileSize;
  const anchorX = visual?.anchorX ?? 0.5;
  const anchorY = visual?.anchorY ?? PROP_BASE[obj.sprite]?.bottom ?? 1;
  const groundX = (obj.x + (visual?.groundX ?? obj.w / 2)) * tileSize;
  const baseline = (obj.y + (visual?.groundY ?? obj.h)) * tileSize;
  return { x: groundX - width * anchorX, y: baseline - height * anchorY, width, height, baseline };
}

type DrawFootprint = { x: number; y: number; width: number; height: number; baseline: number };

/** Keep both visible artwork and logical fallback footprints within culling bounds. */
export function worldPropCullBounds(obj: MapObj, visual: DrawFootprint, tileSize: number): { left: number; top: number; right: number; bottom: number } {
  return { left: Math.min(visual.x, obj.x * tileSize), top: Math.min(visual.y, obj.y * tileSize),
    right: Math.max(visual.x + visual.width, (obj.x + obj.w) * tileSize), bottom: Math.max(visual.y + visual.height, (obj.y + obj.h) * tileSize) };
}

/** Fade foreground art whenever its image bounds cover the player's body. */
export function shouldFadePropForPlayer(prop: DrawFootprint, player: DrawFootprint): boolean {
  return prop.baseline > player.baseline && prop.x < player.x + player.width && prop.x + prop.width > player.x &&
    prop.y < player.y + player.height && prop.y + prop.height > player.y;
}

export function paintWorldPropShadow(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (sprite === "elderhall-gate-reference") return; // separate stone posts; no large oval under the opening
  const base = PROP_BASE[sprite];
  if (!base) {
    paintWorldActorShadow(ctx, x, y + height - 4, width);
    return;
  }
  if (["cottage", "inn", "shop", "elderhall-cottage-reference"].includes(sprite)) {
    if (typeof ctx.beginPath !== "function" || typeof ctx.ellipse !== "function") return;
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(x + (base.left + base.width / 2) * width, y + base.bottom * height - 1,
      base.width * width * 0.38, Math.max(1, width * 0.02), 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  paintWorldActorShadow(ctx, x + base.left * width, y + base.bottom * height - 1, base.width * width);
}
