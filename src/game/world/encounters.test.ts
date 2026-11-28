import assert from "node:assert/strict";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { sequenceRandom } from "../rng.ts";
import { encounterAt, pickWeightedEncounter, rollEncounter } from "./encounters.ts";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test("pickWeightedEncounter follows exact cumulative weight boundaries", () => {
  const table = [
    { species: "gutterrat", min: 3, max: 3, w: 5 },
    { species: "mothwisp", min: 2, max: 2, w: 3 },
    { species: "dewslime", min: 2, max: 2, w: 2 },
  ];
  assert.equal(pickWeightedEncounter(table, sequenceRandom([0.0, 0.0]))?.species, "gutterrat");
  assert.equal(pickWeightedEncounter(table, sequenceRandom([0.49, 0.0]))?.species, "gutterrat");
  assert.equal(pickWeightedEncounter(table, sequenceRandom([0.51, 0.0]))?.species, "mothwisp");
  assert.equal(pickWeightedEncounter(table, sequenceRandom([0.81, 0.0]))?.species, "dewslime");
  assert.equal(pickWeightedEncounter([], sequenceRandom([0.1])), null);
});

test("seeded wild sampling matches empirical probability weights within tolerance", () => {
  const table = MAPS.briar_road.encounters;
  const totalW = table.reduce((sum, entry) => sum + entry.w, 0);
  const counts = new Map<string, number>();
  const rng = lcg(20261127);
  const trials = 4000;
  for (let i = 0; i < trials; i += 1) {
    const pick = pickWeightedEncounter(table, rng)!;
    counts.set(pick.species, (counts.get(pick.species) ?? 0) + 1);
    const entry = table.find((item) => item.species === pick.species)!;
    assert.ok(pick.level >= entry.min && pick.level <= entry.max);
  }
  for (const entry of table) {
    const expected = entry.w / totalW;
    const actual = (counts.get(entry.species) ?? 0) / trials;
    assert.ok(Math.abs(actual - expected) < 0.03, `${entry.species}: expected ${expected}, got ${actual}`);
  }
});

test("safe map zones and road tiles never roll wild encounters", () => {
  const elderDef = encounterAt(MAPS.elderhall, MAPS.elderhall.spawn.x, MAPS.elderhall.spawn.y);
  const groveDef = encounterAt(MAPS.grove, MAPS.grove.spawn.x, MAPS.grove.spawn.y);
  assert.equal(elderDef ? rollEncounter(elderDef, sequenceRandom([0.01])) : null, null);
  assert.equal(groveDef ? rollEncounter(groveDef, sequenceRandom([0.01])) : null, null);

  const ashSafe = encounterAt(MAPS.ashenbarrow, 8, 14)!;
  assert.equal(ashSafe.rate, 0);
  assert.equal(rollEncounter(ashSafe, sequenceRandom([0.0])), null);

  assert.equal(encounterAt(MAPS.briar_road, 10, 26), null);
  const grass = encounterAt(MAPS.briar_road, 4, 22);
  assert.ok(grass && grass.rate > 0 && grass.encounters.length > 0);
});
