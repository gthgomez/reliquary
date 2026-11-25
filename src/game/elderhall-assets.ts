/** The environment inventory used by the runtime, pack exporter and browser gates. */
export const ELDERHALL_ENVIRONMENT_IDS = [
  "grass-atlas", "dirt-atlas", "stone-atlas", "well-reference", "cottage-reference",
  "guild-reference", "shop-reference", "tree-reference", "gate-reference", "bench", "flowers", "inn",
] as const;

export function elderhallEnvironmentUrl(id: string): string {
  return `/game/elderhall/assets/elderhall.${id}.png`;
}
