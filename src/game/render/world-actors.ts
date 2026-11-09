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
  well: { left: 3 / 48, width: 35 / 48, bottom: 33 / 48 },
  shrub: { left: 10 / 48, width: 32 / 48, bottom: 35 / 48 },
  boulder: { left: 7 / 48, width: 30 / 48, bottom: 35 / 48 },
  cottage: { left: 28 / 160, width: 125 / 160, bottom: 158 / 160 },
  inn: { left: 25 / 160, width: 125 / 160, bottom: 158 / 160 },
  shop: { left: 27 / 160, width: 125 / 160, bottom: 158 / 160 },
};

export function paintWorldPropShadow(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const base = PROP_BASE[sprite];
  if (!base) {
    paintWorldActorShadow(ctx, x, y + height - 4, width);
    return;
  }
  paintWorldActorShadow(ctx, x + base.left * width, y + base.bottom * height - 1, base.width * width);
}
