import type { BattleBg } from "../types.ts";
import {
  battlePresentation,
  battleStageMetrics,
  type BattlePresentation,
} from "./battle-viewport.ts";
import {
  FULL_SPRITE_BOUNDS,
  fittedSpriteLocalRect,
  placeSpriteOnGround,
  type SpriteAlphaBounds,
} from "./sprite-bounds.ts";

export type BattleZoneRect = { x: number; y: number; w: number; h: number };

export type BattleLayout = {
  presentation: BattlePresentation;
  /** Stable top of the command dock in canvas pixels (sprites stay above). */
  uiReserveTop: number;
  /** Measured from DOM when available; null when using fallback estimate. */
  uiReserveSource: "dom" | "estimate" | "stable";
  /** Ground contact line shared by both creatures. */
  groundY: number;
  /** Status card bands, player upper-left, foe upper-right. */
  statusPlayer: BattleZoneRect;
  statusFoe: BattleZoneRect;
  foe: {
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
    feetY: number;
    /** Opaque silhouette target height. */
    targetHeight: number;
  };
  player: {
    cx: number;
    cy: number;
    size: number;
    scale: number;
    feetY: number;
    targetHeight: number;
  };
};

const SPRITE_UI_GAP = 10;

/**
 * Reserve line that ignores transient menu height changes (worst-case command band).
 * Sprites anchor to this for the whole encounter.
 */
export function stableBattleUiReserveTop(cw: number, ch: number, _measured?: number | null): number {
  const presentation = battlePresentation(cw, ch);
  return Math.round(ch * battleStageMetrics(presentation).commandTop);
}

function statusZone(
  cw: number,
  ch: number,
  presentation: BattlePresentation,
  side: "player" | "foe",
): BattleZoneRect {
  const metrics = battleStageMetrics(presentation);
  const x = side === "player"
    ? Math.round(cw * metrics.statusSide)
    : Math.round(cw * (1 - metrics.statusSide - metrics.statusWidth));
  return {
    x: Math.max(2, x),
    y: Math.round(ch * metrics.statusTop),
    w: Math.round(cw * metrics.statusWidth),
    h: Math.round(ch * metrics.statusHeight),
  };
}

/**
 * Lay out the battle stage: player lower-left facing right, foe lower-right
 * facing left, both standing on one ground line above a stable command dock.
 * `measuredReserveTop` is accepted for callers that measurably validate the DOM
 * dock; canonical battles use the stable contract.
 */
export function computeBattleLayout(
  cw: number,
  ch: number,
  measuredReserveTop?: number | null,
  options?: { stableReserve?: boolean; presentation?: BattlePresentation },
): BattleLayout {
  const presentation = options?.presentation ?? battlePresentation(cw, ch);
  const metrics = battleStageMetrics(presentation);
  const useMeasured =
    options?.stableReserve === false && measuredReserveTop != null && measuredReserveTop > 32;
  const uiReserveTop = useMeasured
    ? Math.round(Math.min(ch * 0.86, Math.max(ch * 0.38, measuredReserveTop!)))
    : Math.round(ch * metrics.commandTop);
  const uiReserveSource: BattleLayout["uiReserveSource"] = useMeasured
    ? "dom"
    : measuredReserveTop != null && measuredReserveTop > 32
      ? "stable"
      : "estimate";

  const groundY = Math.min(Math.round(ch * metrics.ground), uiReserveTop - 12);
  const playerHeight = Math.round(ch * metrics.playerHeight);
  const foeHeight = Math.round(ch * metrics.foeHeight);
  const playerCx = Math.round(cw * metrics.playerCx);
  const foeCx = Math.round(cw * metrics.foeCx);
  const foeW = Math.round(foeHeight * 1.15);

  return {
    presentation,
    uiReserveTop,
    uiReserveSource,
    groundY,
    statusPlayer: statusZone(cw, ch, presentation, "player"),
    statusFoe: statusZone(cw, ch, presentation, "foe"),
    foe: {
      x: Math.round(foeCx - foeW / 2),
      y: groundY - foeHeight,
      w: foeW,
      h: foeHeight,
      cx: foeCx,
      cy: groundY - foeHeight / 2,
      feetY: groundY,
      targetHeight: foeHeight,
    },
    player: {
      cx: playerCx,
      cy: groundY - playerHeight / 2,
      size: playerHeight,
      scale: 1,
      feetY: groundY,
      targetHeight: playerHeight,
    },
  };
}

/** Compatibility helper: the ground contact of each creature. */
export function spriteFeetY(layout: BattleLayout): { foe: number; player: number } {
  return { foe: layout.foe.feetY, player: layout.player.feetY };
}

export function spritesClearUiBand(layout: BattleLayout, gap = SPRITE_UI_GAP): boolean {
  const feet = spriteFeetY(layout);
  return feet.foe <= layout.uiReserveTop - gap && feet.player <= layout.uiReserveTop - gap;
}

const SUNSET_GRADE: Record<
  BattleBg,
  { sky: string; horizon: string; blend: GlobalCompositeOperation }
> = {
  grass: {
    sky: "rgba(104, 62, 158, 0.86)",
    horizon: "rgba(255, 132, 84, 0.5)",
    blend: "multiply",
  },
  forest: {
    sky: "rgba(255, 140, 120, 0.4)",
    horizon: "rgba(255, 176, 96, 0.3)",
    blend: "soft-light",
  },
  marsh: {
    sky: "rgba(190, 140, 170, 0.4)",
    horizon: "rgba(220, 170, 100, 0.26)",
    blend: "soft-light",
  },
  cave: {
    sky: "rgba(80, 92, 140, 0.26)",
    horizon: "rgba(60, 70, 100, 0.2)",
    blend: "soft-light",
  },
  keep: {
    sky: "rgba(232, 120, 140, 0.46)",
    horizon: "rgba(240, 150, 82, 0.34)",
    blend: "soft-light",
  },
};

/**
 * Draw the battle plate with cover cropping (never stretched), then grade the
 * plate toward the reference's sunset atmosphere. The original asset stays
 * untouched on disk; the grade is presentation only.
 */
export function paintBattleBackdrop(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  layout: BattleLayout,
  bgKey: BattleBg,
  image?: CanvasImageSource | null,
): void {
  if (image) paintCover(ctx, image, cw, ch);
  else {
    ctx.fillStyle = bgKey === "cave" ? "#1b1b26" : "#2c3d32";
    ctx.fillRect(0, 0, cw, ch);
  }

  const grade = SUNSET_GRADE[bgKey] ?? SUNSET_GRADE.grass;
  // The meadow plate is graded with multiply (reference purple dusk); other
  // maps use soft-light so cave/marsh keep their authored mood.
  if (typeof ctx.createLinearGradient === "function") {
    ctx.save();
    ctx.globalCompositeOperation = grade.blend;
    const sky = ctx.createLinearGradient(0, 0, 0, ch * 0.62);
    sky.addColorStop(0, grade.sky);
    sky.addColorStop(0.55, grade.horizon);
    sky.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cw, Math.ceil(ch * 0.63));

    ctx.globalCompositeOperation = "screen";
    const sunX = cw * 0.615;
    const sunY = ch * 0.315;
    if (typeof ctx.createRadialGradient === "function") {
      const glow = ctx.createRadialGradient(sunX, sunY, ch * 0.02, sunX, sunY, ch * 0.46);
      glow.addColorStop(0, "rgba(255, 236, 190, 0.5)");
      glow.addColorStop(0.32, "rgba(255, 196, 130, 0.22)");
      glow.addColorStop(1, "rgba(255, 170, 120, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, cw, Math.ceil(ch * 0.8));
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  // Keep the HUD readable without crushing the sunset: only a light foot
  // vignette and a faint edge darkening.
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0, "rgba(6,10,18,0.05)");
  grad.addColorStop(Math.max(0, layout.groundY / ch - 0.05), "rgba(6,10,18,0.02)");
  grad.addColorStop(1, "rgba(4,10,16,0.16)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  if (typeof ctx.createRadialGradient === "function") {
    const vignette = ctx.createRadialGradient(
      cw * 0.5,
      ch * 0.45,
      Math.min(cw, ch) * 0.34,
      cw * 0.5,
      ch * 0.48,
      Math.max(cw, ch) * 0.72,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.16)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cw, ch);
  }
}

function paintCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  cw: number,
  ch: number,
): void {
  const src = image as { naturalWidth?: number; naturalHeight?: number };
  const sw = src.naturalWidth ?? 0;
  const sh = src.naturalHeight ?? 0;
  if (sw <= 0 || sh <= 0) {
    ctx.drawImage(image, 0, 0, cw, ch);
    return;
  }
  const scale = Math.max(cw / sw, ch / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  // Keep the castle and cottage in view on portrait crops: bias the crop
  // slightly above center rather than cutting the horizon line.
  const focusY = 0.46;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) * focusY;
  ctx.drawImage(image, dx, dy, dw, dh);
}

export type BattleSpritePaint = (
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
) => void;

function paintGroundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  silhouetteWidth: number,
  alpha = 0.3,
): void {
  if (typeof ctx.beginPath !== "function" || typeof ctx.ellipse !== "function") return;
  const rx = Math.max(12, silhouetteWidth * 0.46);
  const ry = Math.max(3, Math.min(10, silhouetteWidth * 0.11));
  ctx.save();
  ctx.fillStyle = `rgba(12,8,10,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, feetY - ry * 0.25, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(12,8,10,${alpha * 0.5})`;
  ctx.beginPath();
  ctx.ellipse(cx, feetY - ry * 0.25, rx * 0.72, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBattleFoeSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | undefined,
  layout: BattleLayout,
  shakeX: number,
  offset: { dx?: number; dy?: number } = {},
  paint?: BattleSpritePaint,
  bounds?: SpriteAlphaBounds,
): void {
  const dx = offset.dx ?? 0;
  const dy = offset.dy ?? 0;
  const opaque = bounds ?? FULL_SPRITE_BOUNDS;
  const src = img as { naturalWidth?: number; naturalHeight?: number };
  const srcW = src?.naturalWidth || layout.foe.w;
  const srcH = src?.naturalHeight || layout.foe.h;
  const anchorX = layout.foe.cx + shakeX + dx;
  const feetY = layout.foe.feetY + dy;
  const placement = placeSpriteOnGround({
    srcW,
    srcH,
    bounds: opaque,
    anchorX,
    feetY,
    targetHeight: layout.foe.targetHeight,
  });
  paintGroundShadow(ctx, placement.centerX, feetY, placement.width);
  if (paint) {
    const local = fittedSpriteLocalRect(srcW, srcH, opaque, layout.foe.targetHeight);
    ctx.save();
    ctx.translate(anchorX, feetY);
    paint(ctx, local.x, local.y, local.w, local.h);
    ctx.restore();
  } else if (img) {
    ctx.drawImage(img, placement.drawX, placement.drawY, placement.drawW, placement.drawH);
  }
}

export function drawBattlePlayerSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | undefined,
  layout: BattleLayout,
  offset: { dx?: number; dy?: number } = {},
  paint?: BattleSpritePaint,
  bounds?: SpriteAlphaBounds,
): void {
  const dx = offset.dx ?? 0;
  const dy = offset.dy ?? 0;
  const opaque = bounds ?? FULL_SPRITE_BOUNDS;
  const src = img as { naturalWidth?: number; naturalHeight?: number };
  const srcW = src?.naturalWidth || layout.player.size;
  const srcH = src?.naturalHeight || layout.player.size;
  const anchorX = layout.player.cx + dx;
  const feetY = layout.player.feetY + dy;
  const placement = placeSpriteOnGround({
    srcW,
    srcH,
    bounds: opaque,
    anchorX,
    feetY,
    targetHeight: layout.player.targetHeight,
    mirror: true,
  });
  paintGroundShadow(ctx, placement.centerX, feetY, placement.width);
  const local = fittedSpriteLocalRect(srcW, srcH, opaque, layout.player.targetHeight);
  ctx.save();
  ctx.translate(anchorX, feetY);
  ctx.scale(-1, 1);
  if (paint) paint(ctx, local.x, local.y, local.w, local.h);
  else if (img) ctx.drawImage(img, local.x, local.y, local.w, local.h);
  ctx.restore();
}
