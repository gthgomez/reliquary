import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast } from "./content.ts";
import { LEGACY_SAVE_KEY, SAVE_BACKUP, SAVE_KEY, loadSave, parseSave, writeSave, type SaveStorage } from "./save.ts";
import type { GameSave } from "./types.ts";

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  failOn: string | null = null;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (key === this.failOn) throw new Error("storage failure"); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

function validSave(): GameSave {
  const b = makeBeast("emberkit", 5, { temperament: "calm", ivs: { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 } });
  return { version: 2, playerName: "Rowan", mapId: "elderhall", x: 12, y: 14, dir: 0, gold: 180, playTime: 12, party: [b], box: [], inventory: { tonic: 2 }, flags: {}, seen: { emberkit: true }, caught: { emberkit: true } };
}

test("valid saves round-trip through the current schema", () => {
  const store = new MemoryStorage();
  assert.equal(writeSave(validSave(), store), true);
  assert.equal(loadSave(store)?.version, 2);
  assert.equal(store.data.has(SAVE_KEY), true);
});

test("malformed JSON and corrupt nested data are rejected", () => {
  assert.equal(parseSave("not json"), null);
  const raw = JSON.stringify(validSave()).replace('"skills":["nip","cinder"]', '"skills":["not-a-skill"]');
  assert.equal(parseSave(raw), null);
  assert.equal(parseSave(JSON.stringify({ ...validSave(), mapId: "missing-map" })), null);
  assert.equal(parseSave(JSON.stringify({ ...validSave(), party: [{ ...validSave().party[0], speciesId: "missing-species" }] })), null);
});

test("legacy v1 saves migrate without defaulting corrupt missing fields", () => {
  const legacy = { ...validSave(), version: 1 };
  assert.equal(parseSave(JSON.stringify(legacy))?.version, 2);
  const missing = { ...legacy } as Partial<GameSave>;
  delete missing.party;
  assert.equal(parseSave(JSON.stringify(missing)), null);
});

test("a valid backup recovers when the primary record is bad", () => {
  const store = new MemoryStorage();
  const save = validSave();
  store.data.set(SAVE_KEY, "{broken");
  store.data.set(SAVE_BACKUP, JSON.stringify(save));
  assert.equal(loadSave(store)?.playerName, "Rowan");
});

test("a corrupt primary never overwrites the only good backup when the new primary write fails", () => {
  const store = new MemoryStorage();
  const save = validSave();
  assert.equal(writeSave(save, store), true);
  assert.equal(writeSave({ ...save, gold: 180 }, store), true); // rotates the validated prior save into the backup
  // Fault sequence: corrupt primary, valid backup, then a failing new primary write.
  store.data.set(SAVE_KEY, "{broken");
  store.failOn = SAVE_KEY;
  assert.equal(writeSave({ ...save, gold: 999 }, store), false);
  store.failOn = null;
  // The corrupt primary must not have been rotated into the backup slot.
  assert.equal(loadSave(store)?.gold, save.gold);
});

test("a corrupt primary is not validated for backup rotation", () => {
  const store = new MemoryStorage();
  const save = validSave();
  store.data.set(SAVE_KEY, "{broken");
  assert.equal(writeSave({ ...save, gold: 77 }, store), true);
  // The good backup written by the successful save is not the corrupt primary.
  assert.equal(loadSave(store)?.gold, 77);
  assert.notEqual(store.data.get(SAVE_BACKUP), "{broken");
});

test("loadSave falls back to legacy slots and survives read failures", () => {
  const store = new MemoryStorage();
  const legacy = { ...validSave(), version: 1 } as GameSave;
  store.data.set(LEGACY_SAVE_KEY, JSON.stringify(legacy));
  assert.equal(loadSave(store)?.playerName, "Rowan");
  store.data.delete(LEGACY_SAVE_KEY);
  store.data.set(SAVE_KEY, JSON.stringify(validSave()));
  const reader: SaveStorage = {
    getItem: (key) => { if (key === SAVE_KEY) throw new Error("read failure"); return store.getItem(key); },
    setItem: (key, value) => store.setItem(key, value),
    removeItem: (key) => store.removeItem(key),
  };
  assert.equal(loadSave(reader), null);
});

test("duplicate creature IDs and unknown content fail semantic validation", () => {
  const save = validSave();
  const dup = validSave();
  dup.party[0] = { ...save.party[0]!, uid: save.party[0]!.uid };
  assert.equal(parseSave(JSON.stringify({ ...save, box: [dup.party[0]!] })), null);
  assert.equal(parseSave(JSON.stringify({ ...save, inventory: { "not-an-item": 1 } })), null);
  assert.equal(parseSave(JSON.stringify({ ...save, caught: { "not-a-species": true } })), null);
});

test("legacy keys are removed only after a validated new save is durable", () => {
  const store = new MemoryStorage();
  const legacy = { ...validSave(), version: 1 } as GameSave;
  store.data.set(LEGACY_SAVE_KEY, JSON.stringify(legacy));
  store.failOn = SAVE_KEY;
  assert.equal(writeSave(validSave(), store), false);
  // Write failed: old keys must survive.
  assert.equal(parseSave(store.data.get(LEGACY_SAVE_KEY)!)?.playerName, "Rowan");
  store.failOn = null;
  assert.equal(writeSave(validSave(), store), true);
  assert.equal(store.data.has(LEGACY_SAVE_KEY), false);
});

test("a failed backup write preserves the last-known-good primary", () => {
  const store = new MemoryStorage();
  const original = validSave();
  assert.equal(writeSave(original, store), true);
  store.failOn = SAVE_BACKUP;
  assert.equal(writeSave({ ...original, gold: 999 }, store), false);
  assert.equal(loadSave(store)?.gold, original.gold);
  assert.equal(store.data.has(LEGACY_SAVE_KEY), false);
});
