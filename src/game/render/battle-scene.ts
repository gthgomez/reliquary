import type { BattleBg } from "../types.ts";

export type BattleLayout = {
  /** Canvas band reserved for HUD cards, log and commands (CSS battle-controls). */
  uiReserveTop: number;
  foe: { x: number; y: number; w: number; h: number };
  player: { cx: number; cy: number; size: number; scale: number };
};

export function computeBattleLayout(cw: number, ch: number): BattleLayout {
  const short = ch < 320;
  const uiReserveTop = Math.round(ch * (short ? 0.5 : 0.44));
  const foeW = Math.min(short ? 96 : 128, Math.max(72, Math.round(cw * 0.3)));
  const foeH = Math.min(foeW, Math.max(72, uiReserveTop - 16));
  const foeX = Math.round(cw * 0.5 - foeW * 0.35);
  const foeY = Math.max(4, Math.min(12, uiReserveTop - foeH - 8));
  const playerSize = Math.min(112, Math.round(cw * 0.28));
  const playerCx = Math.round(cw * 0.22);
  const playerCy = Math.min(Math.round(ch * 0.34), uiReserveTop - Math.round(playerSize * 0.62));
  return {
    uiReserveTop,
    foe: { x: foeX, y: foeY, w: foeW, h: foeH },
    player: { cx: playerCx, cy: playerCy, size: playerSize, scale: short ? 0.65 : 0.72 },
  };
}

export function paintBattleBackdrop(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  layout: BattleLayout,
  bgKey: BattleBg,
): void {
  const floorY = layout.uiReserveTop;
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, "rgba(8,6,5,0.08)");
  grad.addColorStop(floorY / ch, "rgba(8,6,5,0.02)");
  grad.addColorStop(Math.min(1, (floorY + 24) / ch), "rgba(8,6,5,0.35)");
  grad.addColorStop(1, "rgba(8,6,5,0.62)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  const horizon = Math.round(floorY * 0.92);
  ctx.fillStyle =
    bgKey === "cave" ? "rgba(12,10,14,0.45)" : bgKey === "marsh" ? "rgba(28,36,32,0.35)" : "rgba(24,32,22,0.28)";
  ctx.fillRect(0, horizon, cw, Math.max(8, ch - horizon));

  const vignette = ctx.createRadialGradient(cw * 0.5, ch * 0.35, Math.min(cw, ch) * 0.25, cw * 0.5, ch * 0.4, Math.max(cw, ch) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cw, ch);
}

export function paintBattleGroundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  width: number,
): void {
  if (typeof ctx.beginPath !== "function" || typeof ctx.ellipse !== "function") return;
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(cx, baseY, width * 0.42, width * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function paintBattleSilhouettePlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  if (typeof ctx.createRadialGradient !== "function" || typeof ctx.arc !== "function") return;
  const g = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
  g.addColorStop(0, "rgba(255,248,235,0.22)");
  g.addColorStop(0.55, "rgba(255,248,235,0.08)");
  g.addColorStop(1, "rgba(255,248,235,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBattleFoeSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  layout: BattleLayout,
  shakeX: number,
): void {
  const { x, y, w, h } = layout.foe;
  const cx = x + w / 2 + shakeX;
  const baseY = y + h - 6;
  paintBattleGroundShadow(ctx, cx, baseY, w);
  paintBattleSilhouettePlate(ctx, cx, y + h * 0.45, w * 0.55);
  ctx.drawImage(img, x + shakeX, y, w, h);
}

export function drawBattlePlayerSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  layout: BattleLayout,
): void {
  const { cx, cy, size, scale } = layout.player;
  const half = size / 2;
  paintBattleGroundShadow(ctx, cx, cy + half * scale * 0.55, size * scale);
  paintBattleSilhouettePlate(ctx, cx, cy, half * scale * 0.95);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(-scale, scale);
  ctx.drawImage(img, -half, -half, size, size);
  ctx.restore();
}
