import assert from "node:assert/strict";
import { test } from "node:test";
import { currentStats, makeBeast } from "../../content.ts";
import type { Beast } from "../../types.ts";
import {
  commandDetails,
  itemDetails,
  resolveBattleActionDetails,
  skillDetails,
} from "./battle-action-details.ts";
import type { BattleDetailsInput } from "./battle-action-details.ts";

const quiet = () => 0.5;
const lead = makeBeast("briarling", 5, { random: quiet });
const reserve = makeBeast("galeskip", 4, { random: quiet });

function input(overrides: Partial<BattleDetailsInput> = {}): BattleDetailsInput {
  return {
    phase: "command",
    command: "Strike",
    canBind: true,
    canFlee: true,
    playerIndex: 0,
    party: [lead, reserve],
    inventory: { tonic: 2, common_sigil: 1 },
    skillIds: lead.skills,
    usableItemIds: ["tonic"],
    bindIds: ["common_sigil"],
    menuIndex: 0,
    ...overrides,
  };
}

test("Strike matches the reference description and physical type", () => {
  const details = resolveBattleActionDetails(input());
  assert.equal(details.title, "Strike");
  assert.equal(details.description, "A basic physical attack.");
  assert.deepEqual(details.meta, [
    { label: "Type", value: "Physical" },
    { label: "Cost", value: "—" },
  ]);
  assert.equal(details.availability, "ready");
});

test("skill details come from SKILLS, including element, cost and status chance", () => {
  const details = skillDetails("cinder", 10);
  assert.equal(details.title, "Cinder");
  assert.equal(details.description, "A spit of live coal.");
  assert.ok(details.meta.some((entry) => entry.label === "Element" && entry.value === "Ember"));
  assert.ok(details.meta.some((entry) => entry.label === "Cost" && entry.value === "6 MP"));
  assert.ok(details.meta.some((entry) => entry.label === "Status" && entry.value === "Burn · 10%"));
  assert.equal(details.availability, "ready");
});

test("an unaffordable skill stays inspectable and explains the MP gap", () => {
  const details = skillDetails("cinder", 2);
  assert.equal(details.availability, "insufficient-mp");
  assert.match(details.note ?? "", /Need 6 MP · have 2/);
  assert.match(details.note ?? "", /does not spend MP/i);
});

test("skills submenu resolves the selected row, not the root command", () => {
  const skills = ["nip", "rootgrasp"];
  const details = resolveBattleActionDetails(input({ phase: "skills", menuIndex: 1, skillIds: skills }));
  assert.equal(details.title, "Rootgrasp");
  assert.match(details.description, /Roots hold fast/);
});

test("unknown or missing skill/item data fails safely", () => {
  assert.equal(skillDetails("not_a_skill", 10).availability, "unavailable");
  assert.equal(itemDetails("not_an_item", {}).availability, "unavailable");
  assert.equal(resolveBattleActionDetails(input({ phase: "skills", skillIds: [] })).availability, "unavailable");
});

test("Bind and Flee explain why a fixed encounter disables them", () => {
  const bind = commandDetails("Bind", input({ canBind: false }));
  assert.equal(bind.availability, "unavailable");
  assert.match(bind.description, /does not permit binding/i);

  const flee = commandDetails("Flee", input({ canFlee: false }));
  assert.equal(flee.availability, "unavailable");
  assert.match(flee.description, /no way out/i);
});

test("Bind with no sigils reports the empty pack without pretending it is illegal", () => {
  const details = commandDetails("Bind", input({ bindIds: [], inventory: {} }));
  assert.equal(details.availability, "no-effect");
  assert.match(details.note ?? "", /No binding sigils/i);
});

test("Party communicates a forced switch after a knockout", () => {
  const fainted: Beast = { ...lead, hp: 0 };
  const details = commandDetails("Party", input({ party: [fainted, reserve], playerIndex: 0 }));
  assert.equal(details.availability, "ready");
  assert.match(details.description, /has fallen/i);
  assert.match(details.note ?? "", /cannot be cancelled/i);
  assert.ok(details.meta.some((entry) => entry.label === "Switch" && entry.value === "Required"));
});

test("voluntary Party explains when nobody else can step in", () => {
  const details = commandDetails("Party", input({
    party: [{ ...lead, hp: currentStats(lead).hp }, { ...reserve, hp: 0 }],
    playerIndex: 0,
  }));
  assert.equal(details.availability, "no-effect");
  assert.match(details.note ?? "", /No other companion/i);
});

test("Item details show ownership and no-effect eligibility", () => {
  const ready = itemDetails("tonic", { tonic: 2 });
  assert.equal(ready.availability, "ready");
  assert.ok(ready.meta.some((entry) => entry.label === "Own" && entry.value === "×2"));
  const inert = itemDetails("tonic", { tonic: 2 }, false);
  assert.equal(inert.availability, "no-effect");
  assert.match(inert.note ?? "", /no effect/i);
});

test("every command resolver returns a usable label for assistive tech", () => {
  for (const command of ["Strike", "Skill", "Item", "Bind", "Party", "Flee"] as const) {
    const details = commandDetails(command, input());
    assert.ok(details.ariaLabel.length > 3, command);
    assert.ok(details.title.length > 0, command);
  }
});
