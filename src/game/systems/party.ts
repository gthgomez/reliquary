import type { Beast } from "../types.ts";

/** Reorder without cloning creatures or changing the remaining party order. */
export function moveToLead(party: Beast[], uid: string): Beast[] | null {
  const index = party.findIndex((beast) => beast.uid === uid);
  if (index <= 0 || party[index]!.hp <= 0) return null;
  return [party[index]!, ...party.slice(0, index), ...party.slice(index + 1)];
}
