import type { ItemDef } from "../types.ts";

export type EconomyResult = {
  ok: boolean;
  gold: number;
  inventory: Record<string, number>;
};

export function purchaseItem(
  gold: number,
  inventory: Record<string, number>,
  item: ItemDef,
  stock: readonly string[],
): EconomyResult {
  if (!stock.includes(item.id) || gold < item.price) return { ok: false, gold, inventory: { ...inventory } };
  return {
    ok: true,
    gold: gold - item.price,
    inventory: { ...inventory, [item.id]: (inventory[item.id] ?? 0) + 1 },
  };
}

export function sellItem(
  gold: number,
  inventory: Record<string, number>,
  item: ItemDef,
): EconomyResult {
  const quantity = inventory[item.id] ?? 0;
  if (quantity <= 0) return { ok: false, gold, inventory: { ...inventory } };
  return {
    ok: true,
    gold: gold + Math.floor(item.price / 2),
    inventory: { ...inventory, [item.id]: quantity - 1 },
  };
}
