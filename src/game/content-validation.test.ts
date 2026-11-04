import assert from "node:assert/strict";
import { test } from "node:test";
import { ELEMENTS, ITEMS, SKILLS, SPECIES } from "./content.ts";
import { FIXED_ENCOUNTERS } from "./encounters.ts";
import { MAPS } from "./maps.ts";
import { assertContentValid, validateContent, type ContentTables } from "./content-validation.ts";

test("Hollowmere content references are internally consistent", () => {
  assert.doesNotThrow(assertContentValid);
});

/** Real tables with one entry surgically broken, so each test isolates one rule. */
function tablesWith(patch: Partial<ContentTables>): ContentTables {
  return {
    ELEMENTS: patch.ELEMENTS ?? ELEMENTS,
    SPECIES: patch.SPECIES ?? SPECIES,
    SKILLS: patch.SKILLS ?? SKILLS,
    ITEMS: patch.ITEMS ?? ITEMS,
    MAPS: patch.MAPS ?? MAPS,
    FIXED_ENCOUNTERS: patch.FIXED_ENCOUNTERS ?? FIXED_ENCOUNTERS,
  };
}

function errorsAbout(errors: string[], needle: string): string[] {
  return errors.filter((line) => line.includes(needle));
}

test("a learnset with an unknown skill, a bad order, or an over-cap level is rejected", () => {
  const base = SPECIES.emberkit!;
  const broken = {
    ...base,
    learnset: [
      ...base.learnset,
      { level: 3, skill: "no-such-skill" },
      { level: 2, skill: base.learnset[0]!.skill },
      { level: 99, skill: base.learnset[0]!.skill },
    ],
  };
  const errors = validateContent(tablesWith({ SPECIES: { ...SPECIES, emberkit: broken } }));
  assert.equal(errorsAbout(errors, "emberkit").length >= 3, true, errors.join("\n"));
});

test("an evolution into an unknown species is rejected", () => {
  const base = SPECIES.emberkit!;
  const broken = { ...base, evolves: { ...(base.evolves ?? { level: 16 }), into: "not-a-species", level: 16 } };
  const errors = validateContent(tablesWith({ SPECIES: { ...SPECIES, emberkit: broken } }));
  assert.ok(errorsAbout(errors, "invalid evolution").length >= 1, errors.join("\n"));
});

test("a skill with an impossible accuracy or unknown element is rejected", () => {
  const base = SKILLS.nip!;
  const errors = validateContent(tablesWith({
    SKILLS: {
      ...SKILLS,
      nip: { ...base, accuracy: 101 },
      cinderBad: { ...base, id: "cinderBad", element: "not-an-element" } as unknown as typeof base,
    },
  }));
  assert.ok(errorsAbout(errors, "skill nip").length >= 1, errors.join("\n"));
  assert.ok(errorsAbout(errors, "skill cinderBad").length >= 1, errors.join("\n"));
});

test("an item with a negative price or unknown kind is rejected", () => {
  const base = ITEMS.tonic!;
  const errors = validateContent(tablesWith({
    ITEMS: {
      ...ITEMS,
      tonic: { ...base, price: -1 },
      ghostItem: { ...base, id: "ghostItem", kind: "not-a-kind" } as unknown as typeof base,
    },
  }));
  assert.ok(errorsAbout(errors, "item tonic").length >= 1, errors.join("\n"));
  assert.ok(errorsAbout(errors, "item ghostItem").length >= 1, errors.join("\n"));
});

test("a warp to an unknown map or onto a solid destination tile is rejected", () => {
  const elderhall = MAPS.elderhall!;
  const [firstWarp] = elderhall.warps;
  assert.ok(firstWarp, "fixture expects elderhall to have a warp");
  const unknownMap = { ...elderhall, id: "elderhall", warps: [{ ...firstWarp, to: "not-a-map" }] };
  assert.ok(validateContent(tablesWith({ MAPS: { ...MAPS, elderhall: unknownMap } })).some((line) => line.includes("invalid warp")));
  const solidDest = { ...elderhall, id: "elderhall", warps: [{ ...firstWarp, tx: 9_999, ty: 9_999 }] };
  assert.ok(validateContent(tablesWith({ MAPS: { ...MAPS, elderhall: solidDest } })).some((line) => line.includes("invalid warp")));
});

test("an encounter referencing an unknown species or an over-cap level is rejected", () => {
  const elderhall = MAPS.elderhall!;
  const [firstEncounter] = elderhall.encounters;
  if (firstEncounter) {
    const unknownSpecies = { ...elderhall, id: "elderhall", encounters: [{ ...firstEncounter, species: "not-a-species" }] };
    assert.ok(validateContent(tablesWith({ MAPS: { ...MAPS, elderhall: unknownSpecies } })).some((line) => line.includes("invalid encounter")));
    const capped = { ...elderhall, id: "elderhall", encounters: [{ ...firstEncounter, max: 99 }] };
    assert.ok(validateContent(tablesWith({ MAPS: { ...MAPS, elderhall: capped } })).some((line) => line.includes("invalid encounter")));
  }
});

test("a fixed encounter on an unknown map is rejected", () => {
  const [firstKey] = Object.keys(FIXED_ENCOUNTERS);
  assert.ok(firstKey, "fixture expects at least one fixed encounter");
  const base = FIXED_ENCOUNTERS[firstKey!]!;
  const broken = { ...FIXED_ENCOUNTERS, [firstKey!]: { ...base, mapId: "not-a-map" } };
  assert.ok(validateContent(tablesWith({ FIXED_ENCOUNTERS: broken })).some((line) => line.includes("unknown map")));
});
