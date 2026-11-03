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
