/** Room materials and furnishings are painted behind the map's actors and collision. */
const ROOM_MATERIALS = {
  home: { use: "cottage", floor: "#967653", joint: "#553d2d", wall: "#665244", trim: "#b98d5c" },
  inn_in: { use: "inn", floor: "#96704b", joint: "#543e2d", wall: "#614847", trim: "#bc925e" },
  shop_in: { use: "shop", floor: "#907052", joint: "#564535", wall: "#4b5860", trim: "#b89c72" },
  guild_in: { use: "guild", floor: "#81705f", joint: "#51463a", wall: "#52514f", trim: "#ac9058" },
  keep_inn: { use: "inn", floor: "#87684f", joint: "#49392d", wall: "#55464e", trim: "#a88660" },
  keep_shop: { use: "shop", floor: "#806b53", joint: "#504336", wall: "#465358", trim: "#a28963" },
} as const;

export type InteriorRoomId = keyof typeof ROOM_MATERIALS;
export function isInteriorRoom(id: string): id is InteriorRoomId {
  return Object.hasOwn(ROOM_MATERIALS, id);
}

export function paintInteriorRoom(
  ctx: CanvasRenderingContext2D, id: InteriorRoomId, width: number, height: number, doorX: number, tile: number,
): void {
  const materials = ROOM_MATERIALS[id];
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * tile), Math.round(y * tile), Math.round(w * tile), Math.round(h * tile));
  };

  // A plank floor under the walkable area, with staggered joints and grain.
  rect(0, 0, width, height, "#211d1b");
  rect(1, 1, width - 2, height - 2, materials.floor);
  for (let row = 3; row < (height - 1) * 3; row += 1) {
    const y = row / 3;
    rect(1, y, width - 2, 0.04, materials.joint);
    rect(1, y + 0.04, width - 2, 0.035, "#ffffff1a");
    for (let x = 1.6 + ((row * 7) % 13) / 8; x < width - 1; x += 2) {
      rect(x, y + 0.035, 0.045, 0.28, materials.joint);
      rect(x + 0.15, y + 0.17, 0.42, 0.035, "#35271726");
      rect(x + 0.65, y + 0.23, 0.41, 0.035, "#fbc58924");
    }
  }

  // Side and rear walls have a visible face, cap and floor shadow.
  rect(0.46, 0.35, width - 0.92, 0.79, materials.wall);
  rect(0.46, 0.35, width - 0.92, 0.09, materials.trim);
  for (let x = 0.66; x < width - 0.66; x += 1.92) {
    rect(x, 0.43, 0.11, 0.66, "#312823");
    rect(x + 0.11, 0.5, 0.04, 0.53, "#e1ae7429");
  }
  for (const x of [0.48, width - 0.87]) {
    rect(x, 0.45, 0.39, height - 1, materials.wall);
    rect(x + 0.06, 0.55, 0.065, height - 1.18, materials.trim);
  }
  rect(0.89, 1.05, width - 1.78, 0.15, "#372c25");
  rect(1, 1.2, width - 2, 0.33, "#1d181a43");
  rect(0.46, height - 0.87, doorX - 0.46, 0.35, materials.wall);
  rect(doorX + 1, height - 0.87, width - doorX - 1.46, 0.35, materials.wall);
  rect(doorX, height - 1, 1, 0.85, "#35271f");
  rect(doorX + 0.09, height - 0.9, 0.82, 0.56, "#71523d");
  rect(doorX + 0.09, height - 0.58, 0.82, 0.14, materials.trim);
  rect(doorX - 0.15, height - 0.95, 0.15, 0.62, "#4c3628");
  rect(doorX + 1, height - 0.95, 0.15, 0.62, "#4c3628");

  function rug(x: number, y: number, w: number, h: number, field: string, edge: string) {
    rect(x, y + 0.07, w, h, "#2f232b59");
    rect(x, y, w, h, edge);
    rect(x + 0.07, y + 0.07, w - 0.14, h - 0.14, field);
    for (let n = 0.17; n < w - 0.12; n += 0.25) {
      rect(x + n, y + 0.11, 0.075, 0.055, edge);
      rect(x + n, y + h - 0.16, 0.075, 0.055, edge);
    }
  }

  if (materials.use === "inn") {
    rug(2.3, 3.02, 2.7, 1.9, "#70453f", "#b29061");
    rug(4.4, 4.4, 2.7, 2.04, "#815449", "#c09b61");
    rug(8.35, 1.48, 2.5, 4.65, "#53494b", "#a38159");
    // Iron rack and warm chimney rise behind the hearth against the west wall.
    rect(0.86, 2.35, 0.7, 1.86, "#554844");
    for (let y = 2.45; y < 4; y += 0.25) rect(0.9, y, 0.62, 0.04, "#80685a");
    rect(0.96, 3.93, 0.61, 0.28, "#d29b5b35");
    rect(2.45, 2.36, 1.5, 0.16, "#755033");
    for (const x of [2.54, 2.83, 3.12, 3.42]) {
      rect(x, 2.22, 0.16, 0.14, "#b59976");
      rect(x + 0.13, 2.24, 0.08, 0.07, "#a79171");
    }
  } else if (materials.use === "shop") {
    rug(2.2, 3.1, 2.4, 1.85, "#5e5e48", "#ae9165");
    // Wall displays sit behind the playable floor. Tonics, salts, sigils and
    // parcels repeat the palette of the inventory rather than looking like books.
    for (const x of [5.15, 7.55]) {
      rect(x, 0.51, 1.9, 0.67, "#3b2d25");
      rect(x + 0.11, 0.57, 1.68, 0.52, "#624933");
      rect(x + 0.09, 0.99, 1.72, 0.10, "#ba8d62");
      for (let n = 0; n < 5; n += 1) {
        const bx = x + 0.18 + n * 0.31;
        rect(bx, 0.77 + (n % 2) * 0.06, 0.2, 0.19 - (n % 2) * 0.06,
          ["#96a89a", "#c39157", "#9c665a", "#9ca085", "#d0ab71"][n]!);
        rect(bx + 0.054, 0.73 + (n % 2) * 0.06, 0.092, 0.055, "#d7b78a");
      }
    }
  } else if (materials.use === "guild") {
    rug(4.85, 2.45, 2.35, 6.5, "#56545c", "#ac936e");
    rect(5.72, 0.48, 0.56, 0.48, "#725d42");
    rect(5.79, 0.55, 0.41, 0.3, "#baa475");
    rect(5.92, 0.49, 0.13, 0.42, "#d8bf8b");
    rect(8.08, 0.58, 1.35, 0.63, "#54402e");
    rect(8.17, 0.64, 1.15, 0.47, "#b49b78");
    rect(8.38, 0.78, 0.71, 0.05, "#6b6650");
    rect(8.62, 0.72, 0.05, 0.27, "#777256");
  }
}
