import type { ReliquaryGame } from "../engine.ts";

/** Production stub — real battle UI probes ship only on browser-test builds. */
export function attachBattleUiBrowserHooks(
  _handle: import("../types.ts").ReliquaryHandle,
  _game: ReliquaryGame,
  _enabled: boolean,
): void {}
