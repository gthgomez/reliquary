import type { MapObj } from "../types.ts";

/** Grounding shadow for overworld sprites (player, NPCs, tall props). */

export const PLAYER_WIDTH_TILES = 5 / 6;
export const PLAYER_HEIGHT_TILES = 1.25;

/** The visible actor footprint shares one ground anchor across draw, mask and camera math. */
export function resolvePlayerDrawFootprint(px: number, py: number, tileSize: number): DrawFootprint {
  const width = tileSize * PLAYER_WIDTH_TILES;
  const height = tileSize * PLAYER_HEIGHT_TILES;
  return { x: px + (tileSize - width) / 2, y: py + tileSize - height, width, height, baseline: py + tileSize };
}

export function resolvePlayerScreenFootprint(
  px: number, py: number, tileSize: number, cameraX: number, cameraY: number,
): DrawFootprint {
  const world = resolvePlayerDrawFootprint(px, py, tileSize);
  return { ...world, x: world.x - cameraX, y: world.y - cameraY, baseline: world.baseline - cameraY };
}

export function playerHeadCanvasYForCamera(
  px: number, py: number, tileSize: number, cameraX: number, cameraY: number,
): number {
  return resolvePlayerScreenFootprint(px, py, tileSize, cameraX, cameraY).y;
}

export const GATE_ACTOR_TINT_ALPHA = 0.46;
export const GATE_ACTOR_OVERLAY_ALPHA = 0.8;

/** Pixel result of the post mask's cream tint followed by its translucent overlay. */
export function compositeGateActorCueColor(
  actor: readonly [number, number, number], post: readonly [number, number, number],
): [number, number, number] {
  const tint: readonly [number, number, number] = [255, 244, 198];
  return [0, 1, 2].map((channel) => {
    const tintedActor = actor[channel]! * (1 - GATE_ACTOR_TINT_ALPHA) + tint[channel]! * GATE_ACTOR_TINT_ALPHA;
    return tintedActor * GATE_ACTOR_OVERLAY_ALPHA + post[channel]! * (1 - GATE_ACTOR_OVERLAY_ALPHA);
  }) as [number, number, number];
}

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
  "elderhall-guild-reference": { left: 20 / 160, width: 120 / 160, bottom: 156 / 160 },
  "elderhall-shop-reference": { left: 20 / 160, width: 120 / 160, bottom: 156 / 160 },
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
type DrawRect = { x: number; y: number; width: number; height: number };

export function compareWorldDepth(a: { y: number; priority: number; id: string }, b: { y: number; priority: number; id: string }): number {
  return a.y - b.y || a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Grounded walls, trunks and low props stay opaque; only their overhang can reveal an actor. */
const OVERHANG_BOTTOM: Record<string, number> = {
  "elderhall-tree-reference": 0.8, "elderhall-well-reference": 0.48,
  "elderhall-cottage-reference": 0.56, "elderhall-guild-reference": 0.56,
  "elderhall-shop-reference": 0.56, tree: 0.62, well: 0.48,
  cottage: 0.56, inn: 0.56, shop: 0.56,
};

export function worldPropOverhang(sprite: string, visual: DrawFootprint): DrawFootprint | null {
  const fraction = OVERHANG_BOTTOM[sprite];
  return fraction === undefined ? null : { ...visual, height: visual.height * fraction };
}

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

const fadeBuffers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** Tint only the actor pixels actually hidden by a post; leave its base opaque. */
export function paintActorBehindPost(
  ctx: CanvasRenderingContext2D, image: CanvasImageSource, postImage: CanvasImageSource,
  post: DrawRect, player: DrawRect, revealBottom: number, source: DrawRect,
): void {
  let buffer = fadeBuffers.get(ctx.canvas);
  if (!buffer) {
    buffer = ctx.canvas.ownerDocument.createElement("canvas");
    fadeBuffers.set(ctx.canvas, buffer);
  }
  const width = Math.max(1, Math.ceil(post.width));
  const height = Math.max(1, Math.ceil(post.height));
  if (buffer.width !== width) buffer.width = width;
  if (buffer.height !== height) buffer.height = height;
  const mask = buffer.getContext("2d");
  if (!mask) return;
  const scaleX = width / post.width;
  const scaleY = height / post.height;
  mask.clearRect(0, 0, width, height);
  mask.save();
  mask.imageSmoothingEnabled = false;
  mask.beginPath();
  mask.rect(0, 0, width, Math.max(0, (revealBottom - post.y) * scaleY));
  mask.clip();
  mask.drawImage(image, (player.x - post.x) * scaleX, (player.y - post.y) * scaleY,
    player.width * scaleX, player.height * scaleY);
  mask.globalCompositeOperation = "destination-in";
  mask.drawImage(postImage, source.x, source.y, source.width, source.height, 0, 0, width, height);
  mask.globalCompositeOperation = "source-atop";
  mask.fillStyle = `rgba(255, 244, 198, ${GATE_ACTOR_TINT_ALPHA})`;
  mask.fillRect(0, 0, width, height);
  mask.restore();
  ctx.save();
  ctx.globalAlpha *= GATE_ACTOR_OVERLAY_ALPHA;
  ctx.drawImage(buffer, post.x, post.y, post.width, post.height);
  ctx.restore();
}

/** Feather a small reveal in the overhang only, leaving the feet and ground contact opaque. */
export function paintPropWithLocalFade(
  ctx: CanvasRenderingContext2D, image: CanvasImageSource, prop: DrawRect, player: DrawRect,
  overlapAlpha: number, fadeBottom: number, source?: DrawRect, canopy?: "elderhall-tree",
): void {
  let buffer = fadeBuffers.get(ctx.canvas);
  if (!buffer) {
    buffer = ctx.canvas.ownerDocument.createElement("canvas");
    fadeBuffers.set(ctx.canvas, buffer);
  }
  const width = Math.max(1, Math.ceil(prop.width));
  const height = Math.max(1, Math.ceil(prop.height));
  if (buffer.width !== width) buffer.width = width;
  if (buffer.height !== height) buffer.height = height;
  const mask = buffer.getContext("2d");
  if (!mask) {
    if (source) ctx.drawImage(image, source.x, source.y, source.width, source.height, prop.x, prop.y, prop.width, prop.height);
    else ctx.drawImage(image, prop.x, prop.y, prop.width, prop.height);
    return;
  }
  mask.clearRect(0, 0, buffer.width, buffer.height);
  mask.imageSmoothingEnabled = false;
  if (source) mask.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, buffer.width, buffer.height);
  else mask.drawImage(image, 0, 0, buffer.width, buffer.height);
  const scaleX = buffer.width / prop.width;
  const scaleY = buffer.height / prop.height;
  const bottom = Math.min(fadeBottom, player.y + player.height - 6);
  mask.save();
  mask.beginPath();
  mask.rect(0, 0, buffer.width, Math.max(0, (bottom - prop.y) * scaleY));
  mask.clip();
  if (canopy === "elderhall-tree") {
    // The outer leaves extend lower than the center of the canopy. Exclude
    // the central trunk as the reveal follows those leaves downward.
    mask.beginPath();
    mask.moveTo(0, 0);
    mask.lineTo(buffer.width, 0);
    mask.lineTo(buffer.width, buffer.height * 0.8);
    mask.lineTo(buffer.width * 0.72, buffer.height * 0.8);
    mask.lineTo(buffer.width * 0.68, buffer.height * 0.62);
    mask.lineTo(buffer.width * 0.32, buffer.height * 0.62);
    mask.lineTo(buffer.width * 0.28, buffer.height * 0.8);
    mask.lineTo(0, buffer.height * 0.8);
    mask.closePath();
    mask.clip();
  }
  mask.globalCompositeOperation = "destination-out";
  mask.translate((player.x + player.width / 2 - prop.x) * scaleX, (player.y + player.height * 0.43 - prop.y) * scaleY);
  mask.scale(player.width * 0.8 * scaleX, player.height * 0.58 * scaleY);
  const feather = mask.createRadialGradient(0, 0, 0.15, 0, 0, 1);
  feather.addColorStop(0, `rgba(0,0,0,${1 - overlapAlpha})`);
  feather.addColorStop(0.45, `rgba(0,0,0,${1 - overlapAlpha})`);
  feather.addColorStop(1, "rgba(0,0,0,0)");
  mask.fillStyle = feather;
  mask.fillRect(-1, -1, 2, 2);
  mask.restore();
  ctx.drawImage(buffer, prop.x, prop.y, prop.width, prop.height);
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
  if (["cottage", "inn", "shop", "elderhall-cottage-reference", "elderhall-guild-reference", "elderhall-shop-reference"].includes(sprite)) {
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
