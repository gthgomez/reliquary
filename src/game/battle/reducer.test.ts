import assert from "node:assert/strict";
import { test } from "node:test";
import { makeBeast, SKILLS } from "../content.ts";
import { sequenceRandom } from "../rng.ts";
import { reduceAttack } from "./reducer.ts";
import { resolveAttack } from "./resolution.ts";

const IVS = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const beast = (id: string, level = 18) =>
  makeBeast(id, level, { temperament: "calm", ivs: IVS });

test("reduceAttack returns the mutated defenderHp and the same events as resolveAttack", () => {
  const attacker = beast("emberkit");
  const viaReducer = beast("mothwisp");
  const viaResolve = beast("mothwisp");
  const before = viaReducer.hp;
  const seq = [.99, .5];

  const { defenderHp, outcome } = reduceAttack(attacker, viaReducer, SKILLS.cinder, sequenceRandom(seq));
  const expected = resolveAttack(attacker, viaResolve, SKILLS.cinder, sequenceRandom(seq));

  assert.ok(defenderHp < before);
  assert.equal(defenderHp, viaReducer.hp);
  assert.equal(defenderHp, viaResolve.hp);
  assert.equal(outcome.damage, expected.damage);
  assert.deepEqual(outcome.events, expected.events);
});
