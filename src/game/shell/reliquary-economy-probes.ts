import type { ReliquaryGame } from "../engine.ts";
import type { ReliquaryHandle } from "../types.ts";

/** Browser-regression / dev-only economy cheats (excluded from production bundles via Vite alias). */
export function attachEconomyProbes(handle: ReliquaryHandle, g: ReliquaryGame): void {
  handle.openShop = () => {
    g.mode = "shop";
    g.shopMode = "buy";
    g.shopIndex = 0;
    g.menu = null;
    g.emitPublic();
  };
  handle.getEconomy = () => ({
    gold: g.gold,
    inventory: { ...g.inventory },
  });
  handle.setGold = (gold: number) => {
    g.gold = gold;
    g.emitPublic();
  };
}
