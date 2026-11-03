import type { BattleState } from "../types";

const SUBMENU_PHASES = new Set<BattleState["phase"]>(["skills", "items", "party", "bind"]);

export function isBattleSubmenuPhase(phase: BattleState["phase"]): boolean {
  return SUBMENU_PHASES.has(phase);
}

/** Root class when a battle submenu should de-emphasize non-interactive status chrome. */
export function battleSubmenuRootClass(phase: BattleState["phase"] | undefined): string {
  return phase && isBattleSubmenuPhase(phase) ? " is-battle-submenu" : "";
}

export function battlePanelHeading(phase: BattleState["phase"]): string | null {
  switch (phase) {
    case "skills":
      return "Choose a skill";
    case "items":
      return "Choose an item";
    case "party":
      return "Send in a companion";
    case "bind":
      return "Choose a binding sigil";
    default:
      return null;
  }
}
