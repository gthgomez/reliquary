import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEMS, makeBeast } from "./content.ts";
import { validateItemUse } from "./systems/items.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string) => makeBeast(id, 5, { temperament: "calm", ivs: IVS });

test("healing requires a living target", () => {
  const alive = beast("emberkit");
  const fallen = beast("mirewhelp");
  fallen.hp = 0;
  assert.deepEqual(validateItemUse(ITEMS.tonic, [alive, fallen], 0, true, 1), {
    ok: false, reason: "invalid-target",
  });
  assert.deepEqual(validateItemUse(ITEMS.tonic, [alive, fallen], 0, true, 0), {
    ok: true, targetIndex: 0, consume: true,
  });
});

test("revive requires a fainted target and picks one by default", () => {
  const alive = beast("emberkit");
  const fallen = beast("mirewhelp");
  fallen.hp = 0;
  assert.deepEqual(validateItemUse(ITEMS.phoenix_ash, [alive, fallen], 0, true, 0), {
    ok: false, reason: "invalid-target",
  });
  assert.deepEqual(validateItemUse(ITEMS.phoenix_ash, [alive, fallen], 0, true), {
    ok: true, targetIndex: 1, consume: true,
  });
  assert.deepEqual(validateItemUse(ITEMS.phoenix_ash, [alive], 0, true), {
    ok: false, reason: "no-target",
  });
});

test("field items are overworld-only and blocked in battle", () => {
  assert.deepEqual(validateItemUse(ITEMS.quiet_bell, [beast("emberkit")], 0, true), {
    ok: false, reason: "field-only",
  });
  assert.deepEqual(validateItemUse(ITEMS.quiet_bell, [beast("emberkit")], 0, false), {
    ok: true, targetIndex: -1, consume: true,
  });
});

test("sigils and key items are never usable as consumables", () => {
  assert.deepEqual(validateItemUse(ITEMS.common_sigil, [beast("emberkit")], 0, true), {
    ok: false, reason: "unusable",
  });
});
