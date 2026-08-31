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

test("a failed backup write preserves the last-known-good primary", () => {
  const store = new MemoryStorage();
  const original = validSave();
  assert.equal(writeSave(original, store), true);
  store.failOn = SAVE_BACKUP;
  assert.equal(writeSave({ ...original, gold: 999 }, store), false);
  assert.equal(loadSave(store)?.gold, original.gold);
  assert.equal(store.data.has(LEGACY_SAVE_KEY), false);
});
