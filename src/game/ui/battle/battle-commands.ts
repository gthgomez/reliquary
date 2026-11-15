import { battleCommands, type BattleCommand } from "../../world/encounters.ts";

/** Fixed visual slots in reading order. Position never depends on availability. */
export const BATTLE_COMMAND_SLOTS: readonly BattleCommand[] = [
  "Strike",
  "Skill",
  "Item",
  "Bind",
  "Party",
  "Flee",
] as const;

export const BATTLE_COMMAND_COLUMNS = 3;

export type BattleCommandSlot = {
  id: BattleCommand;
  label: string;
  available: boolean;
  /** Index into the engine's dynamic `battleCommands()` list, or null. */
  engineIndex: number | null;
  /** Player-facing explanation when the slot is inert. */
  unavailableReason: string | null;
};

const UNAVAILABLE_REASON: Partial<Record<BattleCommand, string>> = {
  Bind: "Binding sigils are not offered in this encounter.",
  Flee: "This encounter cannot be escaped.",
};

/**
 * Resolve the fixed six-slot presentation against the engine's dynamic command
 * list. Never pass a visual slot index straight into the engine: Slot 3 (Bind)
 * is engine index 2 in a fight without Bind, but index 3 in a wild fight.
 */
export function battleCommandSlots(battle: {
  canBind: boolean;
  canFlee: boolean;
}): BattleCommandSlot[] {
  const available = battleCommands(battle);
  return BATTLE_COMMAND_SLOTS.map((id) => {
    const engineIndex = available.indexOf(id);
    const isAvailable = engineIndex >= 0;
    return {
      id,
      label: id,
      available: isAvailable,
      engineIndex: isAvailable ? engineIndex : null,
      unavailableReason: isAvailable ? null : UNAVAILABLE_REASON[id] ?? "That action is not available.",
    };
  });
}

/** Visual slot index (0..5) for a command identity, or -1. */
export function commandSlotIndex(id: BattleCommand): number {
  return BATTLE_COMMAND_SLOTS.indexOf(id);
}

/**
 * Spatial navigation over the visible 3x2 grid. Movement follows the cells the
 * player can actually see — including a disabled slot, so its explanation is
 * discoverable — while activation of a disabled slot stays inert.
 */
export function nextBattleCommand(
  slots: readonly BattleCommandSlot[],
  from: BattleCommand,
  direction: "up" | "down" | "left" | "right",
): BattleCommand | null {
  const start = commandSlotIndex(from);
  if (start < 0) return firstAvailableCommand(slots);
  const cols = BATTLE_COMMAND_COLUMNS;
  const rows = Math.ceil(slots.length / cols);
  const row = Math.floor(start / cols);
  const col = start % cols;
  const step = direction === "left" ? -1 : direction === "right" ? 1 : direction === "up" ? -1 : 1;

  if (direction === "left" || direction === "right") {
    const c = col + step;
    if (c < 0 || c >= cols) return null;
    return slots[row * cols + c]?.id ?? null;
  }
  const r = row + step;
  if (r < 0 || r >= rows) return null;
  return slots[r * cols + col]?.id ?? null;
}

export function firstAvailableCommand(slots: readonly BattleCommandSlot[]): BattleCommand | null {
  return slots.find((slot) => slot.available)?.id ?? null;
}

/** Map an engine index back to the identity shown in the grid. */
export function commandForEngineIndex(
  slots: readonly BattleCommandSlot[],
  engineIndex: number,
): BattleCommand | null {
  return slots.find((slot) => slot.engineIndex === engineIndex)?.id ?? null;
}
