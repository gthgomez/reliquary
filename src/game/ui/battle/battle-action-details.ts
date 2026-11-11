import { currentStats, ELEMENTS, ITEMS, SKILLS, SPECIES } from "../../content.ts";
import { STATUS_NAMES } from "../../systems/status.ts";
import { skillMpHint } from "../ui-chrome.ts";
import type { Beast, BattleState, ItemDef, Skill, SkillKind } from "../../types.ts";
import type { BattleCommand } from "../../world/encounters.ts";

export type ActionDetailMeta = { label: string; value: string };

export type ActionAvailability = "ready" | "unavailable" | "insufficient-mp" | "no-effect";

export type ActionDetails = {
  title: string;
  description: string;
  meta: ActionDetailMeta[];
  chips: string[];
  availability: ActionAvailability;
  note: string | null;
  ariaLabel: string;
};

export type BattleDetailsInput = {
  phase: BattleState["phase"];
  /** Root command currently focused. */
  command: BattleCommand;
  canBind: boolean;
  canFlee: boolean;
  playerIndex: number;
  party: Beast[];
  inventory: Record<string, number>;
  skillIds: string[];
  usableItemIds: string[];
  bindIds: string[];
  menuIndex: number;
  /** Optional engine-owned eligibility for battle items. */
  itemEligible?: (id: string) => boolean;
};

const SKILL_KIND_LABEL: Record<SkillKind, string> = {
  strike: "Physical",
  spell: "Spell",
  ward: "Ward",
  hex: "Hex",
  heal: "Restoration",
};

const ITEM_KIND_LABEL: Record<ItemDef["kind"], string> = {
  heal: "Healing",
  ether: "Ether",
  status: "Remedy",
  revive: "Revive",
  sigil: "Binding sigil",
  key: "Key item",
  field: "Field item",
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function skillDetails(skillId: string, currentMp: number): ActionDetails {
  const skill: Skill | undefined = SKILLS[skillId];
  if (!skill) {
    return {
      title: "Unknown technique",
      description: "This technique is no longer in the record.",
      meta: [],
      chips: [],
      availability: "unavailable",
      note: null,
      ariaLabel: "Unknown technique",
    };
  }
  const affordable = currentMp >= skill.mp;
  const meta: ActionDetailMeta[] = [
    { label: "Type", value: SKILL_KIND_LABEL[skill.kind] ?? titleCase(skill.kind) },
    { label: "Element", value: ELEMENTS[skill.element]?.name ?? titleCase(skill.element) },
  ];
  if (skill.power > 0) meta.push({ label: "Power", value: String(skill.power) });
  if (skill.accuracy < 100) meta.push({ label: "Accuracy", value: `${skill.accuracy}%` });
  meta.push({ label: "Cost", value: skill.mp > 0 ? `${skill.mp} MP` : "—" });
  if (skill.status) {
    const chance = skill.statusChance != null ? ` · ${skill.statusChance}%` : "";
    meta.push({ label: "Status", value: `${STATUS_NAMES[skill.status]}${chance}` });
  }
  return {
    title: skill.name,
    description: skill.desc,
    meta,
    chips: [ELEMENTS[skill.element]?.name ?? titleCase(skill.element), SKILL_KIND_LABEL[skill.kind] ?? titleCase(skill.kind)],
    availability: affordable ? "ready" : "insufficient-mp",
    note: affordable ? null : `${skillMpHint(currentMp, skill.mp)} — inspecting does not spend MP.`,
    ariaLabel: `${skill.name}. ${skill.desc} ${affordable ? `${skill.mp} MP` : `${skillMpHint(currentMp, skill.mp)}`}.`,
  };
}

export function itemDetails(
  itemId: string,
  inventory: Record<string, number>,
  eligible = true,
): ActionDetails {
  const item = ITEMS[itemId];
  if (!item) {
    return {
      title: "Unknown item",
      description: "This item is no longer in the pack.",
      meta: [],
      chips: [],
      availability: "unavailable",
      note: null,
      ariaLabel: "Unknown item",
    };
  }
  const owned = inventory[itemId] ?? 0;
  const effectLabel = item.kind === "heal" || item.kind === "ether"
    ? "Restores"
    : item.kind === "status"
      ? "Clears"
      : item.kind === "revive"
        ? "Revives"
        : item.kind === "field"
          ? "Duration"
          : "Effect";
  return {
    title: item.name,
    description: item.desc,
    meta: [
      { label: "Type", value: ITEM_KIND_LABEL[item.kind] ?? titleCase(item.kind) },
      { label: "Own", value: `×${owned}` },
      ...(item.power != null && item.kind !== "sigil" ? [{ label: effectLabel, value: String(item.power) }] : []),
    ],
    chips: [ITEM_KIND_LABEL[item.kind] ?? titleCase(item.kind)],
    availability: eligible ? "ready" : "no-effect",
    note: eligible ? null : "That item would have no effect right now.",
    ariaLabel: `${item.name}. ${item.desc} Owned ${owned}.`,
  };
}

export function bindDetails(itemId: string, inventory: Record<string, number>): ActionDetails {
  const item = ITEMS[itemId];
  const owned = inventory[itemId] ?? 0;
  if (!item) {
    return {
      title: "Binding sigil",
      description: "No sigil is selected.",
      meta: [],
      chips: [],
      availability: "unavailable",
      note: "There are no binding sigils in the pack.",
      ariaLabel: "No binding sigil selected",
    };
  }
  return {
    title: item.name,
    description: item.desc,
    meta: [
      { label: "Type", value: "Binding sigil" },
      { label: "Own", value: `×${owned}` },
    ],
    chips: ["Binding"],
    availability: "ready",
    note: "A weakened wild beast is easier to bind.",
    ariaLabel: `${item.name}. ${item.desc} Owned ${owned}.`,
  };
}

export function partyDetails(
  index: number,
  party: Beast[],
  playerIndex: number,
): ActionDetails {
  const beast = party[index];
  if (!beast) {
    return {
      title: "Companions",
      description: party.length ? "Choose who steps forward." : "No companion answers the call.",
      meta: [],
      chips: [],
      availability: party.length ? "ready" : "unavailable",
      note: null,
      ariaLabel: "Companions",
    };
  }
  const stats = currentStats(beast);
  const species = SPECIES[beast.speciesId];
  const fainted = beast.hp <= 0;
  const active = index === playerIndex;
  return {
    title: beast.nickname,
    description: `${species?.epithet ?? "Companion"} · Lv ${beast.level}`,
    meta: [
      { label: "HP", value: `${beast.hp}/${stats.hp}` },
      { label: "MP", value: `${beast.mp}/${stats.mp}` },
      { label: "Elements", value: (species?.elements ?? []).map((e) => ELEMENTS[e]?.name ?? titleCase(e)).join(" / ") || "—" },
    ],
    chips: (species?.elements ?? []).map((e) => ELEMENTS[e]?.name ?? titleCase(e)),
    availability: fainted ? "unavailable" : active ? "no-effect" : "ready",
    note: fainted ? "Fainted — cannot take the field." : active ? "Already in battle." : null,
    ariaLabel: `${beast.nickname}, level ${beast.level}. ${beast.hp} of ${stats.hp} health. ${
      fainted ? "Fainted." : active ? "Already in battle." : "Ready to step in."
    }`,
  };
}

export function commandDetails(command: BattleCommand, input: BattleDetailsInput): ActionDetails {
  const active = input.party[input.playerIndex];
  switch (command) {
    case "Strike":
      return {
        title: "Strike",
        description: "A basic physical attack.",
        meta: [
          { label: "Type", value: "Physical" },
          { label: "Cost", value: "—" },
        ],
        chips: ["Physical"],
        availability: "ready",
        note: null,
        ariaLabel: "Strike. A basic physical attack.",
      };
    case "Skill": {
      const count = input.skillIds.length;
      return {
        title: "Skill",
        description: count
          ? "Spend MP on a learned technique."
          : "No techniques have been learned yet.",
        meta: [
          { label: "Techniques", value: String(count) },
          { label: "MP", value: active ? `${active.mp}/${currentStats(active).mp}` : "—" },
        ],
        chips: count ? ["Technique"] : [],
        availability: count ? "ready" : "no-effect",
        note: count ? null : "Skills are learned as your companions grow.",
        ariaLabel: count ? `Skill. ${count} techniques learned.` : "Skill. No techniques learned yet.",
      };
    }
    case "Item": {
      const count = input.usableItemIds.length;
      return {
        title: "Item",
        description: count
          ? "Use something from the pack."
          : "The pack holds nothing usable in battle.",
        meta: [{ label: "Usable", value: String(count) }],
        chips: count ? ["Pack"] : [],
        availability: count ? "ready" : "no-effect",
        note: count ? null : "Field items and revive ash are used outside battle.",
        ariaLabel: count ? `Item. ${count} usable items.` : "Item. No usable items in the pack.",
      };
    }
    case "Bind": {
      if (!input.canBind) {
        return {
          title: "Bind",
          description: "This encounter does not permit binding.",
          meta: [{ label: "Type", value: "Binding" }],
          chips: ["Binding"],
          availability: "unavailable",
          note: "Wardens and trial beasts cannot be bound.",
          ariaLabel: "Bind. Not permitted in this encounter.",
        };
      }
      const count = input.bindIds.length;
      return {
        title: "Bind",
        description: "Cast a sigil at a weakened wild beast.",
        meta: [
          { label: "Type", value: "Binding" },
          { label: "Sigils", value: String(count) },
        ],
        chips: ["Binding"],
        availability: count ? "ready" : "no-effect",
        note: count ? "Weaken the foe first; a full-health beast resists." : "No binding sigils in the pack.",
        ariaLabel: count ? `Bind. ${count} binding sigils available.` : "Bind. No binding sigils available.",
      };
    }
    case "Party": {
      const able = input.party.filter((beast) => beast.hp > 0).length;
      const forced = !!active && active.hp <= 0;
      return {
        title: "Party",
        description: forced ? "Your active companion has fallen. Choose who steps in." : "Send in another companion.",
        meta: [
          { label: "Able", value: `${able}/${input.party.length}` },
          { label: "Switch", value: forced ? "Required" : "Voluntary" },
        ],
        chips: [forced ? "Forced switch" : "Companions"],
        availability: able > 1 || forced ? "ready" : "no-effect",
        note: able > 1 || forced ? (forced ? "This choice cannot be cancelled." : null) : "No other companion can step in.",
        ariaLabel: forced
          ? "Party. A forced switch is required."
          : `Party. ${able} of ${input.party.length} companions able.`,
      };
    }
    case "Flee": {
      if (!input.canFlee) {
        return {
          title: "Flee",
          description: "There is no way out of this battle.",
          meta: [{ label: "Type", value: "Escape" }],
          chips: ["Escape"],
          availability: "unavailable",
          note: "Fixed encounters and trials must be seen through.",
          ariaLabel: "Flee. This encounter cannot be escaped.",
        };
      }
      return {
        title: "Flee",
        description: "Break away from the battle. A swift foe may cut off the path.",
        meta: [
          { label: "Type", value: "Escape" },
          { label: "Cost", value: "—" },
        ],
        chips: ["Escape"],
        availability: "ready",
        note: "Bound companions cannot flee.",
        ariaLabel: "Flee. Attempt to leave the battle.",
      };
    }
    default:
      return {
        title: command,
        description: "Choose an action.",
        meta: [],
        chips: [],
        availability: "ready",
        note: null,
        ariaLabel: command,
      };
  }
}

/**
 * Pure information resolver for the right-hand panel. Reads real definitions
 * and engine state; never resolves combat or advances a turn.
 */
export function resolveBattleActionDetails(input: BattleDetailsInput): ActionDetails {
  if (input.phase === "command") return commandDetails(input.command, input);
  if (input.phase === "skills") {
    const active = input.party[input.playerIndex];
    const skillId = input.skillIds[input.menuIndex];
    if (!active) return commandDetails("Skill", input);
    if (!skillId) {
      return {
        title: "Skills",
        description: "No techniques have been learned yet.",
        meta: [],
        chips: [],
        availability: "unavailable",
        note: null,
        ariaLabel: "No techniques learned",
      };
    }
    return skillDetails(skillId, active.mp);
  }
  if (input.phase === "items") {
    const itemId = input.usableItemIds[input.menuIndex];
    if (!itemId) {
      return {
        title: "Pack",
        description: "No usable items in the pack.",
        meta: [],
        chips: [],
        availability: "unavailable",
        note: null,
        ariaLabel: "No usable items",
      };
    }
    return itemDetails(itemId, input.inventory, input.itemEligible ? input.itemEligible(itemId) : true);
  }
  if (input.phase === "bind") {
    const itemId = input.bindIds[input.menuIndex];
    if (!itemId) {
      return {
        title: "Binding sigils",
        description: "No binding sigils in the pack.",
        meta: [],
        chips: ["Binding"],
        availability: "unavailable",
        note: null,
        ariaLabel: "No binding sigils",
      };
    }
    return bindDetails(itemId, input.inventory);
  }
  if (input.phase === "party") {
    return partyDetails(input.menuIndex, input.party, input.playerIndex);
  }
  return {
    title: input.phase === "win" ? "Victory" : input.phase === "lose" ? "Defeat" : "Battle",
    description: "The outcome is being recorded.",
    meta: [],
    chips: [],
    availability: "ready",
    note: null,
    ariaLabel: "Battle outcome",
  };
}
