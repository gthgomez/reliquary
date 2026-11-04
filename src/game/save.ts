import { z } from "zod";
import { currentStats, ITEMS, MAX_LEVEL, SKILLS, SPECIES } from "./content.ts";
import { MAPS } from "./maps.ts";
import type { GameSave } from "./types.ts";
import { isOccupied } from "./world/movement.ts";
import { isLegacyCoordinateValid, resolveSafeSpawn } from "./world/reachability.ts";

export const SAVE_VERSION = 3;
export const WORLD_REVISION = 1;
export const SAVE_KEY = "reliquary.save.v3";
export const SAVE_BACKUP = "reliquary.save.v3.bak";
export const SAVE_FORWARD_KEY = "reliquary.save.forward";
export const LEGACY_SAVE_KEY = "reliquary.save.v2";
export const LEGACY_SAVE_BACKUP = "reliquary.save.v2.bak";
export const LEGACY_V1_KEY = "reliquary.save.v1";
export const LEGACY_V1_BACKUP = "reliquary.save.v1.bak";

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const statSchema = z.object({
  hp: z.number().finite().positive(), mp: z.number().finite().positive(),
  atk: z.number().finite().positive(), def: z.number().finite().positive(),
  mag: z.number().finite().positive(), res: z.number().finite().positive(),
  spd: z.number().finite().positive(), lck: z.number().finite().positive(),
}).strict();

const beastSchema = z.object({
  uid: z.string().min(1), speciesId: z.string().min(1), nickname: z.string().min(1).max(40),
  level: z.number().int().min(1).max(MAX_LEVEL), exp: z.number().finite().nonnegative(),
  hp: z.number().finite().nonnegative(), mp: z.number().finite().nonnegative(),
  ivs: statSchema, temperament: z.enum(["fierce", "warding", "keen", "sage", "stalwart", "lucid", "wild", "calm"]),
  skills: z.array(z.string().min(1)).max(4),
  pendingSkills: z.array(z.string().min(1)).max(16).optional(),
  status: z.enum(["burn", "soak", "bind", "daze", "ward", "bless"]).nullable(),
  statusTurns: z.number().int().nonnegative(),
}).strict();

const saveFields = {
  playerName: z.string().min(1).max(40), mapId: z.string().min(1),
  x: z.number().int(), y: z.number().int(), dir: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  gold: z.number().finite().int().nonnegative(), playTime: z.number().finite().nonnegative(),
  party: z.array(beastSchema).max(4), box: z.array(beastSchema),
  inventory: z.record(z.string().min(1), z.number().int().nonnegative()),
  flags: z.record(z.string(), z.boolean()), seen: z.record(z.string(), z.boolean()), caught: z.record(z.string(), z.boolean()),
};

export const GameSaveV1Schema = z.object({ version: z.literal(1), ...saveFields }).strict();
export const GameSaveV2Schema = z.object({ version: z.literal(2), ...saveFields }).strict();
export const GameSaveSchema = z
  .object({ version: z.literal(SAVE_VERSION), worldRevision: z.number().int(), ...saveFields })
  .strict();

function browserStorage(): SaveStorage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch { return null; }
}

function validateBeasts(save: Omit<GameSave, "version">): boolean {
  const ids = new Set<string>();
  for (const beast of [...save.party, ...save.box]) {
    if (ids.has(beast.uid) || !SPECIES[beast.speciesId]) return false;
    ids.add(beast.uid);
    if (beast.skills.some((skill) => !SKILLS[skill])) return false;
    if (beast.pendingSkills?.some((skill) => !SKILLS[skill])) return false;
    const stats = currentStats(beast);
    if (beast.hp > stats.hp || beast.mp > stats.mp) return false;
  }
  if (Object.keys(save.inventory).some((id) => !ITEMS[id])) return false;
  if (Object.keys(save.seen).some((id) => !SPECIES[id]) || Object.keys(save.caught).some((id) => !SPECIES[id])) return false;
  return true;
}

/**
 * How to treat the save's position during validation:
 * - "none": the coordinate must still be standable (same-revision corruption guard).
 * - "legacy": v1/v2 coordinates are untrusted — reject walls outright, then relocate.
 * - "relocated": the coordinate was valid when the save was written against an
 *   older world; trust it and let resolveSafeSpawn move it if the world moved.
 */
function validateSemantics(save: GameSave, options: { migrate?: "none" | "legacy" | "relocated" }): GameSave | null {
  const map = MAPS[save.mapId];
  if (!map) return null;
  if (!validateBeasts(save)) return null;
  let { x, y } = save;
  const migrate = options.migrate ?? "none";
  if (migrate === "legacy") {
    if (!isLegacyCoordinateValid(map, x, y)) return null;
    ({ x, y } = resolveSafeSpawn(map, { x, y }, save.flags));
  } else if (migrate === "relocated") {
    ({ x, y } = resolveSafeSpawn(map, { x, y }, save.flags));
  } else if (isOccupied(map, save.flags, x, y)) {
    return null;
  }
  return { ...save, x, y, version: SAVE_VERSION, worldRevision: WORLD_REVISION };
}

function migrateParsed(value: unknown): GameSave | null {
  if (!value || typeof value !== "object" || !("version" in value)) return null;
  const version = value.version;
  if (version === SAVE_VERSION) {
    const parsed = GameSaveSchema.safeParse(value);
    if (!parsed.success) return null;
    // A save written against an older world may stand where tiles have since
    // solidified: relocate it like the legacy paths instead of discarding it.
    const worldChanged = parsed.data.worldRevision !== WORLD_REVISION;
    return validateSemantics(parsed.data as GameSave, { migrate: worldChanged ? "relocated" : "none" });
  }
  if (version === 2) {
    const parsed = GameSaveV2Schema.safeParse(value);
    if (!parsed.success) return null;
    const draft = { ...parsed.data, version: SAVE_VERSION, worldRevision: WORLD_REVISION } as GameSave;
    return validateSemantics(draft, { migrate: "legacy" });
  }
  if (version === 1) {
    const parsed = GameSaveV1Schema.safeParse(value);
    if (!parsed.success) return null;
    const draft = { ...parsed.data, version: SAVE_VERSION, worldRevision: WORLD_REVISION } as GameSave;
    return validateSemantics(draft, { migrate: "legacy" });
  }
  return null;
}

export function parseSave(raw: string): GameSave | null {
  try { return migrateParsed(JSON.parse(raw)); } catch { return null; }
}

export function cloneSave(save: GameSave): GameSave {
  return structuredClone(save);
}

export function serializeSave(save: GameSave): string | null {
  const normalized = { ...save, version: SAVE_VERSION, worldRevision: WORLD_REVISION } as GameSave;
  if (!GameSaveSchema.safeParse(normalized).success) return null;
  const validated = validateSemantics(normalized, { migrate: "none" });
  if (!validated) return null;
  return JSON.stringify(validated);
}

export function loadSave(source: SaveStorage | null = browserStorage()): GameSave | null {
  if (!source) return null;
  for (const key of [SAVE_KEY, SAVE_BACKUP, LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP]) {
    try {
      const raw = source.getItem(key);
      if (!raw) continue;
      const save = parseSave(raw);
      if (save) return save;
    } catch {
      // Try the next recovery slot; a failing storage read must not crash boot.
    }
  }
  return null;
}

/**
 * Preserve a save written by a NEWER build before an older build overwrites
 * it: the primary slot would otherwise be destroyed by a version this build
 * cannot even parse. Best-effort — under quota the quarantine may fail.
 */
function quarantineForwardSave(target: SaveStorage, previous: string | null): void {
  if (previous === null) return;
  try {
    const parsed = JSON.parse(previous) as { version?: unknown } | null;
    if (parsed && typeof parsed.version === "number" && parsed.version > SAVE_VERSION) {
      target.setItem(SAVE_FORWARD_KEY, previous);
    }
  } catch {
    // An unreadable primary is not a forward save; nothing to preserve.
  }
}

export function writeSave(save: GameSave, target: SaveStorage | null = browserStorage()): boolean {
  if (!target) return false;
  const text = serializeSave(save);
  if (text === null) return false;
  let hadLegacySlots = false;
  try {
    const previous = target.getItem(SAVE_KEY) ?? target.getItem(LEGACY_SAVE_KEY) ?? target.getItem(LEGACY_V1_KEY);
    hadLegacySlots =
      target.getItem(LEGACY_SAVE_KEY) !== null
      || target.getItem(LEGACY_SAVE_BACKUP) !== null
      || target.getItem(LEGACY_V1_KEY) !== null
      || target.getItem(LEGACY_V1_BACKUP) !== null;
    quarantineForwardSave(target, previous);
    // Primary first: a failure here must leave every existing slot untouched.
    target.setItem(SAVE_KEY, text);
    // Backup rotation is best-effort — under quota a failed backup must not
    // undo a durable primary write.
    if (previous !== null && parseSave(previous) !== null) {
      try { target.setItem(SAVE_BACKUP, previous); } catch { /* primary is durable */ }
    }
    if (hadLegacySlots) {
      for (const key of [LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP]) {
        try { target.removeItem(key); } catch { /* keep going: primary is durable */ }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function hasSave(source: SaveStorage | null = browserStorage()): boolean {
  return loadSave(source) !== null;
}

export function clearSave(target: SaveStorage | null = browserStorage()): void {
  if (!target) return;
  for (const key of [SAVE_KEY, SAVE_BACKUP, SAVE_FORWARD_KEY, LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP]) {
    try { target.removeItem(key); } catch { /* storage unavailable */ }
  }
}
