import assert from "node:assert/strict";
import { test } from "node:test";
import { SKILLS, SPECIES, makeBeast, currentStats } from "../content.ts";
import { sequenceRandom } from "../rng.ts";
import { applyStatus } from "./status.ts";
import { resolveSkillUse, applySkillEvents } from "./battle-engine.ts";

function pair() {
  return { atk: makeBeast("emberkit", 12), def: makeBeast("mothwisp", 12) };
}

test("a missed strike consumes only the accuracy roll and logs the miss", () => {
  const { atk, def } = pair();
  // Ram has 95 accuracy; the near-certain roll must miss (a 100-accuracy
  // skill short-circuits to always hit and cannot test this path).
  const events = resolveSkillUse(atk, def, SKILLS.ram, sequenceRandom([0.9999]));
  assert.deepEqual(events.map((e) => e.kind), ["miss"]);
  const log = applySkillEvents(atk, def, SKILLS.ram, events);
  assert.equal(log, `${atk.nickname}'s Ram misses.`);
  assert.equal(def.hp, currentStats(def).hp); // untouched
});

test("heal restores bounded HP and reports the actual gain", () => {
  const { atk, def } = pair();
  atk.hp = 5;
  const healSkill = Object.values(SKILLS).find((s) => s.kind === "heal")!;
  const events = resolveSkillUse(atk, def, healSkill, sequenceRandom([0.5]));
  assert.equal(events[0]!.kind, "heal");
  const log = applySkillEvents(atk, def, healSkill, events);
  const event = events[0]! as Extract<typeof events[number], { kind: "heal" }>;
  assert.ok(event.amount >= 1);
  assert.equal(atk.hp, 5 + event.amount);
  assert.match(log!, /mends for \d+\./);
});

test("zero-power hex applies its status to the defender without damage", () => {
  const { atk, def } = pair();
  const hex = Object.values(SKILLS).find((s) => s.kind === "hex" && s.power === 0 && s.status)!;
  const events = resolveSkillUse(atk, def, hex, sequenceRandom([0.5]));
  assert.equal(events[0]!.kind, "status-only");
  const log = applySkillEvents(atk, def, hex, events);
  assert.match(log!, new RegExp(`${def.nickname} is `));
  assert.equal(def.status, hex.status);
  assert.equal(def.hp, currentStats(def).hp);
});

test("a damaging skill applies context modifiers and the full log line", () => {
  const { atk, def } = pair();
  applyStatus(def, "ward");
  applyStatus(atk, "bless");
  // Guaranteed hit, no crit, max variance.
  const events = resolveSkillUse(atk, def, SKILLS.slash, sequenceRandom([0.5, 0.99, 0.5]));
  const event = events[0]!;
  assert.equal(event.kind, "damage");
  if (event.kind !== "damage") return;
  const log = applySkillEvents(atk, def, SKILLS.slash, events);
  assert.equal(def.hp, currentStats(def).hp - event.amount);
  assert.match(log!, /harm\./);
});

test("a lethal strike gates the status roll on the defender surviving", () => {
  const { atk, def } = pair();
  def.hp = 1;
  // Status chance would succeed, but the defender does not survive the hit:
  // the roll must still be consumed (RNG order) yet no status may apply.
  const events = resolveSkillUse(atk, def, SKILLS.cinder, sequenceRandom([0.5, 0.99, 0.5, 0.0]));
  const event = events[0]!;
  assert.equal(event.kind, "damage");
  if (event.kind !== "damage") return;
  applySkillEvents(atk, def, SKILLS.cinder, events);
  assert.equal(def.hp, 0);
  assert.equal(event.status, null);
  assert.equal(def.status, null);
});
