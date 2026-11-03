import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast } from "./content.ts";
import { SAVE_VERSION, WORLD_REVISION, parseSave, writeSave, type SaveStorage } from "./save.ts";
import type { GameSave } from "./types.ts";

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

function validSave(): GameSave {
  const b = makeBeast("emberkit", 5, { temperament: "calm", ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 } });
  return {
    version: SAVE_VERSION,
    worldRevision: WORLD_REVISION,
    playerName: "Rowan",
    mapId: "elderhall",
    x: 12,
    y: 14,
    dir: 0,
    gold: 180,
    playTime: 12,
    party: [b],
    box: [],
    inventory: { tonic: 2 },
    flags: {},
    seen: { emberkit: true },
    caught: { emberkit: true },
  };
}

test("legacy v1 saves with impossible coordinates fail migration", () => {
  const { worldRevision: _w, ...base } = validSave();
  const legacy = { ...base, version: 1, x: 99, y: 99 };
  assert.equal(parseSave(JSON.stringify(legacy)), null);
});
