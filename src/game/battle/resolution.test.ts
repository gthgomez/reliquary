import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast, SKILLS } from "../content.ts";
import { sequenceRandom } from "../rng.ts";
import { resolveAttack } from "./resolution.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 18) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

test("a damaging skill reduces the defender's HP and emits a hit event", () => {
  const attacker = beast("emberkit");
  const defender = beast("mothwisp");
  const before = defender.hp;
  const outcome = resolveAttack(attacker, defender, SKILLS.cinder, sequenceRandom([.99, .5]));
  assert.ok(outcome.damage > 0);
  assert.equal(defender.hp, before - outcome.damage);
  assert.ok(outcome.events.some((e) => e.kind === "hit"));
});

test("heal restores HP without damaging", () => {
  const attacker = beast("briarling");
  attacker.hp = 1;
  const outcome = resolveAttack(attacker, beast("mothwisp"), SKILLS.mossmend, sequenceRandom([.5]));
  assert.ok(outcome.healed > 0);
  assert.equal(outcome.damage, 0);
  assert.ok(outcome.events.some((e) => e.kind === "heal"));
});

test("ward applies a status without damage", () => {
  const defender = beast("mirewhelp");
  const outcome = resolveAttack(beast("mothwisp"), defender, SKILLS.wardveil, sequenceRandom([.5]));
  assert.equal(defender.status, "ward");
  assert.equal(outcome.damage, 0);
});

test("a damaging hit that also applies status emits harm and status messages", () => {
  const attacker = beast("emberkit");
  const defender = beast("mothwisp");
  // Draws: accuracy, crit, variance, then status chance (Scorch is 100% burn).
  const outcome = resolveAttack(attacker, defender, SKILLS.scorch, sequenceRandom([.5, .99, .5, .5]));
  assert.ok(outcome.damage > 0);
  assert.equal(outcome.statusApplied, "burn");
  const messages = outcome.events.filter((e) => e.kind === "message").map((e) => e.text);
  assert.equal(messages.length, 2);
  const joined = messages.join(" ");
  assert.match(joined, /harm\./);
  assert.match(joined, /is burn\./);
});
