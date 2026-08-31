import type {
  Beast,
  ElementId,
  ItemDef,
  Skill,
  Species,
  Stats,
  Temperament,
} from "./types.ts";
import { mathRandom, type RandomSource } from "./rng.ts";

export const ELEMENTS: Record<
  ElementId,
  { name: string; color: string; strong: ElementId[]; weak: ElementId[] }
> = {
  ember: { name: "Ember", color: "#b54a3c", strong: ["verdant", "steel"], weak: ["tide", "stone"] },
  tide: { name: "Tide", color: "#3d6e8a", strong: ["ember", "stone"], weak: ["verdant", "gale"] },
  verdant: { name: "Verdant", color: "#4a6b4a", strong: ["tide", "stone"], weak: ["ember", "umbra"] },
  stone: { name: "Stone", color: "#6e6862", strong: ["ember", "gale"], weak: ["tide", "verdant"] },
  gale: { name: "Gale", color: "#7a8a8a", strong: ["verdant", "umbra"], weak: ["stone", "steel"] },
  light: { name: "Light", color: "#d4c4a0", strong: ["umbra", "steel"], weak: ["umbra"] },
  umbra: { name: "Umbra", color: "#4a3d4e", strong: ["light", "verdant"], weak: ["light", "gale"] },
  steel: { name: "Steel", color: "#7a756c", strong: ["stone", "gale"], weak: ["ember", "light"] },
};

export function typeMod(atk: ElementId, defs: ElementId[]): number {
  let m = 1;
  const a = ELEMENTS[atk];
  for (const d of defs) {
    if (a.strong.includes(d)) m *= 1.75;
    else if (a.weak.includes(d)) m *= 0.5;
  }
  return m;
}

export const TEMPERAMENTS: Record<
  Temperament,
  { name: string; up: keyof Stats; down: keyof Stats }
> = {
  fierce: { name: "Fierce", up: "atk", down: "def" },
  warding: { name: "Warding", up: "def", down: "spd" },
  keen: { name: "Keen", up: "spd", down: "atk" },
  sage: { name: "Sage", up: "mag", down: "atk" },
  stalwart: { name: "Stalwart", up: "hp", down: "mag" },
  lucid: { name: "Lucid", up: "res", down: "atk" },
  wild: { name: "Wild", up: "lck", down: "def" },
  calm: { name: "Calm", up: "mp", down: "spd" },
};

export const SKILLS: Record<string, Skill> = {
  nip: { id: "nip", name: "Nip", element: "steel", kind: "strike", power: 40, accuracy: 100, mp: 0, desc: "A quick bite." },
  slash: { id: "slash", name: "Slash", element: "steel", kind: "strike", power: 55, accuracy: 100, mp: 0, desc: "A clean claw." },
  ram: { id: "ram", name: "Ram", element: "stone", kind: "strike", power: 50, accuracy: 95, mp: 0, desc: "A heavy shoulder." },
  thornlash: { id: "thornlash", name: "Thornlash", element: "verdant", kind: "strike", power: 65, accuracy: 95, mp: 8, desc: "Briars whip the foe." },
  ironbite: { id: "ironbite", name: "Ironbite", element: "steel", kind: "strike", power: 80, accuracy: 90, mp: 12, desc: "Jaws like a portcullis." },
  stonefist: { id: "stonefist", name: "Stonefist", element: "stone", kind: "strike", power: 75, accuracy: 90, mp: 10, desc: "A cobble-hard blow." },
  galepeck: { id: "galepeck", name: "Galepeck", element: "gale", kind: "strike", power: 60, accuracy: 100, mp: 6, desc: "A wind-carried strike." },
  shadowclaw: { id: "shadowclaw", name: "Shadowclaw", element: "umbra", kind: "strike", power: 70, accuracy: 95, mp: 10, desc: "A claw from nowhere." },
  cinder: { id: "cinder", name: "Cinder", element: "ember", kind: "spell", power: 45, accuracy: 100, mp: 6, desc: "A spit of live coal.", status: "burn", statusChance: 10 },
  flare: { id: "flare", name: "Flare", element: "ember", kind: "spell", power: 80, accuracy: 95, mp: 14, desc: "A blooming of flame.", status: "burn", statusChance: 20 },
  crownfire: { id: "crownfire", name: "Crownfire", element: "ember", kind: "spell", power: 110, accuracy: 85, mp: 22, desc: "Horn-flame, then ruin." },
  torrent: { id: "torrent", name: "Torrent", element: "tide", kind: "spell", power: 45, accuracy: 100, mp: 6, desc: "A jet of cold water.", status: "soak", statusChance: 10 },
  tideburst: { id: "tideburst", name: "Tideburst", element: "tide", kind: "spell", power: 85, accuracy: 95, mp: 14, desc: "A breaking wave." },
  deepcurrent: { id: "deepcurrent", name: "Deepcurrent", element: "tide", kind: "spell", power: 105, accuracy: 85, mp: 22, desc: "The river remembers." },
  rootgrasp: { id: "rootgrasp", name: "Rootgrasp", element: "verdant", kind: "hex", power: 35, accuracy: 90, mp: 8, desc: "Roots hold fast.", status: "bind", statusChance: 80 },
  bloom: { id: "bloom", name: "Bloom", element: "verdant", kind: "spell", power: 75, accuracy: 100, mp: 12, desc: "Thorns burst into flower and spear." },
  elderwrath: { id: "elderwrath", name: "Elderwrath", element: "verdant", kind: "spell", power: 100, accuracy: 90, mp: 20, desc: "The thicket answers." },
  pebble: { id: "pebble", name: "Pebble", element: "stone", kind: "spell", power: 40, accuracy: 100, mp: 5, desc: "A flung cobble." },
  quake: { id: "quake", name: "Quake", element: "stone", kind: "spell", power: 90, accuracy: 90, mp: 16, desc: "The keep-floor complains." },
  gust: { id: "gust", name: "Gust", element: "gale", kind: "spell", power: 40, accuracy: 100, mp: 5, desc: "A cutting wind." },
  tempest: { id: "tempest", name: "Tempest", element: "gale", kind: "spell", power: 90, accuracy: 90, mp: 16, desc: "A small storm, well aimed." },
  gleam: { id: "gleam", name: "Gleam", element: "light", kind: "spell", power: 45, accuracy: 100, mp: 6, desc: "A lantern-flash." },
  hallow: { id: "hallow", name: "Hallow", element: "light", kind: "spell", power: 85, accuracy: 95, mp: 14, desc: "Chapel-light, hard-edged." },
  shade: { id: "shade", name: "Shade", element: "umbra", kind: "spell", power: 50, accuracy: 100, mp: 8, desc: "A mouth of dark.", status: "daze", statusChance: 15 },
  voidhowl: { id: "voidhowl", name: "Voidhowl", element: "umbra", kind: "spell", power: 90, accuracy: 90, mp: 16, desc: "A grave-song." },
  sparksteel: { id: "sparksteel", name: "Sparksteel", element: "steel", kind: "spell", power: 70, accuracy: 95, mp: 12, desc: "Metal sings and cuts." },
  keepfire: { id: "keepfire", name: "Keepfire", element: "ember", kind: "spell", power: 95, accuracy: 90, mp: 18, desc: "Hearth-fire from a wyrm's throat." },
  mossmend: { id: "mossmend", name: "Mossmend", element: "verdant", kind: "heal", power: 50, accuracy: 100, mp: 10, desc: "Moss knits a wound." },
  lumen: { id: "lumen", name: "Lumen", element: "light", kind: "heal", power: 70, accuracy: 100, mp: 14, desc: "A quiet chapel glow." },
  lickwounds: { id: "lickwounds", name: "Lick Wounds", element: "tide", kind: "heal", power: 40, accuracy: 100, mp: 8, desc: "A careful tending." },
  drowse: { id: "drowse", name: "Drowse", element: "umbra", kind: "hex", power: 0, accuracy: 75, mp: 8, desc: "Heavy lids.", status: "daze", statusChance: 100 },
  scorch: { id: "scorch", name: "Scorch", element: "ember", kind: "hex", power: 20, accuracy: 90, mp: 8, desc: "A clinging heat.", status: "burn", statusChance: 100 },
  soak: { id: "soak", name: "Soak", element: "tide", kind: "hex", power: 20, accuracy: 90, mp: 8, desc: "Water in the lungs.", status: "soak", statusChance: 100 },
  wardveil: { id: "wardveil", name: "Wardveil", element: "light", kind: "ward", power: 0, accuracy: 100, mp: 10, desc: "A veil of old compact.", status: "ward", statusChance: 100 },
  bless: { id: "bless", name: "Bless", element: "light", kind: "ward", power: 0, accuracy: 100, mp: 10, desc: "The road favors you.", status: "bless", statusChance: 100 },
  howl: { id: "howl", name: "Howl", element: "gale", kind: "hex", power: 0, accuracy: 100, mp: 6, desc: "A warning that cuts true.", status: "daze", statusChance: 40 },
  fenwork: { id: "fenwork", name: "Fenwork", element: "umbra", kind: "spell", power: 80, accuracy: 95, mp: 14, desc: "Marsh-witchery.", status: "bind", statusChance: 30 },
  sunlance: { id: "sunlance", name: "Sunlance", element: "light", kind: "spell", power: 95, accuracy: 90, mp: 16, desc: "Antler-light, thrown." },
};

const S = (
  id: string,
  name: string,
  epithet: string,
  elements: ElementId[],
  base: Stats,
  catchRate: number,
  expYield: number,
  description: string,
  learnset: { level: number; skill: string }[],
  evolves?: { level: number; into: string },
): Species => ({
  id, name, epithet, elements, base, catchRate, expYield, description, learnset, evolves,
});

export const SPECIES: Record<string, Species> = {
  emberkit: S("emberkit", "Emberkit", "Fox-drake", ["ember"],
    { hp: 39, mp: 42, atk: 48, def: 36, mag: 52, res: 38, spd: 62, lck: 50 },
    45, 62, "A russet fox-drake whose tail holds a coal that never quite dies. Loyal once the pact is spoken.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "cinder" }, { level: 7, skill: "scorch" }, { level: 12, skill: "slash" }, { level: 18, skill: "flare" }, { level: 26, skill: "howl" }, { level: 34, skill: "crownfire" }],
    { level: 16, into: "pyrefox" }),
  pyrefox: S("pyrefox", "Pyrefox", "Ember fox-drake", ["ember"],
    { hp: 58, mp: 54, atk: 64, def: 50, mag: 72, res: 52, spd: 78, lck: 58 },
    24, 142, "The coal along its spine has become a ridge of living fire. It runs the old roads at dusk.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "cinder" }, { level: 7, skill: "scorch" }, { level: 12, skill: "slash" }, { level: 18, skill: "flare" }, { level: 26, skill: "howl" }, { level: 34, skill: "crownfire" }],
    { level: 32, into: "crownwyrm" }),
  crownwyrm: S("crownwyrm", "Crownwyrm", "Horn-flame wyrm", ["ember", "gale"],
    { hp: 78, mp: 70, atk: 82, def: 68, mag: 98, res: 72, spd: 92, lck: 70 },
    8, 240, "A compact wyrm crowned in horn-flame. Old songs say one sat at the Binding King's left hand.",
    [{ level: 1, skill: "flare" }, { level: 1, skill: "slash" }, { level: 26, skill: "howl" }, { level: 34, skill: "crownfire" }, { level: 40, skill: "tempest" }]),
  mirewhelp: S("mirewhelp", "Mirewhelp", "River-newt", ["tide"],
    { hp: 48, mp: 40, atk: 40, def: 52, mag: 48, res: 50, spd: 38, lck: 42 },
    45, 64, "A river-newt with a lily-pad crest. It drinks from any stream and remembers every crossing.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "torrent" }, { level: 7, skill: "soak" }, { level: 12, skill: "lickwounds" }, { level: 18, skill: "tideburst" }, { level: 26, skill: "wardveil" }, { level: 34, skill: "deepcurrent" }],
    { level: 16, into: "riverguard" }),
  riverguard: S("riverguard", "Riverguard", "Stone-backed newt", ["tide", "stone"],
    { hp: 70, mp: 52, atk: 54, def: 78, mag: 64, res: 72, spd: 44, lck: 48 },
    24, 148, "River-stone plates have grown along its back. Ferrymen leave out fish for it still.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "torrent" }, { level: 12, skill: "lickwounds" }, { level: 18, skill: "tideburst" }, { level: 22, skill: "stonefist" }, { level: 26, skill: "wardveil" }, { level: 34, skill: "deepcurrent" }],
    { level: 32, into: "tidemark" }),
  tidemark: S("tidemark", "Tidemark", "Wave-crest guardian", ["tide", "stone"],
    { hp: 92, mp: 68, atk: 70, def: 98, mag: 82, res: 94, spd: 52, lck: 56 },
    8, 244, "Where it walks, the waterline follows. A patient, unkillable kindness.",
    [{ level: 1, skill: "tideburst" }, { level: 1, skill: "stonefist" }, { level: 26, skill: "wardveil" }, { level: 34, skill: "deepcurrent" }, { level: 40, skill: "quake" }]),
  briarling: S("briarling", "Briarling", "Thorn-sprite", ["verdant"],
    { hp: 42, mp: 44, atk: 50, def: 44, mag: 50, res: 44, spd: 50, lck: 55 },
    45, 63, "A walking thicket-child. Berry-clusters for hair, and a temper like a bramble patch.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "rootgrasp" }, { level: 8, skill: "thornlash" }, { level: 13, skill: "mossmend" }, { level: 18, skill: "bloom" }, { level: 26, skill: "bless" }, { level: 34, skill: "elderwrath" }],
    { level: 16, into: "thornback" }),
  thornback: S("thornback", "Thornback", "Briar mantle", ["verdant"],
    { hp: 62, mp: 58, atk: 72, def: 64, mag: 68, res: 60, spd: 64, lck: 62 },
    24, 146, "A living mantle of briar. Hedge-wards use their shed thorns as fence-nails.",
    [{ level: 1, skill: "rootgrasp" }, { level: 1, skill: "thornlash" }, { level: 13, skill: "mossmend" }, { level: 18, skill: "bloom" }, { level: 26, skill: "bless" }, { level: 34, skill: "elderwrath" }],
    { level: 32, into: "elderbramble" }),
  elderbramble: S("elderbramble", "Elderbramble", "Thicket-guardian", ["verdant", "umbra"],
    { hp: 84, mp: 74, atk: 90, def: 86, mag: 88, res: 80, spd: 72, lck: 70 },
    8, 242, "An old walking wood. Villages that keep one never lose a child to the forest.",
    [{ level: 1, skill: "bloom" }, { level: 1, skill: "thornlash" }, { level: 26, skill: "bless" }, { level: 34, skill: "elderwrath" }, { level: 40, skill: "shade" }]),
  mothwisp: S("mothwisp", "Mothwisp", "Lantern moth", ["light"],
    { hp: 38, mp: 55, atk: 28, def: 32, mag: 58, res: 50, spd: 68, lck: 60 },
    90, 55, "A cream-winged moth that lights its own belly. Shepherds follow them home in fog.",
    [{ level: 1, skill: "gleam" }, { level: 1, skill: "gust" }, { level: 9, skill: "lumen" }, { level: 16, skill: "hallow" }, { level: 24, skill: "wardveil" }]),
  gravepup: S("gravepup", "Gravepup", "Bone hound", ["umbra"],
    { hp: 44, mp: 36, atk: 58, def: 40, mag: 40, res: 38, spd: 55, lck: 40 },
    70, 60, "A hound of pale bone and brass grave-charms. It will not cross a threshold uninvited.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "shade" }, { level: 10, skill: "shadowclaw" }, { level: 18, skill: "howl" }, { level: 26, skill: "voidhowl" }]),
  pebblet: S("pebblet", "Pebblet", "Living cobble", ["stone"],
    { hp: 55, mp: 28, atk: 52, def: 70, mag: 30, res: 48, spd: 22, lck: 30 },
    80, 58, "A dog-sized cobble that decided to walk. Mason-wards leave them in walls as luck.",
    [{ level: 1, skill: "ram" }, { level: 1, skill: "pebble" }, { level: 12, skill: "stonefist" }, { level: 20, skill: "wardveil" }, { level: 28, skill: "quake" }]),
  galeskip: S("galeskip", "Galeskip", "Storm hare", ["gale"],
    { hp: 36, mp: 40, atk: 44, def: 30, mag: 48, res: 36, spd: 85, lck: 70 },
    85, 56, "A hare with storm-grey pinions. It is gone before the grass springs back.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "gust" }, { level: 10, skill: "galepeck" }, { level: 18, skill: "tempest" }, { level: 26, skill: "howl" }]),
  ironnewt: S("ironnewt", "Ironnewt", "Plate newt", ["steel"],
    { hp: 50, mp: 32, atk: 60, def: 72, mag: 34, res: 50, spd: 30, lck: 28 },
    75, 66, "A newt that grew a smith's leftover iron. Slow, and extremely unwilling to die.",
    [{ level: 1, skill: "nip" }, { level: 1, skill: "ram" }, { level: 11, skill: "ironbite" }, { level: 19, skill: "sparksteel" }, { level: 27, skill: "stonefist" }]),
  bogwallow: S("bogwallow", "Bogwallow", "Marsh toad", ["tide", "verdant"],
    { hp: 70, mp: 40, atk: 48, def: 55, mag: 50, res: 52, spd: 28, lck: 40 },
    80, 68, "A fat toad of bog-moss and patience. Its croak is a weather-sign in Mirefen.",
    [{ level: 1, skill: "torrent" }, { level: 1, skill: "rootgrasp" }, { level: 12, skill: "soak" }, { level: 20, skill: "tideburst" }, { level: 28, skill: "bloom" }]),
  hollowowl: S("hollowowl", "Hollowowl", "Umbra owl", ["umbra", "gale"],
    { hp: 42, mp: 50, atk: 46, def: 38, mag: 62, res: 48, spd: 70, lck: 55 },
    60, 72, "An owl with a hollow where a heart should be. It hunts by listening to regrets.",
    [{ level: 1, skill: "gust" }, { level: 1, skill: "shade" }, { level: 12, skill: "galepeck" }, { level: 20, skill: "drowse" }, { level: 28, skill: "voidhowl" }]),
  chapelite: S("chapelite", "Chapelite", "Glass gargoyle", ["light", "steel"],
    { hp: 52, mp: 48, atk: 50, def: 64, mag: 60, res: 66, spd: 40, lck: 36 },
    50, 80, "A small gargoyle of chapel glass. Sun through it becomes a weapon.",
    [{ level: 1, skill: "gleam" }, { level: 1, skill: "ram" }, { level: 12, skill: "sparksteel" }, { level: 20, skill: "hallow" }, { level: 28, skill: "lumen" }]),
  rootwight: S("rootwight", "Rootwight", "Knotted wood", ["verdant", "umbra"],
    { hp: 60, mp: 46, atk: 64, def: 58, mag: 58, res: 50, spd: 34, lck: 32 },
    55, 78, "Black wood and pale fungi. It walks when the compact is broken, and sits when it is kept.",
    [{ level: 1, skill: "rootgrasp" }, { level: 1, skill: "shade" }, { level: 12, skill: "thornlash" }, { level: 20, skill: "bloom" }, { level: 28, skill: "voidhowl" }]),
  keepdrake: S("keepdrake", "Keepdrake", "Castle wyrm", ["steel", "ember"],
    { hp: 80, mp: 60, atk: 88, def: 82, mag: 78, res: 70, spd: 58, lck: 48 },
    12, 200, "A keep given a pulse. Ember runs in the seams of its iron-grey hide. Warden-beasts of the old crown.",
    [{ level: 1, skill: "ironbite" }, { level: 1, skill: "cinder" }, { level: 14, skill: "sparksteel" }, { level: 20, skill: "keepfire" }, { level: 28, skill: "flare" }, { level: 36, skill: "quake" }]),
  sunhart: S("sunhart", "Sunhart", "Lantern stag", ["light", "verdant"],
    { hp: 64, mp: 58, atk: 62, def: 54, mag: 80, res: 66, spd: 72, lck: 64 },
    25, 160, "A woodland stag with a lantern caught between its antlers. Rare, and unwilling to be hurried.",
    [{ level: 1, skill: "gleam" }, { level: 1, skill: "ram" }, { level: 12, skill: "bloom" }, { level: 20, skill: "sunlance" }, { level: 28, skill: "bless" }]),
  fenwitch: S("fenwitch", "Fenwitch", "Marsh spirit", ["tide", "umbra"],
    { hp: 48, mp: 72, atk: 36, def: 40, mag: 88, res: 70, spd: 64, lck: 58 },
    20, 170, "Peat-dark water walking. Reed-hair and two pale lantern eyes. It bargains, then it binds.",
    [{ level: 1, skill: "torrent" }, { level: 1, skill: "shade" }, { level: 12, skill: "soak" }, { level: 20, skill: "fenwork" }, { level: 28, skill: "drowse" }]),
};

export const ITEMS: Record<string, ItemDef> = {
  tonic: { id: "tonic", name: "Field Tonic", desc: "Restores 40 HP.", price: 20, kind: "heal", power: 40 },
  greater_tonic: { id: "greater_tonic", name: "Greater Tonic", desc: "Restores 120 HP.", price: 60, kind: "heal", power: 120 },
  panacea: { id: "panacea", name: "Panacea", desc: "Fully restores HP.", price: 180, kind: "heal", power: 999 },
  etherdrop: { id: "etherdrop", name: "Etherdrop", desc: "Restores 30 MP.", price: 50, kind: "ether", power: 30 },
  salve: { id: "salve", name: "Salve", desc: "Cures burn, soak, bind, and daze.", price: 25, kind: "status" },
  phoenix_ash: { id: "phoenix_ash", name: "Phoenix Ash", desc: "Revives a fallen pact-beast with half HP.", price: 220, kind: "revive", power: 50 },
  common_sigil: { id: "common_sigil", name: "Common Sigil", desc: "A plain binding stone. Cast it to pact a weakened wild beast.", price: 30, kind: "sigil", stone: 1 },
  thorn_sigil: { id: "thorn_sigil", name: "Thorn Sigil", desc: "A briar-cut stone. Binds more surely.", price: 90, kind: "sigil", stone: 1.7 },
  relic_sigil: { id: "relic_sigil", name: "Relic Sigil", desc: "An old compact, recut. Few beasts refuse it.", price: 280, kind: "sigil", stone: 2.6 },
  quiet_bell: { id: "quiet_bell", name: "Quiet Bell", desc: "Still the grass for a hundred steps.", price: 80, kind: "field", power: 100 },
};

export const SHOP_STOCK = [
  "tonic",
  "greater_tonic",
  "etherdrop",
  "salve",
  "common_sigil",
  "thorn_sigil",
  "quiet_bell",
  "phoenix_ash",
];

export const STAT_KEYS: (keyof Stats)[] = ["hp", "mp", "atk", "def", "mag", "res", "spd", "lck"];

let uidSeq = 1;
export function nextUid(): string {
  uidSeq += 1;
  return `b${Date.now().toString(36)}${uidSeq}`;
}

export function rollIvs(random: RandomSource = mathRandom): Stats {
  const r = () => 1 + Math.floor(random() * 15);
  return { hp: r(), mp: r(), atk: r(), def: r(), mag: r(), res: r(), spd: r(), lck: r() };
}

export function randomTemperament(random: RandomSource = mathRandom): Temperament {
  const keys = Object.keys(TEMPERAMENTS) as Temperament[];
  return keys[Math.floor(random() * keys.length)]!;
}

export function calcStats(species: Species, level: number, ivs: Stats, temperament: Temperament): Stats {
  const t = TEMPERAMENTS[temperament];
  const out = {} as Stats;
  for (const k of STAT_KEYS) {
    const base = species.base[k];
    const iv = ivs[k];
    let v: number;
    if (k === "hp") v = Math.floor(((base + iv) * 2 * level) / 50) + level + 10;
    else if (k === "mp") v = Math.floor(((base + iv) * 2 * level) / 55) + 8;
    else v = Math.floor(((base + iv) * 2 * level) / 50) + 5;
    if (k === t.up) v = Math.floor(v * 1.12);
    if (k === t.down) v = Math.floor(v * 0.9);
    out[k] = Math.max(1, v);
  }
  return out;
}

export function expToNext(level: number): number {
  return Math.floor((1.2 * level * level * level) / 1.8) + 8;
}

export function skillsForLevel(species: Species, level: number): string[] {
  const learned = species.learnset.filter((l) => l.level <= level).map((l) => l.skill);
  return learned.slice(-4);
}

export function makeBeast(speciesId: string, level: number, opts?: { temperament?: Temperament; ivs?: Stats; nickname?: string; random?: RandomSource }): Beast {
  const sp = SPECIES[speciesId];
  if (!sp) throw new Error(`Unknown species ${speciesId}`);
  const random = opts?.random ?? mathRandom;
  const ivs = opts?.ivs ?? rollIvs(random);
  const temperament = opts?.temperament ?? randomTemperament(random);
  const stats = calcStats(sp, level, ivs, temperament);
  return {
    uid: nextUid(),
    speciesId,
    nickname: opts?.nickname ?? sp.name,
    level,
    exp: 0,
    hp: stats.hp,
    mp: stats.mp,
    ivs,
    temperament,
    skills: skillsForLevel(sp, level),
    status: null,
    statusTurns: 0,
  };
}

export function currentStats(b: Beast): Stats {
  return calcStats(SPECIES[b.speciesId]!, b.level, b.ivs, b.temperament);
}

export function healFull(b: Beast): void {
  const s = currentStats(b);
  b.hp = s.hp;
  b.mp = s.mp;
  b.status = null;
  b.statusTurns = 0;
}

export const ELEMENT_LIST = Object.keys(ELEMENTS) as ElementId[];
