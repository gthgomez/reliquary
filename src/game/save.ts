import { z } from "zod";
import { currentStats, ITEMS, MAX_LEVEL, SKILLS, SPECIES } from "./content.ts";
import { MAPS } from "./maps.ts";
import { MORPHOLOGY_MASS_MAX, MORPHOLOGY_MASS_MIN, MORPHOLOGY_SIZE_MAX, MORPHOLOGY_SIZE_MIN, NEUTRAL_MORPHOLOGY } from "./systems/morphology.ts";
import type { Beast, GameSave } from "./types.ts";
import { isOccupied } from "./world/movement.ts";
import { isLegacyCoordinateValid, resolveSafeSpawn } from "./world/reachability.ts";
import { ELDERHALL_WORLD_REVISION } from "./build-flags.ts";

export const SAVE_VERSION = 4;
export const SAVE_RESUMED_MESSAGE = "The lantern remembers.";
// Preview gate posts change collision; a preview save must not be silently
// mistaken for a compatible production-world save.
export const WORLD_REVISION = ELDERHALL_WORLD_REVISION;
export const SAVE_KEY = "reliquary.save.v3";
export const SAVE_BACKUP = "reliquary.save.v3.bak";
export const SAVE_FORWARD_KEY = "reliquary.save.forward";
export const LEGACY_SAVE_KEY = "reliquary.save.v2";
export const LEGACY_SAVE_BACKUP = "reliquary.save.v2.bak";
export const LEGACY_V1_KEY = "reliquary.save.v1";
export const LEGACY_V1_BACKUP = "reliquary.save.v1.bak";
const NAME_DRAFT_KEY = `reliquary.name-draft.${WORLD_REVISION}`;

const SAVE_SLOTS = [SAVE_KEY, SAVE_BACKUP, LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP];

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type ReadableSaveStorage = Pick<SaveStorage, "getItem"> & Partial<SaveStorage>;

const statSchema = z.object({
  hp: z.number().finite().positive(), mp: z.number().finite().positive(),
  atk: z.number().finite().positive(), def: z.number().finite().positive(),
  mag: z.number().finite().positive(), res: z.number().finite().positive(),
  spd: z.number().finite().positive(), lck: z.number().finite().positive(),
}).strict();

const morphologySchema = z.object({
  size: z.number().finite().min(MORPHOLOGY_SIZE_MIN).max(MORPHOLOGY_SIZE_MAX),
  mass: z.number().finite().min(MORPHOLOGY_MASS_MIN).max(MORPHOLOGY_MASS_MAX),
}).strict();

const speciesRecordSchema = z.object({
  smallestCm: z.number().finite().positive().optional(),
  largestCm: z.number().finite().positive().optional(),
  lightestKg: z.number().finite().positive().optional(),
  heaviestKg: z.number().finite().positive().optional(),
  encounteredMinCm: z.number().finite().positive().optional(),
  encounteredMaxCm: z.number().finite().positive().optional(),
  boundCount: z.number().int().nonnegative().optional(),
  defeatedCount: z.number().int().nonnegative().optional(),
}).strict();

const baseBeastFields = {
  uid: z.string().min(1), speciesId: z.string().min(1), nickname: z.string().min(1).max(40),
  level: z.number().int().min(1).max(MAX_LEVEL), exp: z.number().finite().nonnegative(),
  hp: z.number().finite().nonnegative(), mp: z.number().finite().nonnegative(),
  ivs: statSchema, temperament: z.enum(["fierce", "warding", "keen", "sage", "stalwart", "lucid", "wild", "calm"]),
  skills: z.array(z.string().min(1)).max(4),
  pendingSkills: z.array(z.string().min(1)).max(16).optional(),
  status: z.enum(["burn", "soak", "bind", "daze", "ward", "bless"]).nullable(),
  statusTurns: z.number().int().nonnegative(),
};

const beastSchema = z.object({
  ...baseBeastFields,
  morphology: morphologySchema.optional(),
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
export const GameSaveV3Schema = z.object({ version: z.literal(3), worldRevision: z.number().int(), ...saveFields }).strict();
export const GameSaveSchema = z
  .object({
    version: z.literal(SAVE_VERSION),
    worldRevision: z.number().int(),
    ...saveFields,
    habitats: z.record(z.string().min(1), z.array(z.string().min(1))).optional(),
    records: z.record(z.string().min(1), speciesRecordSchema).optional(),
    milestones: z.record(z.string().min(1), z.boolean()).optional(),
  })
  .strict();

function browserStorage(): SaveStorage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch { return null; }
}

// A draft is local and disposable. The committed save holds the companion's
// pending-offer flag so an absent, corrupt or mismatched draft cannot retarget it.
export function readNameDraft(uid: string, source: ReadableSaveStorage | null = browserStorage()): string | undefined {
  try {
    const raw = source?.getItem(NAME_DRAFT_KEY);
    if (!raw) return undefined;
    const draft = JSON.parse(raw);
    if (draft?.uid === uid && typeof draft.value === "string" && draft.value.length <= 40) return draft.value;
  } catch { /* An unavailable draft falls back to the current nickname. */ }
  return undefined;
}

export function writeNameDraft(uid: string, value: string | null, target: SaveStorage | null = browserStorage()): void {
  try {
    if (value !== null) target?.setItem(NAME_DRAFT_KEY, JSON.stringify({ uid, value }));
    else if (readNameDraft(uid, target) !== undefined) target?.removeItem(NAME_DRAFT_KEY);
  } catch { /* Draft storage cannot prevent in-memory naming. */ }
}

function normalizeBeasts(
  save: GameSave,
  clampOverflow: boolean,
): { party: GameSave["party"]; box: GameSave["box"] } | null {
  const ids = new Set<string>();
  const normalizeList = (list: GameSave["party"]): GameSave["party"] | null => {
    const out: GameSave["party"] = [];
    for (const beast of list) {
      if (ids.has(beast.uid) || !SPECIES[beast.speciesId]) return null;
      ids.add(beast.uid);
      if (beast.skills.some((skill) => !SKILLS[skill])) return null;
      if (beast.pendingSkills?.some((skill) => !SKILLS[skill])) return null;
      const morphology = beast.morphology ?? { ...NEUTRAL_MORPHOLOGY };
      const normalizedBeast: Beast = { ...beast, morphology };
      const stats = currentStats(normalizedBeast);
      if (normalizedBeast.hp > stats.hp || normalizedBeast.mp > stats.mp) {
        if (!clampOverflow) return null;
        out.push({ ...normalizedBeast, hp: Math.min(normalizedBeast.hp, stats.hp), mp: Math.min(normalizedBeast.mp, stats.mp) });
      } else {
        out.push(normalizedBeast);
      }
    }
    return out;
  };
  const party = normalizeList(save.party);
  const box = party ? normalizeList(save.box) : null;
  if (!party || !box) return null;
  if (Object.keys(save.inventory).some((id) => !ITEMS[id])) return null;
  if (Object.keys(save.seen).some((id) => !SPECIES[id]) || Object.keys(save.caught).some((id) => !SPECIES[id])) return null;
  if (save.habitats && Object.keys(save.habitats).some((id) => !SPECIES[id])) return null;
  if (save.records && Object.keys(save.records).some((id) => !SPECIES[id])) return null;
  return { party, box };
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
  const migrate = options.migrate ?? "none";
  const normalizedBeasts = normalizeBeasts(save, migrate !== "none");
  if (!normalizedBeasts) return null;
  let { x, y } = save;
  if (migrate === "legacy") {
    if (!isLegacyCoordinateValid(map, x, y)) return null;
    ({ x, y } = resolveSafeSpawn(map, { x, y }, save.flags));
  } else if (migrate === "relocated") {
    // Preserve a valid old location even when it is disconnected from the
    // current default spawn; only moved or obstructed tiles need relocation.
    if (isOccupied(map, save.flags, x, y)) ({ x, y } = resolveSafeSpawn(map, { x, y }, save.flags));
  } else if (isOccupied(map, save.flags, x, y)) {
    return null;
  }
  return { ...save, ...normalizedBeasts, x, y, version: SAVE_VERSION, worldRevision: WORLD_REVISION };
}

function migrateParsed(value: unknown): GameSave | null {
  if (!value || typeof value !== "object" || !("version" in value)) return null;
  const version = value.version;
  if (version === SAVE_VERSION) {
    const parsed = GameSaveSchema.safeParse(value);
    if (!parsed.success) return null;
    if (parsed.data.worldRevision > WORLD_REVISION) return null;
    // A save written against an older world may stand where tiles have since
    // solidified: relocate it like the legacy paths instead of discarding it.
    const worldChanged = parsed.data.worldRevision < WORLD_REVISION;
    return validateSemantics(parsed.data as GameSave, { migrate: worldChanged ? "relocated" : "none" });
  }
  if (version === 3) {
    const parsed = GameSaveV3Schema.safeParse(value);
    if (!parsed.success) return null;
    if (parsed.data.worldRevision > WORLD_REVISION) return null;
    const worldChanged = parsed.data.worldRevision < WORLD_REVISION;
    const draft = { ...parsed.data, version: SAVE_VERSION, worldRevision: WORLD_REVISION } as GameSave;
    return validateSemantics(draft, { migrate: worldChanged ? "relocated" : "none" });
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
  if (save.version > SAVE_VERSION || (save.worldRevision ?? WORLD_REVISION) > WORLD_REVISION) return null;
  const normalized = { ...save, version: SAVE_VERSION, worldRevision: WORLD_REVISION } as GameSave;
  if (!GameSaveSchema.safeParse(normalized).success) return null;
  const validated = validateSemantics(normalized, { migrate: "none" });
  if (!validated) return null;
  return JSON.stringify(validated);
}

export function loadSave(source: ReadableSaveStorage | null = browserStorage()): GameSave | null {
  if (!source) return null;
  for (const key of SAVE_SLOTS) {
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

function isForwardSave(raw: string): boolean {
  let parsed: { version?: unknown; worldRevision?: unknown } | null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Unreadable JSON is not a known forward save; nothing to preserve.
    return false;
  }
  return Boolean(parsed && (
    typeof parsed.version === "number" && parsed.version > SAVE_VERSION
    || typeof parsed.worldRevision === "number" && parsed.worldRevision > WORLD_REVISION
  ));
}

/** Return exact bytes for export, including a newer save preserved by a previous write. */
export function findNewerSave(source: ReadableSaveStorage | null = browserStorage()): string | null {
  if (!source) return null;
  for (const key of [...SAVE_SLOTS, SAVE_FORWARD_KEY]) {
    try {
      const raw = source.getItem(key);
      if (raw && isForwardSave(raw)) return raw;
    } catch {
      // An unavailable slot must not hide a newer record in another slot.
    }
  }
  return null;
}

/** A rollback can archive a record that the restored build can now import. */
export function findArchivedSave(source: ReadableSaveStorage | null = browserStorage()): string | null {
  try {
    const raw = source?.getItem(SAVE_FORWARD_KEY);
    return raw && parseSave(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Preserve a save written by a NEWER build before an older build overwrites
 * it: a primary or backup slot would otherwise be destroyed by a version
 * this build cannot even parse. Refuse the overwrite unless an exact copy
 * is preserved; a different forward archive must not be displaced.
 */
function protectForwardSave(
  target: SaveStorage,
  previous: string | null,
): "safe" | "archive-occupied" | "storage-failed" {
  if (previous === null || !isForwardSave(previous)) return "safe";
  // Storage errors propagate to writeSave's failure handler before any primary
  // write, backup rotation or legacy cleanup can occur.
  const archived = target.getItem(SAVE_FORWARD_KEY);
  if (archived !== null) return archived === previous ? "safe" : "archive-occupied";
  target.setItem(SAVE_FORWARD_KEY, previous);
  return target.getItem(SAVE_FORWARD_KEY) === previous ? "safe" : "storage-failed";
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
    if (protectForwardSave(target, previous) !== "safe") return false;
    const hasBackupCandidate = previous !== null && parseSave(previous) !== null;
    // A distinct newer backup can stay in its slot while the player saves
    // their active run. A failed attempt to preserve the backup still vetoes
    // the write before any durable primary change.
    const backupProtection = hasBackupCandidate
      ? protectForwardSave(target, target.getItem(SAVE_BACKUP))
      : "safe";
    if (backupProtection === "storage-failed") return false;
    // Write the primary before rotating backups or removing legacy slots.
    target.setItem(SAVE_KEY, text);
    // Backup rotation is best-effort — under quota a failed backup must not
    // undo a durable primary write.
    if (hasBackupCandidate && backupProtection === "safe") {
      try { target.setItem(SAVE_BACKUP, previous); } catch { /* primary is durable */ }
    }
    if (hadLegacySlots) {
      for (const key of [LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP]) {
        try {
          const legacy = target.getItem(key);
          // Unknown forward records keep their original slot. Cleanup must not
          // discard them or compete with a different record in the archive.
          if (legacy !== null && !isForwardSave(legacy)) target.removeItem(key);
        } catch { /* retain unreadable legacy slots: primary is durable */ }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function hasSave(source: ReadableSaveStorage | null = browserStorage()): boolean {
  return loadSave(source) !== null;
}

export function clearSave(target: SaveStorage | null = browserStorage()): void {
  if (!target) return;
  for (const key of [SAVE_KEY, SAVE_BACKUP, SAVE_FORWARD_KEY, LEGACY_SAVE_KEY, LEGACY_SAVE_BACKUP, LEGACY_V1_KEY, LEGACY_V1_BACKUP, NAME_DRAFT_KEY]) {
    try { target.removeItem(key); } catch { /* storage unavailable */ }
  }
}
