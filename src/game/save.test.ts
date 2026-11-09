import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast } from "./content.ts";
import { LEGACY_SAVE_BACKUP, LEGACY_SAVE_KEY, LEGACY_V1_BACKUP, LEGACY_V1_KEY, SAVE_BACKUP, SAVE_FORWARD_KEY, SAVE_KEY, SAVE_VERSION, WORLD_REVISION, loadSave, parseSave, serializeSave, writeSave, type SaveStorage } from "./save.ts";
import { MAPS } from "./maps.ts";
import { isOccupied } from "./world/movement.ts";

/** The first tile on elderhall the player cannot stand on (object or OOB). */
function occupiedTileOnElderhall(): { x: number; y: number } {
  const map = MAPS.elderhall;
  for (let y = 0; y < map.ground.length; y += 1) {
    for (let x = 0; x < (map.ground[y]?.length ?? 0); x += 1) {
      if (isOccupied(map, {}, x, y)) return { x, y };
    }
  }
  // Out of bounds also counts as occupied for every code path under test.
  return { x: -1, y: -1 };
}
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

test("a revision-one save underneath the new village tree is safely relocated", () => {
  const tree = MAPS.elderhall.objects.find((object) => object.id === "green_tree");
  assert.ok(tree);
  const old = { ...validSave(), worldRevision: 1, x: tree.x, y: tree.y, gold: 123 };
  const restored = parseSave(JSON.stringify(old));
  assert.ok(restored);
  assert.notDeepEqual({ x: restored.x, y: restored.y }, { x: old.x, y: old.y });
  assert.equal(restored.worldRevision, WORLD_REVISION);
  assert.equal(restored.gold, 123);
  assert.equal(isOccupied(MAPS.elderhall, restored.flags, restored.x, restored.y), false);
});

test("a standable old save is not moved merely because it is disconnected from spawn", () => {
  const old = { ...validSave(), worldRevision: 1, mapId: "mirefen", x: 9, y: 3 };
  assert.equal(isOccupied(MAPS.mirefen, old.flags, old.x, old.y), false);
  const restored = parseSave(JSON.stringify(old));
  assert.ok(restored);
  assert.deepEqual({ x: restored.x, y: restored.y }, { x: old.x, y: old.y });
});

test("valid saves round-trip through the current schema", () => {
  const store = new MemoryStorage();
  assert.equal(writeSave(validSave(), store), true);
  assert.equal(loadSave(store)?.version, SAVE_VERSION);
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
  const { worldRevision: _w, ...base } = validSave();
  const legacy = { ...base, version: 1 };
  assert.equal(parseSave(JSON.stringify(legacy))?.version, SAVE_VERSION);
  const missing = { ...legacy } as Partial<GameSave>;
  delete missing.party;
  assert.equal(parseSave(JSON.stringify(missing)), null);
});

test("pending skill offers round-trip, and unknown offers are rejected", () => {
  const store = new MemoryStorage();
  const save = validSave();
  save.party[0]!.pendingSkills = ["flare"];
  assert.equal(writeSave(save, store), true);
  assert.deepEqual(loadSave(store)?.party[0]?.pendingSkills, ["flare"]);
  const corrupt = { ...validSave() };
  corrupt.party[0]!.pendingSkills = ["no-such-skill"];
  assert.equal(writeSave(corrupt, store), false);
});

test("a valid backup recovers when the primary record is bad", () => {
  const store = new MemoryStorage();
  const save = validSave();
  store.data.set(SAVE_KEY, "{broken");
  store.data.set(SAVE_BACKUP, JSON.stringify(save));
  assert.equal(loadSave(store)?.playerName, "Rowan");
});

test("export text is a save the game can read back, and bad state exports nothing", () => {
  const text = serializeSave(validSave());
  assert.equal(typeof text, "string");
  assert.equal(parseSave(text!)?.playerName, "Rowan");
  const broken = validSave();
  broken.party[0]!.skills = ["no-such-skill"];
  assert.equal(serializeSave(broken), null);
  const offMap = validSave();
  offMap.x = 9_999;
  assert.equal(serializeSave(offMap), null);
  const { worldRevision: _wr, ...v1Body } = validSave();
  assert.equal(parseSave(JSON.stringify({ ...v1Body, version: 1 }))?.version, SAVE_VERSION);
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
  delete (legacy as { worldRevision?: number }).worldRevision;
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
  delete (legacy as { worldRevision?: number }).worldRevision;
  store.data.set(LEGACY_SAVE_KEY, JSON.stringify(legacy));
  store.failOn = SAVE_KEY;
  assert.equal(writeSave(validSave(), store), false);
  // Write failed: old keys must survive.
  assert.equal(parseSave(store.data.get(LEGACY_SAVE_KEY)!)?.playerName, "Rowan");
  store.failOn = null;
  assert.equal(writeSave(validSave(), store), true);
  assert.equal(store.data.has(LEGACY_SAVE_KEY), false);
});

test("a failed backup write still leaves the new primary durable", () => {
  const store = new MemoryStorage();
  const original = validSave();
  assert.equal(writeSave(original, store), true);
  store.failOn = SAVE_BACKUP;
  // Backup rotation is best-effort: under quota the primary must survive.
  assert.equal(writeSave({ ...original, gold: 999 }, store), true);
  assert.equal(loadSave(store)?.gold, 999);
  assert.equal(store.data.get(SAVE_BACKUP) ?? null, null);
  assert.equal(store.data.has(LEGACY_SAVE_KEY), false);
});

test("a save from a newer build is quarantined, not silently overwritten", () => {
  const store = new MemoryStorage();
  const forward = { ...validSave(), version: SAVE_VERSION + 1 };
  store.data.set(SAVE_KEY, JSON.stringify(forward));
  assert.equal(parseSave(store.data.get(SAVE_KEY)!), null); // this build cannot read it
  assert.equal(writeSave(validSave(), store), true);
  assert.equal(JSON.parse(store.data.get(SAVE_FORWARD_KEY)!).version, SAVE_VERSION + 1);
});

test("saves from an older world revision relocate instead of being discarded", () => {
  const blocked = occupiedTileOnElderhall();
  const stale = { ...validSave(), worldRevision: WORLD_REVISION - 1, x: blocked.x, y: blocked.y };
  const loaded = parseSave(JSON.stringify(stale));
  assert.notEqual(loaded, null);
  assert.equal(loaded!.worldRevision, WORLD_REVISION);
  // The unreachable coordinate moved somewhere reachable from spawn.
  const ok = loaded!.x !== blocked.x || loaded!.y !== blocked.y;
  assert.equal(ok, true);
});

test("same-revision saves on an impossible tile are still rejected", () => {
  const blocked = occupiedTileOnElderhall();
  const corrupt = { ...validSave(), worldRevision: WORLD_REVISION, x: blocked.x, y: blocked.y };
  assert.equal(parseSave(JSON.stringify(corrupt)), null);
});

for (const kind of ["format", "world"] as const) {
  const forwardSave = () => ({
    ...validSave(),
    ...(kind === "format" ? { version: SAVE_VERSION + 1 } : { worldRevision: WORLD_REVISION + 1 }),
  });

  for (const fault of ["write throws", "write is dropped", "read throws"] as const) {
    test(`a forward ${kind} save survives when its archive ${fault}`, () => {
      const store = new MemoryStorage();
      store.data.set(SAVE_KEY, JSON.stringify(forwardSave()));
      store.data.set(SAVE_BACKUP, JSON.stringify(validSave()));
      store.data.set(LEGACY_SAVE_KEY, "legacy record must survive refusal");
      const before = new Map(store.data);
      const failing: SaveStorage = {
        getItem(key) {
          if (key === SAVE_FORWARD_KEY && fault === "read throws") throw new Error("archive read failed");
          return store.getItem(key);
        },
        setItem(key, value) {
          if (key === SAVE_FORWARD_KEY) {
            if (fault === "write throws") throw new Error("archive quota exceeded");
            if (fault === "write is dropped") return;
          }
          store.setItem(key, value);
        },
        removeItem: (key) => store.removeItem(key),
      };
      assert.equal(writeSave(validSave(), failing), false);
      assert.deepEqual(store.data, before, "primary, backup and legacy records remain byte-for-byte intact");
    });
  }

  test(`a forward ${kind} save does not displace a different forward archive`, () => {
    const store = new MemoryStorage();
    store.data.set(SAVE_KEY, JSON.stringify(forwardSave()));
    store.data.set(SAVE_FORWARD_KEY, "a distinct newer-build record");
    store.data.set(SAVE_BACKUP, JSON.stringify(validSave()));
    const before = new Map(store.data);
    assert.equal(writeSave(validSave(), store), false);
    assert.deepEqual(store.data, before);
  });

  test(`a verified forward ${kind} archive permits a safe primary replacement`, () => {
    const store = new MemoryStorage();
    const forward = JSON.stringify(forwardSave());
    const backup = JSON.stringify(validSave());
    store.data.set(SAVE_KEY, forward);
    store.data.set(SAVE_BACKUP, backup);
    assert.equal(writeSave({ ...validSave(), gold: 77 }, store), true);
    assert.equal(store.data.get(SAVE_FORWARD_KEY), forward);
    assert.equal(store.data.get(SAVE_BACKUP), backup, "an unreadable forward primary never rotates over a good backup");
    assert.equal(loadSave(store)?.gold, 77);
  });

  for (const fault of ["write throws", "write is dropped", "read throws"] as const) {
    test(`a forward ${kind} backup survives when its archive ${fault}`, () => {
      const store = new MemoryStorage();
      store.data.set(SAVE_KEY, JSON.stringify(validSave()));
      store.data.set(SAVE_BACKUP, JSON.stringify(forwardSave()));
      store.data.set(LEGACY_SAVE_KEY, "legacy record must survive refusal");
      const before = new Map(store.data);
      const failing: SaveStorage = {
        getItem(key) {
          if (key === SAVE_FORWARD_KEY && fault === "read throws") throw new Error("archive read failed");
          return store.getItem(key);
        },
        setItem(key, value) {
          if (key === SAVE_FORWARD_KEY) {
            if (fault === "write throws") throw new Error("archive quota exceeded");
            if (fault === "write is dropped") return;
          }
          store.setItem(key, value);
        },
        removeItem: (key) => store.removeItem(key),
      };
      assert.equal(writeSave({ ...validSave(), gold: 77 }, failing), false);
      assert.deepEqual(store.data, before, "backup archival must succeed before primary replacement or legacy cleanup");
    });
  }

  test(`a forward ${kind} backup does not displace a different forward archive`, () => {
    const store = new MemoryStorage();
    store.data.set(SAVE_KEY, JSON.stringify(validSave()));
    store.data.set(SAVE_BACKUP, JSON.stringify(forwardSave()));
    store.data.set(SAVE_FORWARD_KEY, "a distinct newer-build record");
    const before = new Map(store.data);
    assert.equal(writeSave({ ...validSave(), gold: 77 }, store), false);
    assert.deepEqual(store.data, before);
  });

  test(`a forward ${kind} backup is archived before ordinary rotation`, () => {
    const store = new MemoryStorage();
    const primary = JSON.stringify(validSave());
    const forward = JSON.stringify(forwardSave());
    store.data.set(SAVE_KEY, primary);
    store.data.set(SAVE_BACKUP, forward);
    assert.equal(writeSave({ ...validSave(), gold: 77 }, store), true);
    assert.equal(store.data.get(SAVE_FORWARD_KEY), forward);
    assert.equal(store.data.get(SAVE_BACKUP), primary);
    assert.equal(loadSave(store)?.gold, 77);
  });

  for (const sameRecord of [false, true]) {
    test(`a second save ${sameRecord ? "reuses" : "does not replace"} the quarantined ${kind} primary when rotating a ${sameRecord ? "matching" : "distinct"} forward backup`, () => {
      const store = new MemoryStorage();
      const newer = forwardSave();
      const primary = JSON.stringify(newer);
      const backup = JSON.stringify(sameRecord ? newer : { ...newer, gold: 999 });
      store.data.set(SAVE_KEY, primary);
      store.data.set(SAVE_BACKUP, backup);
      assert.equal(writeSave({ ...validSave(), gold: 77 }, store), true);
      assert.equal(store.data.get(SAVE_FORWARD_KEY), primary);
      assert.equal(store.data.get(SAVE_BACKUP), backup);
      const beforeSecondSave = new Map(store.data);
      store.failOn = SAVE_FORWARD_KEY;
      assert.equal(writeSave({ ...validSave(), gold: 88 }, store), sameRecord);
      assert.equal(store.data.get(SAVE_FORWARD_KEY), primary);
      if (sameRecord) {
        assert.equal(parseSave(store.data.get(SAVE_BACKUP)!)?.gold, 77);
        assert.equal(loadSave(store)?.gold, 88);
      } else {
        assert.deepEqual(store.data, beforeSecondSave);
      }
    });
  }

  for (const legacyKey of [LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP]) {
    test(`cleanup preserves a forward ${kind} record in ${legacyKey} without replacing a distinct archive`, () => {
      const store = new MemoryStorage();
      const forward = JSON.stringify(forwardSave());
      const ordinaryKey = legacyKey === LEGACY_SAVE_KEY ? LEGACY_V1_KEY : LEGACY_SAVE_KEY;
      const { worldRevision: _world, ...legacy } = validSave();
      store.data.set(SAVE_KEY, JSON.stringify(validSave()));
      store.data.set(legacyKey, forward);
      store.data.set(ordinaryKey, JSON.stringify({ ...legacy, version: ordinaryKey === LEGACY_V1_KEY ? 1 : 2 }));
      store.data.set(SAVE_FORWARD_KEY, "a distinct newer-build record");
      assert.equal(writeSave({ ...validSave(), gold: 77 }, store), true);
      assert.equal(store.data.get(legacyKey), forward, "unknown forward legacy data stays intact in its original slot");
      assert.equal(store.data.get(SAVE_FORWARD_KEY), "a distinct newer-build record");
      assert.equal(store.data.has(ordinaryKey), false, "ordinary legacy cleanup still follows the durable primary write");
      assert.equal(loadSave(store)?.gold, 77);
    });
  }

  test(`an identical forward ${kind} archive can be reused when another archive write would fail`, () => {
    const store = new MemoryStorage();
    const forward = JSON.stringify(forwardSave());
    store.data.set(SAVE_KEY, forward);
    store.data.set(SAVE_FORWARD_KEY, forward);
    store.failOn = SAVE_FORWARD_KEY;
    assert.equal(writeSave({ ...validSave(), gold: 77 }, store), true);
    assert.equal(store.data.get(SAVE_FORWARD_KEY), forward);
    assert.equal(loadSave(store)?.gold, 77);
  });
}

test("future world revisions are rejected instead of being relocated or downgraded", () => {
  for (const position of [{ x: 12, y: 14 }, occupiedTileOnElderhall()]) {
    const future = { ...validSave(), ...position, worldRevision: WORLD_REVISION + 1 };
    assert.equal(parseSave(JSON.stringify(future)), null);
  }
});

for (const field of ["version", "worldRevision"] as const) {
  test(`serializing or writing a future ${field} refuses the downgrade without changing stored saves`, () => {
    const store = new MemoryStorage();
    assert.equal(writeSave(validSave(), store), true);
    const before = new Map(store.data);
    const future = { ...validSave(), [field]: field === "version" ? SAVE_VERSION + 1 : WORLD_REVISION + 1 };
    const inputBefore = structuredClone(future);
    assert.equal(serializeSave(future), null);
    assert.equal(writeSave(future, store), false);
    assert.deepEqual(store.data, before);
    assert.deepEqual(future, inputBefore);
  });
}

test("an unreadable backup blocks rotation before any saved record changes", () => {
  const store = new MemoryStorage();
  store.data.set(SAVE_KEY, JSON.stringify(validSave()));
  store.data.set(SAVE_BACKUP, JSON.stringify({ ...validSave(), version: SAVE_VERSION + 1 }));
  const before = new Map(store.data);
  const failing: SaveStorage = {
    getItem(key) {
      if (key === SAVE_BACKUP) throw new Error("backup read failed");
      return store.getItem(key);
    },
    setItem: (key, value) => store.setItem(key, value),
    removeItem: (key) => store.removeItem(key),
  };
  assert.equal(writeSave({ ...validSave(), gold: 77 }, failing), false);
  assert.deepEqual(store.data, before);
});

test("a future-world primary is left intact when loading a compatible backup", () => {
  const store = new MemoryStorage();
  store.data.set(SAVE_KEY, JSON.stringify({ ...validSave(), worldRevision: WORLD_REVISION + 1, gold: 999 }));
  store.data.set(SAVE_BACKUP, JSON.stringify({ ...validSave(), gold: 77 }));
  const before = new Map(store.data);
  assert.equal(loadSave(store)?.gold, 77);
  assert.deepEqual(store.data, before);
});

for (const legacyKey of [LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP]) {
  test(`cleanup retains ${legacyKey} when its contents cannot be read safely`, () => {
    const store = new MemoryStorage();
    const forward = JSON.stringify({ ...validSave(), version: SAVE_VERSION + 1 });
    store.data.set(SAVE_KEY, JSON.stringify(validSave()));
    store.data.set(legacyKey, forward);
    let reads = 0;
    const failing: SaveStorage = {
      getItem(key) {
        if (key === legacyKey && ++reads > 1) throw new Error("cleanup read failed");
        return store.getItem(key);
      },
      setItem: (key, value) => store.setItem(key, value),
      removeItem: (key) => store.removeItem(key),
    };
    assert.equal(writeSave({ ...validSave(), gold: 77 }, failing), true);
    assert.equal(store.data.get(legacyKey), forward);
    assert.equal(loadSave(store)?.gold, 77);
  });
}

for (const version of [1, 2]) {
  test(`future-world metadata remains protected even when its format claims legacy version ${version}`, () => {
    const store = new MemoryStorage();
    const backup = JSON.stringify({ ...validSave(), version, worldRevision: WORLD_REVISION + 1 });
    store.data.set(SAVE_KEY, JSON.stringify(validSave()));
    store.data.set(SAVE_BACKUP, backup);
    const legacyRecords = [LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP].map((key, index) => {
      const raw = JSON.stringify({ ...validSave(), version, worldRevision: WORLD_REVISION + 1, gold: 500 + index });
      store.data.set(key, raw);
      return [key, raw] as const;
    });
    assert.equal(writeSave({ ...validSave(), gold: 77 }, store), true);
    assert.equal(store.data.get(SAVE_FORWARD_KEY), backup);
    for (const [key, raw] of legacyRecords) assert.equal(store.data.get(key), raw);
    assert.equal(loadSave(store)?.gold, 77);
  });
}
