import { makeBeast, SPECIES } from "../content.ts";
import type { ReliquaryGame } from "../engine.ts";
import type { BattleState, ReliquaryHandle } from "../types.ts";

type BattleUiBrowserHandle = ReliquaryHandle & {
  seedForcedSwitch?: (partySize?: number) => void;
  setBattlePhase?: (phase: BattleState["phase"]) => void;
  primeSkillMenu?: (mp?: number) => void;
  setBattleRestrictions?: (options: { canBind?: boolean; canFlee?: boolean }) => void;
  startBattleWith?: (playerSpeciesId?: string, foeSpeciesId?: string, levels?: [number, number]) => void;
};

/** Browser-regression hooks (stripped from production via __RELIQUARY_BROWSER_TEST__). */
export function attachBattleUiBrowserHooks(
  handle: ReliquaryHandle,
  game: ReliquaryGame,
  enabled: boolean,
): void {
  if (!enabled || typeof window === "undefined") return;
  const battleHandle = handle as BattleUiBrowserHandle;

  battleHandle.seedForcedSwitch = (partySize = 3) => {
    if (game.mode !== "battle" || !game.battle) {
      window.__controlsTest?.startWild?.();
    }
    const size = Math.max(2, Math.min(6, Math.floor(partySize)));
    while (game.party.length < size) {
      game.party.push(makeBeast("mirewhelp", 5));
    }
    game.party[0]!.hp = 0;
    (game as unknown as { playerDown(): void }).playerDown();
    game.emitPublic();
  };

  battleHandle.setBattlePhase = (phase: BattleState["phase"]) => {
    if (!game.battle) return;
    game.battle.phase = phase;
    game.battle.menuIndex = 0;
    game.emitPublic();
  };

  battleHandle.primeSkillMenu = (mp = 2) => {
    if (game.mode !== "battle" || !game.battle) {
      window.__controlsTest?.startWild?.();
    }
    const lead = game.party[game.battle!.playerIndex];
    if (lead) lead.mp = mp;
    game.battle!.phase = "skills";
    game.battle!.menuIndex = 0;
    game.menuIndex = 0;
    game.emitPublic();
  };

  battleHandle.setBattleRestrictions = ({ canBind, canFlee }) => {
    if (!game.battle) return;
    if (canBind != null) game.battle.canBind = canBind;
    if (canFlee != null) game.battle.canFlee = canFlee;
    game.battle.phase = "command";
    game.battle.menuIndex = 0;
    game.menuIndex = 0;
    game.emitPublic();
  };

  battleHandle.startBattleWith = (
    playerSpeciesId = "briarling",
    foeSpeciesId = "galeskip",
    levels: [number, number] = [5, 4],
  ) => {
    const [playerLevel, foeLevel] = levels;
    const lead = makeBeast(playerSpeciesId, playerLevel, {
      nickname: SPECIES[playerSpeciesId]?.name ?? playerSpeciesId,
    });
    game.party = [lead, ...game.party.slice(1)];
    game.mode = "world";
    (game as unknown as { startWildFrom(species: string, level: number): void }).startWildFrom(
      foeSpeciesId,
      foeLevel,
    );
    game.emitPublic();
  };
}
