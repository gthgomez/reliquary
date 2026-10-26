import type { Beast } from "../types.ts";

/** Reorder without cloning creatures or changing the remaining party order. */
export function moveToLead(party: Beast[], uid: string): Beast[] | null {
  const index = party.findIndex((beast) => beast.uid === uid);
  if (index <= 0 || party[index]!.hp <= 0) return null;
  return [party[index]!, ...party.slice(0, index), ...party.slice(index + 1)];
}

export function renameCreature(beast: Beast, value: string): Beast | null {
  const nickname = value.trim();
  if (!nickname || nickname.length > 40 || nickname === beast.nickname) return null;
  return { ...beast, nickname };
}

/** Keep one capable travelling companion and never exceed the four-beast party. */
export function transferBeast(
  party: Beast[],
  box: Beast[],
  uid: string,
  destination: "party" | "box",
): { party: Beast[]; box: Beast[] } | null {
  if (destination === "box") {
    const beast = party.find((item) => item.uid === uid);
    if (!beast || party.length <= 1 || !party.some((item) => item.uid !== uid && item.hp > 0))
      return null;
    return { party: party.filter((item) => item.uid !== uid), box: [...box, beast] };
  }
  const beast = box.find((item) => item.uid === uid);
  if (!beast || party.length >= 4 || party.some((item) => item.uid === uid)) return null;
  return { party: [...party, beast], box: box.filter((item) => item.uid !== uid) };
}
