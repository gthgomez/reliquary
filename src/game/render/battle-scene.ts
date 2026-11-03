import type { BattleBg } from "../types.ts";

export type BattleLayout = {
  /** Top of reserved UI band in canvas pixels (sprites must stay above). */
  uiReserveTop: number;
  /** Measured from DOM when available; null when using fallback estimate. */
  uiReserveSource: "dom" | "estimate";
  foe: { x: number; y: number; w: number; h: number };
  player: { cx: number; cy: number; size: number; scale: number };
};

const SPRITE_UI_GAP = 10;

function fallbackReserveTop(ch: number): number {
  const short = ch < 320;
  return Math.round(ch * (short ? 0.52 : 0.48));
}

/**
 * Lay out battle sprites below the UI band.
 * Pass `measuredReserveTop` from {@link measureBattleUiReserveCanvas} when available.
 */
export function computeBattleLayout(
  cw: number,
  ch: number,
  measuredReserveTop?: number | null,
): BattleLayout {
  const short = ch < 320;
  const landscape = cw > ch;
  const uiReserveTop =
    measuredReserveTop != null && measuredReserveTop > 32
      ? Math.round(measuredReserveTop)
      : fallbackReserveTop(ch);
  const uiReserveSource = measuredReserveTop != null && measuredReserveTop > 32 ? "dom" : "estimate";

  const maxFoeH = Math.max(64, uiReserveTop - SPRITE_UI_GAP - 8);
  const foeW = Math.min(landscape ? 108 : short ? 96 : 120, Math.max(72, Math.round(cw * 0.3)));
  const foeH = Math.min(foeW, maxFoeH);
  const foeX = Math.round(cw * (landscape ? 0.56 : 0.5) - foeW * 0.42);
  const foeY = Math.max(4, uiReserveTop - foeH - SPRITE_UI_GAP);

  const playerSize = Math.min(landscape ? 100 : 112, Math.round(cw * 0.28));
  const playerScale = short ? 0.62 : landscape ? 0.66 : 0.7;
  const playerHalf = (playerSize * playerScale) / 2;
  const playerCx = Math.round(cw * (landscape ? 0.2 : 0.22));
  const playerCy = Math.min(
    Math.round(uiReserveTop - playerHalf - SPRITE_UI_GAP),
    Math.round(ch * (landscape ? 0.38 : 0.36)),
  );

  return {
    uiReserveTop,
    uiReserveSource,
    foe: { x: foeX, y: foeY, w: foeW, h: foeH },
    player: { cx: playerCx, cy: playerCy, size: playerSize, scale: playerScale },
  };
}

export function spriteFeetY(layout: BattleLayout): { foe: number; player: number } {
  const playerHalf = (layout.player.size * layout.player.scale) / 2;
  return {
    foe: layout.foe.y + layout.foe.h,
    player: layout.player.cy + playerHalf * 0.55,
  };
}

export function spritesClearUiBand(layout: BattleLayout, gap = SPRITE_UI_GAP): boolean {
  const feet = spriteFeetY(layout);
  return feet.foe <= layout.uiReserveTop - gap && feet.player <= layout.uiReserveTop - gap;
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
  grad.addColorStop(0, "rgba(8,6,5,0.06)");
  grad.addColorStop(Math.max(0, floorY / ch - 0.04), "rgba(8,6,5,0.02)");
  grad.addColorStop(Math.min(1, floorY / ch), "rgba(8,6,5,0.32)");
  grad.addColorStop(1, "rgba(8,6,5,0.58)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  const horizon = Math.round(floorY * 0.94);
  ctx.fillStyle =
    bgKey === "cave" ? "rgba(12,10,14,0.42)" : bgKey === "marsh" ? "rgba(28,36,32,0.32)" : "rgba(24,32,22,0.26)";
  ctx.fillRect(0, horizon, cw, Math.max(8, ch - horizon));

  if (typeof ctx.createRadialGradient === "function") {
    const vignette = ctx.createRadialGradient(
      cw * 0.5,
      ch * 0.32,
      Math.min(cw, ch) * 0.22,
      cw * 0.5,
      ch * 0.38,
      Math.max(cw, ch) * 0.7,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cw, ch);
  }
}

function paintBattleGroundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  width: number,
  alpha = 0.34,
): void {
  if (typeof ctx.beginPath !== "function" || typeof ctx.ellipse !== "function") return;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, width * 0.42, width * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintFoeContrastStage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (typeof ctx.createRadialGradient !== "function" || typeof ctx.ellipse !== "function") return;
  const cx = x + w / 2;
  const cy = y + h * 0.48;
  const g = ctx.createRadialGradient(cx, cy, w * 0.08, cx, cy, w * 0.62);
  g.addColorStop(0, "rgba(12,10,14,0.62)");
  g.addColorStop(0.55, "rgba(12,10,14,0.38)");
  g.addColorStop(1, "rgba(12,10,14,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.08, w * 0.52, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintPlayerSilhouettePlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  if (typeof ctx.createRadialGradient !== "function" || typeof ctx.arc !== "function") return;
  const g = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius);
  g.addColorStop(0, "rgba(255,248,235,0.2)");
  g.addColorStop(0.55, "rgba(255,248,235,0.07)");
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
  const baseY = y + h - 4;
  paintFoeContrastStage(ctx, x + shakeX, y, w, h);
  paintBattleGroundShadow(ctx, cx, baseY, w, 0.42);
  ctx.drawImage(img, x + shakeX, y, w, h);
}

export function drawBattlePlayerSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  layout: BattleLayout,
): void {
  const { cx, cy, size, scale } = layout.player;
  const half = size / 2;
  paintBattleGroundShadow(ctx, cx, cy + half * scale * 0.55, size * scale, 0.32);
  paintPlayerSilhouettePlate(ctx, cx, cy, half * scale * 0.92);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(-scale, scale);
  ctx.drawImage(img, -half, -half, size, size);
  ctx.restore();
}
