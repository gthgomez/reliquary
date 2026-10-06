import type { Beast, ItemDef } from "../types.ts";

export type ItemUseFailure = "unusable" | "field-only" | "no-target" | "invalid-target";

export type ItemUsePlan =
  | { ok: true; targetIndex: number; consume: true }
  | { ok: false; reason: ItemUseFailure };

/**
 * Decide whether an item may be used and on whom, without applying anything.
 * Consumption happens only after this returns `ok: true`.
 * `targetIndex` is -1 for items that take no party target (field items).
 */
export function validateItemUse(
  item: ItemDef | undefined,
  party: Beast[],
  activeIndex: number,
  inBattle: boolean,
  requestedTarget?: number,
): ItemUsePlan {
  if (!item) return { ok: false, reason: "unusable" };
  if (item.kind === "sigil" || item.kind === "key") return { ok: false, reason: "unusable" };
  if (item.kind === "field") {
    return inBattle ? { ok: false, reason: "field-only" } : { ok: true, targetIndex: -1, consume: true };
  }
  const fallback = item.kind === "revive"
    ? party.findIndex((b) => b.hp <= 0)
    : activeIndex;
  const targetIndex = requestedTarget ?? fallback;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= party.length) {
    return { ok: false, reason: "no-target" };
  }
  const target = party[targetIndex]!;
  if (item.kind === "revive") {
    return target.hp > 0 ? { ok: false, reason: "invalid-target" } : { ok: true, targetIndex, consume: true };
  }
  return target.hp <= 0 ? { ok: false, reason: "invalid-target" } : { ok: true, targetIndex, consume: true };
}
