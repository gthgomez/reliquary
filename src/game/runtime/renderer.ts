import { GROUND_TILE } from "../maps.ts";
import { SPECIES } from "../content.ts";
import { DIRS } from "../world/movement.ts";
import type { BattleState, Beast, Dir, MapDef } from "../types.ts";

export const TILE = 32;

export type WorldView = {
  ctx: CanvasRenderingContext2D;
  map: MapDef;
  images: Record<string, HTMLImageElement>;
  flags: Record<string, boolean>;
  px: number;
  py: number;
  dir: Dir;
  moving: boolean;
  walkFrame: number;
  viewW: number;
  viewH: number;
  cw: number;
  ch: number;
};

export function drawWorld(v: WorldView): void {
  const { ctx, map: m, images, flags, px, py, dir, moving, walkFrame, viewW, viewH, cw, ch } = v;
  const mw = m.ground[0]?.length ?? 0;
  const mh = m.ground.length;
  const camX = Math.max(0, Math.min(px - (viewW / 2 - 0.5) * TILE, Math.max(0, mw * TILE - cw)));
  const camY = Math.max(0, Math.min(py - (viewH / 2 - 0.5) * TILE, Math.max(0, mh * TILE - ch)));
  const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const x1 = Math.min(mw, x0 + viewW + 3);
  const y1 = Math.min(mh, y0 + viewH + 3);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const g = m.ground[y]![x]!;
    const tileName = GROUND_TILE[g] ?? "grass";
    const img = images[`tile_${tileName}`];
    const dx = Math.floor(x * TILE - camX);
    const dy = Math.floor(y * TILE - camY);
    if (img) ctx.drawImage(img, dx, dy, TILE, TILE);
    else {
      ctx.fillStyle = tileName === "water" ? "#3d6e8a" : tileName === "wall" ? "#3a342e" : "#3d4a38";
      ctx.fillRect(dx, dy, TILE, TILE);
    }
    if (g === ",") {
      const tg = images.prop_tallgrass;
      if (tg) ctx.drawImage(tg, dx, dy, TILE, TILE);
      else {
        ctx.fillStyle = "rgba(40,70,40,0.35)";
        ctx.fillRect(dx, dy, TILE, TILE);
      }
    }
  }
  const list: { y: number; draw: () => void }[] = [];
  for (const o of m.objects) {
    if (flags.starter && o.id.startsWith("st_")) continue;
    list.push({
      y: (o.y + o.h) * TILE,
      draw: () => {
        const img = images[`prop_${o.sprite}`] || images[`sprite_${o.sprite}`] || images[`npc_${o.sprite}`];
        const dx = o.x * TILE - camX;
        const dy = o.y * TILE - camY;
        const dw = o.w * TILE;
        const dh = o.h * TILE;
        if (img) ctx.drawImage(img, dx, dy, dw, dh);
      }
    });
  }
  for (const n of m.npcs) list.push({
    y: (n.y + 1) * TILE,
    draw: () => {
      const img = images[`npc_${n.sprite}`];
      const dx = n.x * TILE - camX;
      const dw = TILE;
      const dh = TILE * 1.25;
      const dy = n.y * TILE + TILE - dh - camY;
      if (img) ctx.drawImage(img, dx, dy, dw, dh);
    }
  });
  list.push({
    y: py + TILE,
    draw: () => {
      const frame = moving ? walkFrame : 0;
      const key = `player_${DIRS[dir].name}${frame}`;
      const img = images[key] || images.player_down0;
      const dx = px - camX;
      const dw = TILE;
      const dh = TILE * 1.5;
      const dy = py + TILE - dh - camY;
      if (img) ctx.drawImage(img, dx, dy, dw, dh);
      else {
        ctx.fillStyle = "#c4a574";
        ctx.fillRect(dx + 8, dy + 8, 16, 20);
      }
    }
  });
  list.sort((a, b) => a.y - b.y);
  for (const s of list) s.draw();
}

export type BattleView = {
  ctx: CanvasRenderingContext2D;
  battle: BattleState;
  party: Beast[];
  images: Record<string, HTMLImageElement>;
  cw: number;
  ch: number;
};

export function drawBattle(v: BattleView): void {
  const { ctx, battle: b, party, images, cw, ch } = v;
  const bg = images[`bg_${b.bg}`] || images.bg_grass;
  if (bg) ctx.drawImage(bg, 0, 0, cw, ch);
  else {
    ctx.fillStyle = "#2c3d32";
    ctx.fillRect(0, 0, cw, ch);
  }
  const foe = b.foes[b.foeIndex]!;
  if (foe && foe.hp > 0) {
    const img = images[`sprite_${foe.speciesId}`];
    const shake = b.phase === "catch" ? Math.sin(b.shake * 8) * 6 : 0;
    if (img) ctx.drawImage(img, cw / 2 - 56 + shake, 18, 120, 120);
  }
  const me = party[b.playerIndex]!;
  if (me) {
    const img = images[`sprite_${me.speciesId}`];
    if (img) {
      ctx.save();
      ctx.translate(cw * 0.23, ch - 70);
      ctx.scale(-.7, .7);
      ctx.drawImage(img, -60, -60, 120, 120);
      ctx.restore();
    }
  }
}

export function collectPaths(): [string, string][] {
  const out: [string, string][] = [];
  for (const t of [
    "grass",
    "dirt",
    "water",
    "cobble",
    "wood",
    "cave",
    "marsh",
    "wall"
  ]) out.push([`tile_${t}`, `/game/tiles/${t}.png`]);
  for (const d of [
    "down",
    "left",
    "right",
    "up"
  ]) for (let i = 0; i < 4; i++) out.push([`player_${d}${i}`, `/game/sprites/player/${d}${i}.png?v=4`]);
  for (const id of Object.keys(SPECIES)) out.push([`sprite_${id}`, `/game/sprites/${id}.png`]);
  for (const n of [
    "elder",
    "innkeep",
    "shopkeep",
    "warden",
    "guard",
    "traveler"
  ]) out.push([`npc_${n}`, `/game/sprites/npc/${n}.png`]);
  for (const p of [
    "tree",
    "cottage",
    "inn",
    "shop",
    "shrine",
    "sign",
    "barrel",
    "crate",
    "shrub",
    "boulder",
    "fence",
    "tallgrass",
    "pot",
    "well",
    "bed",
    "table",
    "chair",
    "bookshelf",
    "hearth",
    "counter"
  ]) out.push([`prop_${p}`, `/game/props/${p}.png`]);
  for (const bg of [
    "grass",
    "forest",
    "cave",
    "marsh",
    "keep"
  ]) out.push([`bg_${bg}`, `/game/bg/bg_${bg}.jpg`]);
  out.push(["bg_title", "/game/bg/title.jpg"]);
  out.push(["ui_panel", "/game/ui/panel.png"]);
  return out;
}
