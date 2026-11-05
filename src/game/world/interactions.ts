/**
 * Data-driven world interaction registry.
 *
 * All dialogue, sign text, chest loot, warp destinations, and NPC behavior
 * live here — not in the engine. ARCHITECTURE.md's rule ("content references
 * IDs rather than embedding behavior") is enforced by validateInteractions:
 * a map referencing a talk/interact id that has no registry entry fails CI
 * instead of silently no-oping at runtime.
 *
 * Pure data plus flag-driven page builders; the engine supplies effects
 * (dialogs, warps, encounters, saves) through the InteractionHost interface.
 */
import { ITEMS } from "../content.ts";
import type { MapDef } from "../types.ts";

/** A talk/interact context: world state the pages may read. */
export interface DialogContext {
	flags: Record<string, boolean>;
	/** Highest party level — drives Warden Cael's advisory. */
	strongestLevel: number;
}

export type WarpTarget = { to: string; x: number; y: number };

export const WARP_TABLE: Record<string, WarpTarget> = {
	enter_home: { to: "home", x: 5, y: 6 },
	enter_guild: { to: "guild_in", x: 6, y: 8 },
	enter_inn: { to: "inn_in", x: 6, y: 7 },
	enter_shop: { to: "shop_in", x: 5, y: 6 },
	enter_cave: { to: "ashenbarrow", x: 9, y: 14 },
	enter_cellar: { to: "elderhall_cellar", x: 7, y: 10 },
	enter_ashen_north: { to: "ashenbarrow", x: 9, y: 2 },
	enter_hall: { to: "warden_hall", x: 7, y: 10 },
	enter_keep_inn: { to: "keep_inn", x: 6, y: 7 },
	enter_keep_shop: { to: "keep_shop", x: 5, y: 6 },
};

export const SIGN_TEXTS: Record<string, string> = {
	sign_road: "BRIAR ROAD — north to Wildwood, east to Mirefen. Bind what you must.",
	sign_grove: "BINDING GROVE — first pacts are spoken here.",
	sign_grove_inner: "Choose with care. A first pact is a first name.",
	sign_briar: "Keep to the path after dusk. The grass remembers hunger.",
	sign_wildwood: "WILDWOOD — Ashenbarrow in the stone. Thornkeep beyond the trees.",
	sign_mire: "MIREFEN — watch your step. The peat is older than the keep.",
	sign_keep: "THORNKEEP — Warden Cael holds the first Mark.",
	sign_crownpool: "CROWNPOOL — relic basin. Slimes gather where the crown cracked.",
};

export const CHEST_LOOT: Record<string, { item: string; count: number }> = {
	chest_briar: { item: "thorn_sigil", count: 1 },
	chest_wood: { item: "greater_tonic", count: 2 },
	chest_mire: { item: "relic_sigil", count: 1 },
	chest_cave: { item: "phoenix_ash", count: 1 },
	chest_cellar: { item: "tonic", count: 2 },
};

/** What interacting with an object does, aside from warps/signs/chests. */
export type SpecialInteraction =
	| { kind: "shrine" }
	| { kind: "rest" }
	| { kind: "books" }
	| { kind: "starter"; speciesId: string }
	| {
			kind: "encounter";
			encounterId: string;
			speaker: string;
			/** Line when the encounter is already won. */
			doneLines: string[];
			/** Lines shown before the offer. */
			lines: string[];
			/** Offer line, last page before the choice. */
			offerLine: string;
			/** Honest label for the final page's action (it commits the duel). */
			commitLabel: string;
			/** Requires flags.starter before dueling. */
			needsStarter?: boolean;
			/** Requires a specific flag (e.g. "trial") before dueling. */
			needsFlag?: string;
			/** Refusal line when the gate is not met. */
			gateLine: string;
	  };

export const SPECIAL_INTERACTIONS: Record<string, SpecialInteraction> = {
	starter_emberkit: { kind: "starter", speciesId: "emberkit" },
	starter_mirewhelp: { kind: "starter", speciesId: "mirewhelp" },
	starter_briarling: { kind: "starter", speciesId: "briarling" },
	shrine: { kind: "shrine" },
	bed: { kind: "rest" },
	books: { kind: "books" },
	slime_king: {
		kind: "encounter",
		encounterId: "slime_king",
		speaker: "",
		doneLines: ["The basin is quiet now. Relic-light ripples without threat."],
		lines: [],
		offerLine: "Challenge the Slime King? (A yes · B no)",
		commitLabel: "Challenge",
		needsStarter: true,
		gateLine: "Something vast shifts in the water — not yet your fight.",
	},
	goblin_scout: {
		kind: "encounter",
		encounterId: "goblin_scout",
		speaker: "Scout",
		doneLines: ["You already proved your road-manners. The camp remembers."],
		lines: ["I can show you the Wildwood paths — or we can settle it with pacts."],
		offerLine: "(A duel · B talk)",
		commitLabel: "Duel",
		gateLine: "Another time. The west gate is marked.",
	},
	goblin_king: {
		kind: "encounter",
		encounterId: "goblin_king",
		speaker: "Goblin King",
		doneLines: ["The compact holds. My beasts sleep."],
		lines: ["A diplomatic compact, beast against beast."],
		offerLine: "(A accept · B decline)",
		commitLabel: "Accept the duel",
		needsFlag: "trial",
		gateLine: "Bring a Thorn Mark if you want a king's duel. Until then — trade, or leave.",
	},
};

/** The set of interact ids the registry knows how to handle. */
export function knownInteractIds(): Set<string> {
	return new Set([...Object.keys(WARP_TABLE), ...Object.keys(SIGN_TEXTS), ...Object.keys(CHEST_LOOT), ...Object.keys(SPECIAL_INTERACTIONS)]);
}

/**
 * Static lines for an NPC, or an action for the engine to perform.
 * `pages` returning an empty array means the NPC has nothing to say here.
 */
export type NpcDialog =
	| { kind: "lines"; speakerless?: boolean; pages: (ctx: DialogContext) => string[] }
	| { kind: "action"; action: "inn" | "shop" | "warden" };

export const NPC_DIALOGS: Record<string, NpcDialog> = {
	maren: {
		kind: "lines",
		pages: ({ flags }) => {
			if (!flags.starter) {
				return [
					"The Crown cracked. We did not. That is the whole of our order.",
					"Walk west to the Binding Grove. Three beasts have waited the night. Speak a pact. Then the road is yours.",
				];
			}
			if (!flags.trial) {
				return [
					"Good. A pact is a name you intend to keep.",
					"Bind what you can on Briar Road. When you are ready, take the Wildwood north to Thornkeep. Warden Cael will test the compact.",
				];
			}
			return [
				"The Thorn Sigil sits well on you. The Hollow Crown is still a rumor with teeth — but that is a later road.",
				"Rest. Bind. Walk. That is the work.",
			];
		},
	},
	// The guild map reuses Maren with her own id; same person, same lines.
	maren_guild: {
		kind: "lines",
		pages: (ctx) => (NPC_DIALOGS.maren as Extract<NpcDialog, { kind: "lines" }>).pages(ctx),
	},
	guard: {
		kind: "lines",
		pages: ({ flags }) => [
			flags.starter
				? "Road's open. If the grass sings, you already know what that means."
				: "Not without a pact-beast. Maren's in the Chapter, or the Grove west of town.",
		],
	},
	lise: {
		kind: "lines",
		pages: () => [
			"Inns take crowns. Shrines take nothing but a moment. I know which I'd trust.",
			"If you see my cousin on the road, tell her the well's still sweet.",
		],
	},
	innkeep: { kind: "action", action: "inn" },
	shopkeep: { kind: "action", action: "shop" },
	wayfarer: {
		kind: "lines",
		pages: () => [
			"Tall grass means a fight. That's the old compact, gone feral.",
			"Sigil stones bind. Common ones break often. Thorn ones less. Don't throw them at a full-health wyrm.",
			"Know the signs: burn eats vigor each turn. Soak drinks mist. Daze makes one grip in four fumble. Bind roots the legs — the bound beast acts last, and cannot flee.",
		],
	},
	reedcutter: {
		kind: "lines",
		pages: () => ["Fenwitch walks the peat when the mist sits low. Pale eyes. Don't follow them off the bridge."],
	},
	cael: { kind: "action", action: "warden" },
	cael_trial: { kind: "action", action: "warden" },
	keep_guard: {
		kind: "lines",
		pages: () => ["Hall's through the east cottage. Cael doesn't like small talk."],
	},
	goblin_trader: {
		kind: "lines",
		pages: () => ["Scrap for sale, stories for free. The camp keeps to itself — unless you pick a fight."],
	},
};

/** Talk ids the registry knows. */
export function knownTalkIds(): Set<string> {
	return new Set(Object.keys(NPC_DIALOGS));
}

/**
 * The Warden trial team, as the content promises it: a party below the
 * advised level meets a lighter trio (the advisory "this goes lighter" is
 * real), a prepared party meets the full 12/13/15 line.
 */
export const WARDEN_TRIAL_TEAM: { speciesId: string; level: number }[] = [
  { speciesId: "ironnewt", level: 12 },
  { speciesId: "chapelite", level: 13 },
  { speciesId: "keepdrake", level: 15 },
];

export function wardenTeamLevels(strongestLevel: number): number[] {
  const adjust = strongestLevel < 12 ? -2 : 0;
  return WARDEN_TRIAL_TEAM.map((foe) => Math.max(1, foe.level + adjust));
}

/** Cael's advisory pages, kept here so the content stays in the content layer. */
export function wardenPages(ctx: DialogContext): string[] {
	const pages = ["Warden Cael. I keep Thornkeep's road."];
	if (ctx.strongestLevel < 12) {
		pages.push(
			`Your beast has weathered ${ctx.strongestLevel} season${ctx.strongestLevel === 1 ? "" : "s"}. Below a dozen, my three run lighter; at a dozen they meet you at full strength. As you like — three of mine against yours: Iron. Chapel. Drake.`,
		);
	} else {
		pages.push("Show me the compact is not a hobby. Three of mine against yours — Iron. Chapel. Drake. Bind or break.");
	}
	pages.push("(A begin · B later)");
	return pages;
}

/**
 * Content-coherence gate: every talk/interact id any map references must have
 * a registry entry, and every chest must hold a real item. A typo here used
 * to compile, validate, and silently no-op.
 */
export function validateInteractions(maps: Record<string, MapDef>): string[] {
	const errors: string[] = [];
	const talkIds = knownTalkIds();
	const interactIds = knownInteractIds();
	for (const [mapId, map] of Object.entries(maps)) {
		for (const npc of map.npcs) {
			if (!talkIds.has(npc.talk)) errors.push(`map ${mapId}: npc ${npc.id} talks as "${npc.talk}" — no registry entry`);
		}
		for (const obj of map.objects) {
			if (!obj.interact) continue;
			if (!interactIds.has(obj.interact)) errors.push(`map ${mapId}: object ${obj.id} interacts as "${obj.interact}" — no registry entry`);
		}
	}
	for (const [id, loot] of Object.entries(CHEST_LOOT)) {
		if (!ITEMS[loot.item]) errors.push(`chest ${id}: unknown loot item ${loot.item}`);
	}
	return errors;
}
