import assert from "node:assert/strict";
import { test } from "node:test";
import {
  battleCommandSlots,
  commandForEngineIndex,
  nextBattleCommand,
} from "./battle-commands.ts";

const wild = { canBind: true, canFlee: true };

test("wild battles expose all six slots in reading order with engine indices", () => {
  const slots = battleCommandSlots(wild);
  assert.deepEqual(
    slots.map((slot) => [slot.id, slot.available, slot.engineIndex]),
    [
      ["Strike", true, 0],
      ["Skill", true, 1],
      ["Item", true, 2],
      ["Bind", true, 3],
      ["Party", true, 4],
      ["Flee", true, 5],
    ],
  );
});

test("a fixed encounter without Bind keeps the slot but remaps Party and Flee", () => {
  const slots = battleCommandSlots({ canBind: false, canFlee: true });
  assert.deepEqual(
    slots.map((slot) => [slot.id, slot.available, slot.engineIndex]),
    [
      ["Strike", true, 0],
      ["Skill", true, 1],
      ["Item", true, 2],
      ["Bind", false, null],
      ["Party", true, 3],
      ["Flee", true, 4],
    ],
  );
  assert.match(slots[3]!.unavailableReason ?? "", /not offered/i);
});

test("a trial with neither Bind nor Flee keeps visual positions stable", () => {
  const slots = battleCommandSlots({ canBind: false, canFlee: false });
  assert.deepEqual(
    slots.map((slot) => [slot.id, slot.available, slot.engineIndex]),
    [
      ["Strike", true, 0],
      ["Skill", true, 1],
      ["Item", true, 2],
      ["Bind", false, null],
      ["Party", true, 3],
      ["Flee", false, null],
    ],
  );
  assert.match(slots[5]!.unavailableReason ?? "", /cannot be escaped/i);
});

test("spatial navigation follows the visible grid and skips disabled cells", () => {
  const slots = battleCommandSlots(wild);
  assert.equal(nextBattleCommand(slots, "Strike", "right"), "Skill");
  assert.equal(nextBattleCommand(slots, "Skill", "left"), "Strike");
  assert.equal(nextBattleCommand(slots, "Item", "right"), null, "no wrap past the row edge");
  assert.equal(nextBattleCommand(slots, "Strike", "down"), "Bind");
  assert.equal(nextBattleCommand(slots, "Flee", "up"), "Item");

  const noBind = battleCommandSlots({ canBind: false, canFlee: true });
  assert.equal(nextBattleCommand(noBind, "Skill", "down"), "Party");
  assert.equal(nextBattleCommand(noBind, "Strike", "down"), "Bind", "disabled slots stay reachable for their explanation");
  assert.equal(nextBattleCommand(noBind, "Bind", "down"), null, "no row below the grid");
});

test("engine indices resolve back to identities, never slot ordinals", () => {
  const noBind = battleCommandSlots({ canBind: false, canFlee: true });
  assert.equal(commandForEngineIndex(noBind, 3), "Party");
  assert.equal(commandForEngineIndex(noBind, 4), "Flee");
  assert.equal(commandForEngineIndex(noBind, 5), null);
});
