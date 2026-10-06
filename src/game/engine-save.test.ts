import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast } from "./content.ts";
import { ReliquaryGame } from "./engine.ts";
import { SAVE_KEY, type SaveStorage } from "./save.ts";
import { sequenceRandom } from "./rng.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  failOn: string | null = null;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failOn) throw new Error("quota exceeded");
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

function gameWith(storage: SaveStorage): ReliquaryGame {
  const g = new ReliquaryGame({ random: sequenceRandom([0.5]), storage });
  g.party = [makeBeast("emberkit", 5, { temperament: "calm", ivs: IVS })];
  g.flags.starter = true;
  return g;
}

test("a successful save is durable and marks the lantern written", () => {
  const store = new MemoryStorage();
  const g = gameWith(store);
  g.menu = "root";
  g.menuIndex = 3; // "Save"
  g.menuConfirm();
  assert.equal(store.data.has(SAVE_KEY), true);
  assert.equal(g.hasSave, true);
  assert.equal(g.toast, "The lantern is written.");
});

test("a failed save neither reports success nor falsely marks hasSave", () => {
  const store = new MemoryStorage();
  const g = gameWith(store);
  store.failOn = SAVE_KEY;
  g.menu = "root";
  g.menuIndex = 3;
  g.menuConfirm();
  assert.equal(g.hasSave, false, "hasSave must not be set when the write failed");
  assert.equal(store.data.has(SAVE_KEY), false);
  assert.notEqual(g.toast, "The lantern is written.");
});

test("hasSave reflects an existing durable save at construction", () => {
  const store = new MemoryStorage();
  const first = gameWith(store);
  first.persist();
  const second = new ReliquaryGame({ random: sequenceRandom([0.5]), storage: store });
  assert.equal(second.hasSave, true);
});
