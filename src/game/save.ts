import { SAVE_BACKUP, SAVE_KEY, SAVE_VERSION, type GameSave } from "./types";

export function loadSave(): GameSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSave;
    if (!parsed || typeof parsed !== "object") return null;
    return migrate(parsed);
  } catch {
    try {
      const bak = localStorage.getItem(SAVE_BACKUP);
      if (!bak) return null;
      return migrate(JSON.parse(bak) as GameSave);
    } catch {
      return null;
    }
  }
}

function migrate(s: GameSave): GameSave {
  const next: GameSave = {
    version: SAVE_VERSION,
    playerName: s.playerName || "Rowan",
    mapId: s.mapId || "elderhall",
    x: s.x ?? 12,
    y: s.y ?? 14,
    dir: s.dir ?? 0,
    gold: s.gold ?? 0,
    playTime: s.playTime ?? 0,
    party: s.party ?? [],
    box: s.box ?? [],
    inventory: s.inventory ?? {},
    flags: s.flags ?? {},
    seen: s.seen ?? {},
    caught: s.caught ?? {},
  };
  return next;
}

export function writeSave(save: GameSave): boolean {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_BACKUP, prev);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...save, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_BACKUP);
  } catch {
    /* ignore */
  }
}
