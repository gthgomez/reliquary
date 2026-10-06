import { SPECIES } from "../content.ts";
import type { BattleBg, BattleState, Beast } from "../types.ts";

export function createWildBattle(foe: Beast, bg: BattleBg, playerIndex: number): BattleState {
  return {
    kind: "wild",
    bg,
    playerIndex,
    foes: [foe],
    foeIndex: 0,
    log: [`A wild ${SPECIES[foe.speciesId]!.name} steps from the ${bg}.`],
    phase: "command",
    menuIndex: 0,
    pendingItem: null,
    pendingSwitch: false,
    shake: 0,
    catchStone: null,
    pendingXp: 0,
    escaped: false,
    canFlee: true,
  };
}

export function createTrialBattle(foes: Beast[], playerIndex: number, trainerName: string): BattleState {
  return {
    kind: "trial",
    bg: "keep",
    playerIndex,
    foes,
    foeIndex: 0,
    trainerName,
    log: [`${trainerName} sends out ${SPECIES[foes[0]!.speciesId]!.name}.`],
    phase: "command",
    menuIndex: 0,
    pendingItem: null,
    pendingSwitch: false,
    shake: 0,
    catchStone: null,
    pendingXp: 0,
    escaped: false,
    canFlee: false,
  };
}

export function activeBeast(battle: BattleState, party: Beast[]): Beast {
  return party[battle.playerIndex]!;
}

export function activeFoe(battle: BattleState): Beast {
  return battle.foes[battle.foeIndex]!;
}
