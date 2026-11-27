/** Small authored details layered over the shared tile bake for village interiors.
 * These are deliberately floor-only/trim details: props and collision remain
 * data-driven in registry.ts, while every room gets the same visual contract.
 */
export type InteriorRoomId = "home" | "inn_in" | "shop_in" | "guild_in" | "keep_inn" | "keep_shop";

export function isInteriorRoom(id: string): id is InteriorRoomId {
  return id === "home" || id === "inn_in" || id === "shop_in" || id === "guild_in" || id === "keep_inn" || id === "keep_shop";
}

export function paintInteriorRoom(ctx: CanvasRenderingContext2D, id: InteriorRoomId, width: number, height: number, doorX: number, tile: number): void {
  const floor = id === "inn_in" || id === "keep_inn" ? "#9b6946" : id === "guild_in" ? "#866448" : id === "shop_in" || id === "keep_shop" ? "#876246" : "#8a6248";
  const trim = id === "inn_in" || id === "keep_inn" ? "#e0ad63" : id === "guild_in" ? "#c89759" : "#c58a52";
  // Warm plank floor, with a subtle regular grain that survives small screens.
  ctx.fillStyle = floor;
  ctx.fillRect(tile, tile, (width - 2) * tile, (height - 2) * tile);
  ctx.strokeStyle = "rgba(47, 29, 22, .24)";
  ctx.lineWidth = 1;
  for (let y = 2; y < height - 1; y++) {
    ctx.beginPath(); ctx.moveTo(tile, y * tile + tile - 2); ctx.lineTo((width - 1) * tile, y * tile + tile - 2); ctx.stroke();
  }
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1 + (y % 4), n = 0; x < width - 1; x += 4, n++) {
      ctx.fillStyle = n % 2 ? "rgba(246, 190, 111, .12)" : "rgba(45, 25, 18, .1)";
      ctx.fillRect(x * tile + tile * .22, y * tile + tile * .42, Math.max(2, tile * .16), 1);
    }
  }
  // A continuous wall base and top beam make the dark boundary read as a room,
  // not an unfinished debug grid.
  ctx.fillStyle = "rgba(48, 29, 25, .65)";
  ctx.fillRect(tile, tile - 4, (width - 2) * tile, 4);
  ctx.fillStyle = trim;
  ctx.fillRect(tile, tile - 6, (width - 2) * tile, 2);
  ctx.fillStyle = "rgba(37, 23, 20, .7)";
  ctx.fillRect(tile - 4, tile, 4, (height - 2) * tile);
  ctx.fillRect((width - 1) * tile, tile, 4, (height - 2) * tile);
  ctx.fillStyle = "rgba(36, 23, 19, .8)";
  ctx.fillRect(tile, (height - 1) * tile - 4, (width - 2) * tile, 4);
  // Painted threshold: always centered on the real warp tile and never changes
  // the walkable ground or interaction footprint.
  ctx.fillStyle = "#5a3928";
  ctx.fillRect(doorX * tile + 3, (height - 1) * tile - 5, tile - 6, 5);
  ctx.fillStyle = trim;
  ctx.fillRect(doorX * tile + 5, (height - 1) * tile - 7, tile - 10, 2);
  // Room-specific visual anchors establish clear zones behind existing props.
  if (id === "inn_in" || id === "keep_inn") {
    ctx.fillStyle = "rgba(92, 39, 31, .22)";
    ctx.fillRect(7 * tile, 1.4 * tile, 4 * tile, 2.4 * tile);
    ctx.fillStyle = "rgba(245, 200, 120, .2)";
    ctx.fillRect(2 * tile, 3 * tile, 3 * tile, 3 * tile);
  } else if (id === "shop_in" || id === "keep_shop") {
    ctx.fillStyle = "rgba(59, 39, 28, .24)";
    ctx.fillRect(7 * tile, 1 * tile, 2 * tile, 5 * tile);
    ctx.fillStyle = "rgba(224, 165, 84, .17)";
    ctx.fillRect(2 * tile, 2 * tile, 3.5 * tile, 2.4 * tile);
  } else if (id === "guild_in") {
    ctx.fillStyle = "rgba(56, 38, 69, .2)";
    ctx.fillRect(1 * tile, 1 * tile, 4 * tile, 2.2 * tile);
    ctx.strokeStyle = "rgba(238, 190, 112, .35)";
    ctx.strokeRect(5.2 * tile, 3.2 * tile, 3.6 * tile, 2.8 * tile);
  } else {
    ctx.fillStyle = "rgba(92, 46, 31, .2)";
    ctx.fillRect(1.4 * tile, 1.2 * tile, 3.2 * tile, 2.5 * tile);
  }
}
