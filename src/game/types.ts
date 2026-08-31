export type ElementId =
  | "ember"
  | "tide"
  | "verdant"
  | "stone"
  | "gale"
  | "light"
  | "umbra"
  | "steel";

export type SkillKind = "strike" | "spell" | "ward" | "hex" | "heal";

export type StatusId = "burn" | "soak" | "bind" | "daze" | "ward" | "bless";

export type Temperament =
  | "fierce"
  | "warding"
  | "keen"
  | "sage"
  | "stalwart"
  | "lucid"
  | "wild"
  | "calm";

export type Dir = 0 | 1 | 2 | 3; // down, left, right, up

export type Mode =
  | "boot"
  | "title"
  | "starter"
  | "world"
  | "dialog"
  | "menu"
  | "battle"
  | "shop"
  | "inn"
  | "party"
  | "reliquary"
  | "items"
  | "beast"
  | "victory";

export type BattleBg = "grass" | "forest" | "cave" | "marsh" | "keep";

export interface Stats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  lck: number;
}

export interface Skill {
  id: string;
  name: string;
  element: ElementId;
  kind: SkillKind;
  power: number;
  accuracy: number;
  mp: number;
  desc: string;
  status?: StatusId;
  statusChance?: number;
  drain?: number;
}

export interface Species {
  id: string;
  name: string;
  epithet: string;
  elements: ElementId[];
  base: Stats;
  catchRate: number;
  expYield: number;
  description: string;
  learnset: { level: number; skill: string }[];
  evolves?: { level: number; into: string };
}

export interface Beast {
  uid: string;
  speciesId: string;
  nickname: string;
  level: number;
  exp: number;
  hp: number;
  mp: number;
  ivs: Stats;
  temperament: Temperament;
  skills: string[];
  status: StatusId | null;
  statusTurns: number;
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: "heal" | "ether" | "status" | "revive" | "sigil" | "key" | "field";
  power?: number;
  stone?: number;
}

export interface MapObj {
  id: string;
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  foot: number;
  solid: boolean;
  interact?: string;
}

export interface MapNpc {
  id: string;
  sprite: string;
  x: number;
  y: number;
  name: string;
  talk: string;
}

export interface MapWarp {
  x: number;
  y: number;
  to: string;
  tx: number;
  ty: number;
  dir?: Dir;
}

export interface Encounter {
  species: string;
  min: number;
  max: number;
  w: number;
}

export interface MapDef {
  id: string;
  name: string;
  region: string;
  ground: string[];
  battleBg: BattleBg;
  encounterRate: number;
  encounters: Encounter[];
  objects: MapObj[];
  npcs: MapNpc[];
  warps: MapWarp[];
  spawn: { x: number; y: number };
}

export interface BattleState {
  kind: "wild" | "warden" | "trial";
  bg: BattleBg;
  playerIndex: number;
  foes: Beast[];
  foeIndex: number;
  trainerName?: string;
  log: string[];
  phase:
    | "intro"
    | "command"
    | "skills"
    | "items"
    | "party"
    | "bind"
    | "anim"
    | "win"
    | "lose"
    | "catch";
  menuIndex: number;
  shake: number;
  catchStone: string | null;
  pendingXp: number;
  escaped: boolean;
  canFlee: boolean;
}

export interface GameSave {
  version: number;
  playerName: string;
  mapId: string;
  x: number;
  y: number;
  dir: Dir;
  gold: number;
  playTime: number;
  party: Beast[];
  box: Beast[];
  inventory: Record<string, number>;
  flags: Record<string, boolean>;
  seen: Record<string, boolean>;
  caught: Record<string, boolean>;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = "reliquary.save.v1";
export const SAVE_BACKUP = "reliquary.save.v1.bak";

export interface DialogView {
  speaker: string;
  text: string;
  last: boolean;
}

export interface Snapshot {
  mode: Mode;
  loadProgress: number;
  viewW: number;
  viewH: number;
  cssW: number;
  cssH: number;
  mapName: string;
  region: string;
  gold: number;
  party: Beast[];
  box: Beast[];
  inventory: Record<string, number>;
  flags: Record<string, boolean>;
  seen: Record<string, boolean>;
  caught: Record<string, boolean>;
  dialog: DialogView | null;
  menu: string | null;
  menuIndex: number;
  battle: BattleState | null;
  toast: string | null;
  selectedUid: string | null;
  shopIndex: number;
  shopMode: "buy" | "sell";
  shopStock: string[];
  hasSave: boolean;
  items: Record<string, ItemDef>;
}

export interface ReliquaryHandle {
  confirm: () => void;
  cancel: () => void;
  startNew: () => void;
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
      getPos?: () => { map: string; x: number; y: number; mode: string; dialog: boolean };
      warp?: (map: string, x: number, y: number) => void;
      startWild?: () => void;
    };
    __reliquary?: ReliquaryHandle;
  }
}
