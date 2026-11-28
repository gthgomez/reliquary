/**
 * Repeatable headless adversarial balance and progression evaluator.
 * Measures exact species stat budgets, calculated stats, regional encounter
 * legality/difficulty, combat efficiency, binding odds, XP milestones,
 * economy balance, and boss match outcomes across player strategies.
 */
import { writeFileSync } from "node:fs";
import {
  SKILLS,
  SPECIES,
  ITEMS,
  PRACTICE_COST,
  PRACTICE_LORE,
  calcStats,
  currentStats,
  expToNext,
  makeBeast,
  typeMod,
} from "../src/game/content.ts";
import { MAPS } from "../src/game/maps.ts";
import { FIXED_ENCOUNTERS } from "../src/game/encounters.ts";
import { captureChance } from "../src/game/systems/capture.ts";
import { playerActsFirst, spendSkillMp } from "../src/game/systems/combat.ts";
import { applySkillEvents, resolveSkillUse } from "../src/game/systems/battle-engine.ts";
import { awardExperience } from "../src/game/systems/progression.ts";
import { analyzeEvolutionGraph } from "../src/game/systems/species-progression.ts";
import { dazeFumbles, tickStatus } from "../src/game/systems/status.ts";
import { wardenTeamLevels } from "../src/game/world/interactions.ts";

function createSeededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const ivs = { hp: 8, mp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8, lck: 8 };
const graph = analyzeEvolutionGraph(SPECIES);

function basicStrike(b) {
  return {
    id: "strike",
    name: "Strike",
    element: SPECIES[b.speciesId].elements[0],
    kind: "strike",
    power: 45,
    accuracy: 100,
    mp: 0,
    desc: "Plain blow",
  };
}

function chooseBestAttackSkill(atk, def, allowStatusHeal = true) {
  const spDef = SPECIES[def.speciesId];
  const skills = atk.skills.map((id) => SKILLS[id]).filter(Boolean);
  if (allowStatusHeal) {
    const maxHp = currentStats(atk).hp;
    if (atk.hp < maxHp * 0.38) {
      const heal = skills.find((s) => s.kind === "heal" && atk.mp >= s.mp);
      if (heal) return heal;
    }
  }
  let best = basicStrike(atk);
  let bestScore = best.power * typeMod(best.element, spDef.elements) * (SPECIES[atk.speciesId].elements.includes(best.element) ? 1.25 : 1);
  for (const s of skills) {
    if (s.mp > atk.mp || s.kind === "heal" || s.kind === "ward") continue;
    if (s.power === 0 && !allowStatusHeal) continue;
    const stab = SPECIES[atk.speciesId].elements.includes(s.element) ? 1.25 : 1;
    const score = (s.power || (s.status ? 25 : 0)) * stab * typeMod(s.element, spDef.elements);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function simulateDuel(teamA, teamB, seed = 1337, opts = {}) {
  const rng = createSeededRandom(seed);
  const partyA = teamA.map((b) => structuredClone(b));
  const partyB = teamB.map((b) => structuredClone(b));
  let idxA = 0;
  let idxB = 0;
  let turns = 0;
  const tonicStock = opts.tonics ?? 0;
  let tonicsUsed = 0;
  let potionsHpHealed = 0;

  while (idxA < partyA.length && idxB < partyB.length && turns < 100) {
    const a = partyA[idxA];
    const b = partyB[idxB];
    turns += 1;

    // Optional tactical switching to better element matchup on turn 1 or low HP.
    if (opts.tacticalSwitch && partyA.length > 1) {
      const curScore = Math.max(...SPECIES[a.speciesId].elements.map((e) => typeMod(e, SPECIES[b.speciesId].elements)));
      if (curScore < 1) {
        const bestIdx = partyA.findIndex(
          (cand, i) => i !== idxA && cand.hp > 0 && Math.max(...SPECIES[cand.speciesId].elements.map((e) => typeMod(e, SPECIES[b.speciesId].elements))) > curScore,
        );
        if (bestIdx >= 0) {
          idxA = bestIdx;
          const switched = partyA[idxA];
          const foeMove = chooseBestAttackSkill(b, switched, true);
          if (foeMove.mp) spendSkillMp(b, foeMove);
          applySkillEvents(b, switched, foeMove, resolveSkillUse(b, switched, foeMove, rng));
          if (switched.hp > 0) tickStatus(switched);
          if (b.hp > 0) tickStatus(b);
          if (switched.hp <= 0) idxA = partyA.findIndex((p) => p.hp > 0);
          if (idxA < 0) break;
          continue;
        }
      }
    }

    const first = playerActsFirst(a, b, rng);
    const runSide = (atk, def, allowTonic) => {
      if (atk.hp <= 0 || def.hp <= 0) return;
      if (allowTonic && tonicsUsed < tonicStock && atk.hp <= currentStats(atk).hp * 0.42) {
        tonicsUsed += 1;
        const maxHp = currentStats(atk).hp;
        const heal = Math.min(maxHp - atk.hp, opts.tonicPower ?? 40);
        atk.hp += heal;
        potionsHpHealed += heal;
        return;
      }
      if (dazeFumbles(atk, rng)) return;
      const move = allowTonic === false || !opts.casualStrikeOnly
        ? chooseBestAttackSkill(atk, def, !opts.casualStrikeOnly)
        : basicStrike(atk);
      if (move.mp) spendSkillMp(atk, move);
      applySkillEvents(atk, def, move, resolveSkillUse(atk, def, move, rng));
    };

    if (first) {
      runSide(a, b, opts.useTonics ?? false);
      runSide(b, a, false);
    } else {
      runSide(b, a, false);
      runSide(a, b, opts.useTonics ?? false);
    }

    if (a.hp > 0) tickStatus(a);
    if (b.hp > 0) tickStatus(b);
    if (b.hp <= 0) {
      idxB += 1;
    } else if (a.hp <= 0) {
      idxA = partyA.findIndex((p) => p.hp > 0);
      if (idxA < 0) break;
    }
  }

  const totalHpA = partyA.reduce((s, x) => s + currentStats(x).hp, 0);
  const remHpA = partyA.reduce((s, x) => s + Math.max(0, x.hp), 0);
  const totalMpA = partyA.reduce((s, x) => s + currentStats(x).mp, 0);
  const remMpA = partyA.reduce((s, x) => s + Math.max(0, x.mp), 0);
  return {
    won: idxB >= partyB.length && partyA.some((p) => p.hp > 0),
    turns,
    hpLostRatio: Number(((totalHpA - remHpA + potionsHpHealed) / totalHpA).toFixed(3)),
    mpUsed: totalMpA - remMpA,
    tonicsUsed,
    faints: partyA.filter((p) => p.hp <= 0).length,
  };
}

// 1. Category BST summary + Sample calculated stats
const categories = {};
for (const entry of Object.values(graph.entries)) {
  (categories[entry.category] ??= []).push({
    id: entry.id,
    bst: entry.bst,
    minAttainableLevel: entry.minAttainableLevel,
    lv5: calcStats(SPECIES[entry.id], 5, ivs, "calm"),
    lv12: calcStats(SPECIES[entry.id], 12, ivs, "calm"),
    lv16: calcStats(SPECIES[entry.id], 16, ivs, "calm"),
  });
}

const categorySummary = Object.fromEntries(
  Object.entries(categories).map(([cat, list]) => {
    const bsts = list.map((x) => x.bst);
    return [cat, {
      count: list.length,
      minBst: Math.min(...bsts),
      maxBst: Math.max(...bsts),
      avgBst: Number((bsts.reduce((a, b) => a + b, 0) / bsts.length).toFixed(1)),
      species: list.map((x) => `${x.id}(${x.bst})`),
    }];
  }),
);

// 2. Encounter audit + evolution violations
const belowThresholdViolations = [];
const encounterSummary = [];
const analyzeTable = (mapId, area, encounters, rate) => {
  if (!encounters.length) return;
  const totalW = encounters.reduce((s, e) => s + e.w, 0);
  let weightedLvl = 0;
  let weightedBst = 0;
  const items = [];
  for (const e of encounters) {
    const info = graph.entries[e.species];
    const p = e.w / totalW;
    const avgLvl = (e.min + e.max) / 2;
    weightedLvl += p * avgLvl;
    weightedBst += p * info.bst;
    if (e.min < info.minAttainableLevel && !e.exceptionalUnderLevel) {
      belowThresholdViolations.push({
        mapId,
        area,
        species: e.species,
        min: e.min,
        required: info.minAttainableLevel,
      });
    }
    items.push(`${e.species} Lv${e.min}-${e.max} (${(p * 100).toFixed(1)}%, BST ${info.bst})`);
  }
  encounterSummary.push({
    location: `${mapId}:${area}`,
    stepRate: rate,
    avgLevel: Number(weightedLvl.toFixed(2)),
    avgBst: Number(weightedBst.toFixed(1)),
    entries: items,
  });
};

for (const map of Object.values(MAPS)) {
  analyzeTable(map.id, "main", map.encounters, map.encounterRate);
  for (const reg of map.encounterRegions ?? []) {
    analyzeTable(map.id, reg.id, reg.encounters, reg.rate);
  }
}

// 3. XP & Milestone Curve Audit
const cumulativeXp = (from, to) => {
  let sum = 0;
  for (let l = from; l < to; l += 1) sum += expToNext(l);
  return sum;
};
const avgWildXp = (speciesList, avgLvl) =>
  speciesList.reduce((s, id) => s + Math.floor(SPECIES[id].expYield * avgLvl / 5), 0) / speciesList.length;

const briarAvgXp = avgWildXp(["dewslime", "mothwisp", "galeskip", "pebblet"], 4);
const woodAvgXp = avgWildXp(["rootwight", "hollowowl", "mothwisp"], 8);
const caveAvgXp = avgWildXp(["gravepup", "ironnewt", "pebblet"], 10);

const simStarter = makeBeast("emberkit", 5, { temperament: "calm", ivs });
let wildWinsBeforeEvo = 0;
while (simStarter.speciesId === "emberkit" && wildWinsBeforeEvo < 500) {
  wildWinsBeforeEvo += 1;
  awardExperience(simStarter, Math.round(wildWinsBeforeEvo < 10 ? briarAvgXp : woodAvgXp));
}

const fixedEncounterChecks = Object.entries(FIXED_ENCOUNTERS).map(([id, def]) =>
  evalMatchup(
    `fixed(${id}) vsLv11`,
    () => [makeBeast("emberkit", 11, { temperament: "calm", ivs }), makeBeast("mirewhelp", 11, { temperament: "calm", ivs })],
    () => def.foes.map((f) => makeBeast(f.speciesId, f.level, { temperament: "calm", ivs })),
    { tonics: 2, useTonics: true },
  ),
);

const milestones = {
  xp5To10: cumulativeXp(5, 10),
  xp5To12: cumulativeXp(5, 12),
  xp5To14: cumulativeXp(5, 14),
  xp5To16: cumulativeXp(5, 16),
  xp16To28: cumulativeXp(16, 28),
  xp16To32: cumulativeXp(16, 32),
  naturalWinsToFirstEvolution: wildWinsBeforeEvo,
  avgWildXpPerRegion: { briar: Number(briarAvgXp.toFixed(1)), wildwood: Number(woodAvgXp.toFixed(1)), ashenbarrow: Number(caveAvgXp.toFixed(1)) },
  soloBattlesToLv12: Math.ceil(cumulativeXp(5, 12) / woodAvgXp),
  soloBattlesToLv14: Math.ceil(cumulativeXp(5, 14) / woodAvgXp),
  soloBattlesToLv16: Math.ceil(cumulativeXp(5, 16) / woodAvgXp),
  practiceCostPerLv10: Number(((expToNext(10) / PRACTICE_LORE) * PRACTICE_COST).toFixed(1)),
};

// 4. Binding probability audit
const captureReport = ["dewslime", "gutterrat", "mothwisp", "galeskip", "pebblet", "rootwight", "sunhart", "fenwitch", "keepdrake"].map((id) => {
  const sp = SPECIES[id];
  const lvl = id === "dewslime" || id === "mothwisp" ? 4 : 9;
  const full = makeBeast(id, lvl, { temperament: "calm", ivs });
  const quarter = makeBeast(id, lvl, { temperament: "calm", ivs });
  quarter.hp = Math.max(1, Math.floor(currentStats(quarter).hp * 0.25));
  const statusQ = makeBeast(id, lvl, { temperament: "calm", ivs });
  statusQ.hp = quarter.hp;
  statusQ.status = "daze";
  return {
    id,
    catchRate: sp.catchRate,
    fullCommon: Number(captureChance(full, sp.catchRate, 1).toFixed(3)),
    quarterCommon: Number(captureChance(quarter, sp.catchRate, 1).toFixed(3)),
    quarterStatusCommon: Number(captureChance(statusQ, sp.catchRate, 1).toFixed(3)),
    quarterStatusThorn: Number(captureChance(statusQ, sp.catchRate, ITEMS.thorn_sigil.stone).toFixed(3)),
  };
});

// 5. Strategy & Starter vs Cael + Fixed Boss Simulations (20 seeds each)
function evalMatchup(name, makePlayerTeam, makeFoeTeam, opts = {}) {
  let wins = 0;
  let totalTurns = 0;
  let totalHpLost = 0;
  let totalFaints = 0;
  const seeds = 20;
  for (let s = 1; s <= seeds; s += 1) {
    const res = simulateDuel(makePlayerTeam(s), makeFoeTeam(), 1000 + s * 37, opts);
    if (res.won) wins += 1;
    totalTurns += res.turns;
    totalHpLost += res.hpLostRatio;
    totalFaints += res.faints;
  }
  return {
    name,
    winRate: Number((wins / seeds).toFixed(2)),
    avgTurns: Number((totalTurns / seeds).toFixed(1)),
    avgHpLostRatio: Number((totalHpLost / seeds).toFixed(2)),
    avgFaints: Number((totalFaints / seeds).toFixed(2)),
  };
}

const bossStrategies = [];
for (const starter of ["emberkit", "mirewhelp", "briarling"]) {
  // Casual solo or 2-mon at Lv 11 vs Cael
  bossStrategies.push(evalMatchup(
    `casual(${starter}+mothwisp Lv11) vs Cael`,
    () => [makeBeast(starter, 11, { temperament: "calm", ivs }), makeBeast("mothwisp", 10, { temperament: "calm", ivs })],
    () => {
      const lvls = wardenTeamLevels(11);
      return [
        makeBeast("ironnewt", lvls[0], { temperament: "warding", ivs }),
        makeBeast("chapelite", lvls[1], { temperament: "calm", ivs }),
        makeBeast("keepdrake", lvls[2], { temperament: "fierce", ivs }),
      ];
    },
    { casualStrikeOnly: false, tonics: 2, useTonics: true },
  ));
  // Solo Starter Lv 12 vs Cael
  bossStrategies.push(evalMatchup(
    `starterSolo(${starter} Lv12) vs Cael`,
    () => [makeBeast(starter, 12, { temperament: "calm", ivs })],
    () => {
      const lvls = wardenTeamLevels(12);
      return [
        makeBeast("ironnewt", lvls[0], { temperament: "warding", ivs }),
        makeBeast("chapelite", lvls[1], { temperament: "calm", ivs }),
        makeBeast("keepdrake", lvls[2], { temperament: "fierce", ivs }),
      ];
    },
    { tonics: 3, useTonics: true },
  ));
  // Balanced 3-beast Tactical Party Lv 12 vs Cael
  bossStrategies.push(evalMatchup(
    `balancedTactical(${starter}+pebblet+mothwisp Lv12) vs Cael`,
    () => [
      makeBeast(starter, 12, { temperament: "fierce", ivs }),
      makeBeast("pebblet", 12, { temperament: "warding", ivs }),
      makeBeast("mothwisp", 12, { temperament: "sage", ivs }),
    ],
    () => {
      const lvls = wardenTeamLevels(12);
      return [
        makeBeast("ironnewt", lvls[0], { temperament: "warding", ivs }),
        makeBeast("chapelite", lvls[1], { temperament: "calm", ivs }),
        makeBeast("keepdrake", lvls[2], { temperament: "fierce", ivs }),
      ];
    },
    { tacticalSwitch: true, tonics: 2, useTonics: true },
  ));
  // Underprepared Lv 8 rushing Cael
  bossStrategies.push(evalMatchup(
    `underprepared(${starter} Lv8) vs Cael`,
    () => [makeBeast(starter, 8, { temperament: "calm", ivs })],
    () => {
      const lvls = wardenTeamLevels(8);
      return [
        makeBeast("ironnewt", lvls[0], { temperament: "warding", ivs }),
        makeBeast("chapelite", lvls[1], { temperament: "calm", ivs }),
        makeBeast("keepdrake", lvls[2], { temperament: "fierce", ivs }),
      ];
    },
  ));
}

// Slime King & Briar Road check
const regionalBattles = [
  ...["emberkit", "mirewhelp", "briarling"].flatMap((st) => [
    evalMatchup(`briar(${st} Lv5 vs gutterrat Lv4)`, () => [makeBeast(st, 5, { temperament: "calm", ivs })], () => [makeBeast("gutterrat", 4, { temperament: "calm", ivs })]),
    evalMatchup(`briar(${st} Lv5 vs dewslime Lv4)`, () => [makeBeast(st, 5, { temperament: "calm", ivs })], () => [makeBeast("dewslime", 4, { temperament: "calm", ivs })]),
    evalMatchup(`briar(${st} Lv5 vs mothwisp Lv3)`, () => [makeBeast(st, 5, { temperament: "calm", ivs })], () => [makeBeast("mothwisp", 3, { temperament: "calm", ivs })]),
    evalMatchup(`briar(${st} Lv5 vs galeskip Lv3)`, () => [makeBeast(st, 5, { temperament: "calm", ivs })], () => [makeBeast("galeskip", 3, { temperament: "calm", ivs })]),
    evalMatchup(`briar(${st} Lv5 vs pebblet Lv4)`, () => [makeBeast(st, 5, { temperament: "calm", ivs })], () => [makeBeast("pebblet", 4, { temperament: "calm", ivs })]),
  ]),
  ...["emberkit", "mirewhelp", "briarling"].map((st) =>
    evalMatchup(`slimeKing(${st}+galeskip Lv11) vs Slime King`, () => [makeBeast(st, 11, { temperament: "calm", ivs }), makeBeast("galeskip", 10, { temperament: "keen", ivs })], () => [makeBeast("slime_king", 12, { temperament: "sage", ivs })], { tonics: 2, useTonics: true }),
  ),
  evalMatchup(
    "evolvedTactical(pyrefox+pebblet+mothwisp Lv14) vs Cael",
    () => [
      makeBeast("pyrefox", 14, { temperament: "fierce", ivs }),
      makeBeast("pebblet", 14, { temperament: "warding", ivs }),
      makeBeast("mothwisp", 14, { temperament: "sage", ivs }),
    ],
    () => {
      const lvls = wardenTeamLevels(14);
      return [
        makeBeast("ironnewt", lvls[0], { temperament: "warding", ivs }),
        makeBeast("chapelite", lvls[1], { temperament: "calm", ivs }),
        makeBeast("keepdrake", lvls[2], { temperament: "fierce", ivs }),
      ];
    },
    { tacticalSwitch: true, tonics: 2, useTonics: true },
  ),
  evalMatchup(
    "postTrial(pyrefox+riverguard+rootwight Lv14) vs GoblinKing",
    () => [
      makeBeast("pyrefox", 14, { temperament: "fierce", ivs }),
      makeBeast("riverguard", 14, { temperament: "warding", ivs }),
      makeBeast("rootwight", 14, { temperament: "calm", ivs }),
    ],
    () => [makeBeast("gravegnaw", 13, { temperament: "fierce", ivs }), makeBeast("rootwight", 14, { temperament: "warding", ivs })],
    { tacticalSwitch: true, tonics: 2, useTonics: true },
  ),
];

const report = {
  graphErrors: graph.errors,
  categorySummary,
  belowThresholdViolations,
  encounterSummary,
  milestones,
  captureReport,
  bossStrategies,
  fixedEncounterChecks,
  regionalBattles,
};

console.log(JSON.stringify(report, null, 2));
if (process.argv[2]) {
  writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
}
