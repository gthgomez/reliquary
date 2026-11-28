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

test("an existing save beside the Elderhall well restores its original position", () => {
  const previous = { ...validSave(), x: 8, y: 8, gold: 223 };
  const restored = parseSave(JSON.stringify(previous));
  assert.ok(restored);
  assert.deepEqual({ x: restored.x, y: restored.y }, { x: 8, y: 8 });
  assert.equal(restored.gold, 223);
  assert.equal(restored.party[0]!.speciesId, "emberkit");
});

test("older-revision saves clamp HP/MP above current stat caps without dropping the save", () => {
  const previous = validSave();
  previous.worldRevision = WORLD_REVISION - 1;
  previous.party[0]!.hp += 25;
  previous.party[0]!.mp += 15;
  const restored = parseSave(JSON.stringify(previous));
  assert.ok(restored);
  assert.equal(restored.worldRevision, WORLD_REVISION);
  assert.ok(restored.party[0]!.hp < previous.party[0]!.hp);
  assert.ok(restored.party[0]!.mp < previous.party[0]!.mp);
});

test("historical v1, v2, and v3 saves without morphology migrate cleanly while preserving XP, level, HP, and MP", () => {
  const save = validSave();
  const { morphology: _m, ...legacyBeast } = save.party[0]!;
  legacyBeast.level = 9;
  legacyBeast.exp = 142;
  legacyBeast.hp = 23;
  legacyBeast.mp = 14;
  const { worldRevision: _wr, ...v1Fields } = save;
  const baseBody = { ...v1Fields, party: [legacyBeast] };

  for (const raw of [
    { ...baseBody, version: 1 },
    { ...baseBody, version: 2 },
    { ...baseBody, version: 3, worldRevision: 2 },
  ]) {
    const migrated = parseSave(JSON.stringify(raw));
    assert.ok(migrated);
    assert.equal(migrated.version, SAVE_VERSION);
    assert.equal(migrated.worldRevision, WORLD_REVISION);
    assert.deepEqual(migrated.party[0]!.morphology, { size: 1, mass: 1 });
    assert.equal(migrated.party[0]!.level, 9);
    assert.equal(migrated.party[0]!.exp, 142);
    assert.equal(migrated.party[0]!.hp, 23);
    assert.equal(migrated.party[0]!.mp, 14);
  }
});

test("v4 saves round-trip morphology, records, habitats, and milestones, and reject corrupt morphology", () => {
  const save = validSave();
  save.party[0]!.morphology = { size: 1.18, mass: 1.46 };
  save.habitats = { emberkit: ["Briar Road"] };
  save.records = { emberkit: { boundCount: 1, smallestCm: 57, largestCm: 57 } };
  save.milestones = { bound_5: false };

  const restored = parseSave(JSON.stringify(save));
  assert.ok(restored);
  assert.deepEqual(restored.party[0]!.morphology, { size: 1.18, mass: 1.46 });
  assert.deepEqual(restored.habitats?.emberkit, ["Briar Road"]);
  assert.equal(restored.records?.emberkit?.boundCount, 1);

  const store = new MemoryStorage();
  assert.equal(writeSave(restored, store), true);

  const corruptMorph = structuredClone(save);
  corruptMorph.party[0]!.morphology = { size: 3.5, mass: 1.0 };
  assert.equal(parseSave(JSON.stringify(corruptMorph)), null);

  const badHabitatSpecies = { ...save, habitats: { missing_mon: ["Elderhall"] } };
  assert.equal(parseSave(JSON.stringify(badHabitatSpecies)), null);
});
