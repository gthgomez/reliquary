import {
  currentStats,
  ELEMENTS,
  healFull,
  ITEMS,
  makeBeast,
  MAX_LEVEL,
  PRACTICE_COST,
  PRACTICE_LORE,
  SHOP_STOCK,
  SKILLS,
  skillsForLevel,
  SPECIES,
  typeMod,
	STARTING_GOLD,
} from "./content.ts";
import { MAPS } from "./maps.ts";
import { resolveNpcPortrait, type PortraitKey } from "./portraits.ts";
import { FIXED_ENCOUNTERS } from "./encounters.ts";
import { isInteriorRoom, paintInteriorRoom, type InteriorRoomId } from "./render/room-visual.ts";
import { sfxPlay, startMusic, stopMusic, unlockAudio, isMuted, setMuted } from "./audio.ts";
import { setSoundMutedStored } from "./ui/ui-chrome.ts";
import { hasSave, cloneSave, findArchivedSave, findNewerSave, loadSave, parseSave, readNameDraft, SAVE_RESUMED_MESSAGE, SAVE_VERSION, serializeSave, WORLD_REVISION, writeNameDraft, writeSave, type SaveStorage } from "./save.ts";
import { collectGameAssets, isElderhallCandidateBuild, isEssentialWorldAsset, type AssetEntry } from "./assets.ts";
import type { BattlePreview } from "./preview/battle-preview.ts";
import { mathRandom, type RandomSource } from "./rng.ts";
import { BATTLE_SIGILS, battleCommands, encounterAt, rollEncounter, type BattleCommand } from "./world/encounters.ts";
import { isOccupied } from "./world/movement.ts";
import { pickInteractObject, selectInteractionTarget } from "./world/interaction.ts";
import { starterPactFlag, visibleObjects } from "./world/object-state.ts";
import {
	CHEST_LOOT,
	NPC_DIALOGS,
	WARDEN_TRIAL_TEAM,
	SIGN_TEXTS,
	SPECIAL_INTERACTIONS,
	WARP_TABLE,
	wardenPages,
	wardenTeamLevels,
	type SpecialInteraction,
} from "./world/interactions.ts";
import { bakeMapTerrain } from "./world/terrain.ts";
import {
  computeBattleLayout,
  drawBattleFoeSprite,
  drawBattlePlayerSprite,
  paintBattleBackdrop,
  stableBattleUiReserveTop,
} from "./render/battle-scene.ts";
import {
  battlePresentation,
  battleViewportForStage,
} from "./render/battle-viewport.ts";
import { measureSpriteAlphaBounds } from "./render/sprite-bounds.ts";
import {
  battleAnimDurationMs,
  paintGustProjectile,
  sampleBattleAnim,
  sampleBattleIdle,
  shouldPlayBattleAnim,
  type BattleAnimCue,
  type BattleAnimSide,
} from "./render/battle-creature-anim.ts";
import {
  computeBattleStageGeometry,
  reportBattleStageGeometry,
} from "./render/battle-stage-geometry.ts";
import { shouldExposeControlsTestOnWindow } from "./render/render-report-gate.ts";
import {
  adjustCamYForHudInset,
  readUiSafeTopCanvas,
  reportWorldCameraGeometry,
  resetWorldCamRelief,
  type WorldCamReliefState,
} from "./render/world-camera-safe.ts";
import { clipSoftPath, clipStoneTransition, drawAtlasTile, paintCottageFloor, paintCottageRug, paintOrganicStoneRoadBorder, paintStoneRoadBorder, paintTileAccent, tileAtlasQuadrant } from "./render/tile-surface.ts";
import { paintDirtPathJunctions } from "./render/road-junctions.ts";
import { chapterRouteRows, drawChapterRouteMaterial, drawWoodlandMaterial, drawWoodlandUndergrowth, drawWoodlandVerge, woodlandPalette } from "./render/terrain-atlas.ts";
import { snapWorldCameraForPlayer, type WorldCameraSnapState } from "./render/world-transform.ts";
import { compareWorldDepth, paintActorBehindPost, paintPropWithLocalFade, paintWorldActorShadow, paintWorldPropShadow, PLAYER_HEIGHT_TILES, playerHeadCanvasYForCamera, resolvePlayerDrawFootprint, resolvePlayerScreenFootprint, resolveWorldPropLayout, shouldFadePropForPlayer, worldPropCullBounds, worldPropOverhang } from "./render/world-actors.ts";
import { elderhallCandidateObject, elderhallGateRenderRegions, elderhallTerrainAtlas, paintCandidateGateFallback, paintCandidateBenchFallback, paintCandidateTerrainJunctions } from "./render/elderhall-visual.ts";
import { captureChance, captureSucceeds, storeCapturedBeast } from "./systems/capture.ts";
import { healBeast, playerActsFirst, spendSkillMp } from "./systems/combat.ts";
import { applySkillEvents, resolveSkillUse } from "./systems/battle-engine.ts";

import { purchaseItem, sellItem } from "./systems/economy.ts";
import { awardExperience } from "./systems/progression.ts";
import { moveToLead, renameCreature, transferBeast } from "./systems/party.ts";
import { currentObjective, marenLandmark } from "./systems/objective.ts";
import { STATUS_ADJECTIVES, applyStatus, dazeFumbles, tickStatus as tickBeastStatus } from "./systems/status.ts";
import type {
  BattleState,
  Beast,
  Dir,
  GameSave,
  MapDef,
  Mode,
  Skill,
  NamePromptView,
  Snapshot,
} from "./types.ts";

export const TILE = 32;
export const STARTER_PACT_REWARD = { sigils: 3, crowns: 40 } as const;
const STARTER_PACT_LEVEL = 5;

function nameOfferFlag(kind: NamePromptView["kind"], uid: string): string {
	return `name_offer_${kind}:${uid}`;
}
export const VIEW_W = 12;
export const VIEW_H = 9;
export const VIEW_W_PORT = 10;
export const VIEW_H_PORT = 16;
export const WORLD_ASSET_STALL_MS = 15_000;
export const ROOT_MENU = ["Party", "Storage", "Reliquary", "Pack", "Save", "Export", "Import", "Sound", "Close"] as const;

type Dialog = {
	speaker: string;
	pages: string[];
	index: number;
	onDone?: () => void;
	onCancel?: () => void;
	/** Label for the final page's action when it commits a choice (S13). */
	doneLabel?: string;
	npcId: string | null;
	portraitKey: PortraitKey | null;
	speciesId?: string;
};

function dialogSecondaryLabel(dialog: Dialog): "Back" | "Close" | "Cancel" | null {
	const last = dialog.index === dialog.pages.length - 1;
	if (dialog.onDone && (dialog.index === 0 || last)) return "Cancel";
	if (dialog.pages.length === 1) return "Close";
	return dialog.index > 0 ? "Back" : null;
}

/** Placed-NPC identity threaded from the map into dialog state (stable id, never the display name). */
type DialogSpeaker = {
	npcId: string;
	sprite: string;
};

const DIRS: Record<Dir, { x: number; y: number; name: string }> = {
	0: {
		x: 0,
		y: 1,
		name: "down"
	},
	1: {
		x: -1,
		y: 0,
		name: "left"
	},
	2: {
		x: 1,
		y: 0,
		name: "right"
	},
	3: {
		x: 0,
		y: -1,
		name: "up"
	}
};
const YAW: Record<Dir, number> = {
	0: 0,
	1: Math.PI / 2,
	2: -Math.PI / 2,
	3: Math.PI
};
const WALK_MS = 160;
const CONTROL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyC", "KeyM", "Enter", "Space", "Escape", "ShiftLeft"]);
export class ReliquaryGame {
	mode: Mode = "title";
	loadProgress = 0;
	worldAssetsReady = false;
	worldAssetsLoading = false;
	worldAssetsStalled = false;
	requiredAssetsLoading = false;
	worldAssetFailures: string[] = [];
	assetFailures: string[] = [];
	playerName = "Rowan";
	mapId = "elderhall";
	tx = 12;
	ty = 14;
	px = 12 * TILE;
	py = 14 * TILE;
	dir: Dir = 0;
	moving = false;
	fromX = 0;
	fromY = 0;
	toX = 0;
	toY = 0;
	moveT = 0;
	walkFrame = 0;
	gold = STARTING_GOLD;
	playTime = 0;
	party: Beast[] = [];
	box: Beast[] = [];
	inventory: Record<string, number> = {
		tonic: 3,
		common_sigil: 5,
		salve: 1
	};
	flags: Record<string, boolean> = {};
	seen: Record<string, boolean> = {};
	caught: Record<string, boolean> = {};
	dialog: Dialog | null = null;
	private dialogRevision = 0;
	menu: string | null = null;
	learnMenu: { uid: string; skill: string } | null = null;
	packTarget: { item: string; uids: string[] } | null = null;
	cardAction: { uid: string } | null = null;
	private learnOrigin: "party" | "storage" = "party";
	/** Set by the browser shell to hand the player a save file; null means no downloads here. */
	exportFile: ((name: string, text: string) => boolean) | null = null;
	/** Bumped to ask the shell to open a file picker; the shell watches this value. */
	importTicket = 0;
	menuIndex = 0;
	battle: BattleState | null = null;
	toast: string | null = null;
	toastT = 0;
	quietBell = 0;
	selectedUid: string | null = null;
	shopIndex = 0;
	shopMode: "buy" | "sell" = "buy";
	images: Record<string, HTMLImageElement> = {};
	keys = new Set<string>();
	injected: string[] | null = null;
	canvas: HTMLCanvasElement | null = null;
	viewW = VIEW_W;
	viewH = VIEW_H;
	cssW = VIEW_W * TILE;
	cssH = VIEW_H * TILE;
	listeners = new Set<() => void>();
	snap: Snapshot;
	lastTs = 0;
	raf = 0;
	animWait = 0;
	animFn: (() => void) | null = null;
	encounterLock = false;
	hasSave = false;
	private settledSteps = 0;
	/** After a warp, doorway auto-entry waits until the movement keys are released. */
	private autoEnterLatch = false;
	/** Set once a pact is kept, before the player types a name. */
	namePrompt: NamePromptView | null = null;
	/** Wild compact waiting for the post-battle naming offer. */
	private pendingCaptureNameUid: string | null = null;
	private safeCheckpoint: GameSave | null = null;
	private saveWriteAllowed = true;
	private readonly readOnlySaveSource?: Pick<SaveStorage, "getItem">;
	readonly hasNewerSave: boolean;
	readonly hasArchivedSave: boolean;
	lifecycle: "constructed" | "booted" | "stopped" = "constructed";
	private readonly random: RandomSource;
	private bootToken = 0;
	private cancelAssetLoad: (() => void) | null = null;
	private worldAssetStallTimer: ReturnType<typeof setTimeout> | null = null;
	private terrain: { map: MapDef; canvas: HTMLCanvasElement } | null = null;
	private visibilityHandler = (): void => {
		if (document.visibilityState === "hidden") {
			this.keys.clear();
			this.injected = null;
			if (this.mode === "battle") return;
			if (this.mode !== "title" && this.mode !== "boot") this.persist();
		}
	};
	private probe: NonNullable<Window["__controlsTest"]> | null = null;
	private battleStableReserve: number | null = null;
	private battleStatusBottomRatio: number | null = null;
	private battleLayoutCanvasKey: string | null = null;
	private battleIdlePhase = 0;
	battlePreview: BattlePreview | null = null;
	private reducedMotion = false;
	private worldCamRelief: WorldCamReliefState = { relief: 0, contentPanY: 0 };
	private worldCameraSnap: { x: WorldCameraSnapState; y: WorldCameraSnapState } = { x: {}, y: {} };
	constructor(options: { random?: RandomSource; readOnlySaveSource?: Pick<SaveStorage, "getItem"> } = {}) {
		this.random = options.random ?? mathRandom;
		this.readOnlySaveSource = options.readOnlySaveSource;
		this.hasNewerSave = findNewerSave(this.readOnlySaveSource) !== null;
		this.hasArchivedSave = findArchivedSave(this.readOnlySaveSource) !== null;
		this.saveWriteAllowed = !this.readOnlySaveSource;
		this.snap = this.buildSnap();
		this.hasSave = hasSave(this.readOnlySaveSource);
	}
	subscribe = (fn: () => void): (() => void) => {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	};
	getSnapshot = (): Snapshot => this.snap;
	private emit(): void {
		this.snap = this.buildSnap();
		this.listeners.forEach((f) => f());
	}
	private buildSnap(): Snapshot {
		return {
			mode: this.mode,
			loadProgress: this.loadProgress,
			worldAssetsReady: this.worldAssetsReady,
			worldAssetsLoading: this.worldAssetsLoading,
			worldAssetsStalled: this.worldAssetsStalled,
			requiredAssetsLoading: this.requiredAssetsLoading,
			worldAssetFailures: this.worldAssetFailures,
			assetFailures: this.assetFailures,
			viewW: this.viewW,
			viewH: this.viewH,
			cssW: this.cssW,
			cssH: this.cssH,
			mapName: MAPS[this.mapId]?.name ?? "",
			region: MAPS[this.mapId]?.region ?? "",
			objective: currentObjective(this.flags),
			interactionHint: this.currentInteractionHint(),
			gold: this.gold,
			party: this.party,
			box: this.box,
			inventory: this.inventory,
			flags: this.flags,
			seen: this.seen,
			caught: this.caught,
			dialog: this.dialog ? {
				revision: this.dialogRevision,
				speaker: this.dialog.speaker,
				text: this.dialog.pages[this.dialog.index] ?? "",
				page: this.dialog.index + 1,
				pageCount: this.dialog.pages.length,
				last: this.dialog.index >= this.dialog.pages.length - 1,
				npcId: this.dialog.npcId,
				portraitKey: this.dialog.portraitKey,
				doneLabel: this.dialog.doneLabel ?? null,
				primaryLabel: this.dialog.index < this.dialog.pages.length - 1 ? "Next" : this.dialog.doneLabel ?? "Close",
				secondaryLabel: dialogSecondaryLabel(this.dialog),
				speciesId: this.dialog.speciesId ?? null,
				commits: Boolean(this.dialog.onDone),
			} : null,
			learnMenu:
				this.menu === "learn" && this.learnMenu
					? (() => {
						const beast = this.party.find((item) => item.uid === this.learnMenu!.uid);
						return beast ? { uid: beast.uid, nickname: beast.nickname, skill: this.learnMenu!.skill } : null;
					})()
					: null,
			packTarget:
				this.menu === "itemTarget" && this.packTarget
					? {
						item: this.packTarget.item,
						targets: this.packTarget.uids
							.map((uid) => this.party.find((beast) => beast.uid === uid))
							.filter((beast): beast is Beast => Boolean(beast))
							.map((beast) => {
								const st = currentStats(beast);
								const def = ITEMS[this.packTarget!.item]!;
								const note = def.kind === "heal"
									? `heals about ${def.power ?? 40} vitality`
									: def.kind === "ether"
										? `restores about ${def.power ?? 30} mist`
										: def.kind === "status"
											? `soothes ${beast.status ?? "an ailment"}`
											: "wakes the fallen";
								return {
									uid: beast.uid,
									nickname: beast.nickname,
									hp: `${beast.hp}/${st.hp}`,
									note,
								};
							}),
					}
					: null,
			cardMenu:
				(this.menu === "party" || this.menu === "storage") && this.cardAction
					? (() => {
						const beast = this.party.concat(this.box).find((item) => item.uid === this.cardAction!.uid);
						return beast ? { uid: beast.uid, nickname: beast.nickname, actions: this.cardActions() } : null;
					})()
					: null,
			menu: this.menu,
			menuIndex: this.menuIndex,
			battle: this.battle,
			toast: this.toast,
			namePrompt: this.namePrompt,
			selectedUid: this.selectedUid,
			shopIndex: this.shopIndex,
			shopMode: this.shopMode,
			shopStock: SHOP_STOCK,
			hasSave: this.hasSave,
			importTicket: this.importTicket,
			soundOff: isMuted(),
			items: ITEMS
		};
	}
	get started(): boolean {
		return this.lifecycle === "booted";
	}
	private clearWorldAssetStallTimer(): void {
		if (this.worldAssetStallTimer !== null) clearTimeout(this.worldAssetStallTimer);
		this.worldAssetStallTimer = null;
	}
	private async loadImages(token: number, retry = false): Promise<void> {
		const entries = collectGameAssets();
		const essential = entries.filter(isEssentialWorldAsset);
		const requiredPending = new Set(entries.filter((entry) => entry.required && !this.images[entry.key]).map((entry) => entry.url));
		const requiredFailures = new Set<string>();
		const worldFailures = new Set<string>();
		const essentialSettled = new Set<string>(essential.filter((entry) => this.images[entry.key]).map((entry) => entry.key));
		const priorReady = this.worldAssetsReady;
		let stopOnFailure!: () => void;
		const firstFailure = new Promise<void>((resolve) => { stopOnFailure = resolve; });
		const abandonImages = new Set<() => void>();
		const cancelLoad = () => {
			for (const abandon of abandonImages) abandon();
		};
		// A repeated Image.src can reuse a hung transfer or a corrupt HTTP cache
		// entry. Retry only missing images with a fresh request, while the worker
		// still resolves the request to the installed revision when available.
		const retryQuery = retry ? `?reliquary-art-retry=${Date.now()}-${token}` : "";
		this.cancelAssetLoad = cancelLoad;
		this.clearWorldAssetStallTimer();
		let done = essentialSettled.size;
		this.worldAssetsLoading = true;
		this.worldAssetsStalled = false;
		this.requiredAssetsLoading = requiredPending.size > 0;
		if (!priorReady) this.worldAssetsReady = false;
		this.worldAssetFailures = [];
		this.assetFailures = [];
		this.loadProgress = done / essential.length;
		this.emit();
		if (token !== this.bootToken || this.lifecycle !== "booted") return;
		this.worldAssetStallTimer = setTimeout(() => {
			this.worldAssetStallTimer = null;
			if (token !== this.bootToken || this.lifecycle !== "booted" || !this.worldAssetsLoading) return;
			this.worldAssetsStalled = true;
			this.emit();
		}, WORLD_ASSET_STALL_MS);
		const load = (entry: AssetEntry, worldArt: boolean) => new Promise<void>((resolve) => {
			if (this.images[entry.key]) { resolve(); return; }
			const img = new Image();
			img.crossOrigin = "anonymous";
			if (worldArt) img.fetchPriority = "high";
			const settle = () => {
				img.onload = null;
				img.onerror = null;
				abandonImages.delete(abandon);
				resolve();
			};
			const abandon = () => {
				settle();
				img.removeAttribute("src");
			};
			abandonImages.add(abandon);
			img.onload = () => {
				settle();
				if (token !== this.bootToken || this.lifecycle !== "booted") return;
				this.images[entry.key] = img;
				this.terrain = null;
				let changed = false;
				if (worldArt) {
					if (!essentialSettled.has(entry.key)) done += 1;
					essentialSettled.add(entry.key);
					this.loadProgress = done / essential.length;
					if (essentialSettled.size === essential.length) {
						this.worldAssetsLoading = false;
						this.worldAssetsStalled = false;
						this.clearWorldAssetStallTimer();
						this.loadProgress = 1;
						this.worldAssetFailures = [...worldFailures];
						if (!priorReady) this.worldAssetsReady = worldFailures.size === 0;
					}
					changed = true;
				}
				if (entry.required) {
					requiredPending.delete(entry.url);
					this.requiredAssetsLoading = requiredPending.size > 0;
					changed = true;
				}
				if (changed) this.emit();
			};
			img.onerror = () => {
				settle();
				if (token === this.bootToken && this.lifecycle === "booted") {
					if (entry.required) {
						requiredFailures.add(entry.url);
						requiredPending.delete(entry.url);
						this.requiredAssetsLoading = requiredPending.size > 0;
					}
					let changed = entry.required;
					if (worldArt) {
						worldFailures.add(entry.url);
						if (!essentialSettled.has(entry.key)) done += 1;
						essentialSettled.add(entry.key);
						this.loadProgress = done / essential.length;
						this.worldAssetFailures = [...worldFailures];
						if (!priorReady) this.worldAssetsReady = false;
						this.worldAssetsLoading = false;
						this.worldAssetsStalled = false;
						this.clearWorldAssetStallTimer();
						stopOnFailure();
						changed = true;
					}
					this.assetFailures = [...requiredFailures];
					if (essentialSettled.size === essential.length) {
						this.worldAssetsLoading = false;
						this.worldAssetsStalled = false;
						this.clearWorldAssetStallTimer();
						this.loadProgress = 1;
						this.worldAssetFailures = [...worldFailures];
						if (!priorReady) this.worldAssetsReady = worldFailures.size === 0;
					}
					if (changed) this.emit();
				}
			};
			img.src = entry.url + retryQuery;
		});
		const worldLoads = essential.map((entry) => load(entry, true));
		const remainingLoads = entries.filter((entry) => !isEssentialWorldAsset(entry)).map((entry) => load(entry, false));
		// Keep cancellation available while any image is pending, even after the
		// title reports a failure or admits the player to the world.
		void Promise.all([...worldLoads, ...remainingLoads]).then(() => {
			if (this.cancelAssetLoad === cancelLoad) this.cancelAssetLoad = null;
		});
		await Promise.race([Promise.all(worldLoads), firstFailure]);
		if (token !== this.bootToken || this.lifecycle !== "booted") return;
		if (essentialSettled.size === essential.length) {
			this.worldAssetsLoading = false;
			this.worldAssetsStalled = false;
			this.clearWorldAssetStallTimer();
			this.loadProgress = 1;
			this.worldAssetFailures = [...worldFailures];
			if (!priorReady) this.worldAssetsReady = worldFailures.size === 0;
			this.assetFailures = [...requiredFailures];
			this.emit();
		}
	}
	async boot(canvas: HTMLCanvasElement): Promise<void> {
		if (this.lifecycle === "booted") return;
		const token = ++this.bootToken;
		this.canvas = canvas;
		canvas.width = this.viewW * TILE;
		canvas.height = this.viewH * TILE;
		this.lifecycle = "booted";
		this.lastTs = 0;
		this.mode = "title";
		this.emit();
		this.raf = requestAnimationFrame(this.loop);
		this.bindInput();
		// The controls probe is a QA cheat: ship it only to dev servers and
		// browser-test bundles (VITE_RELIQUARY_BROWSER_TEST=1), never to production.
		// The controls probe is a QA cheat: dev servers and browser-test bundles
		// only. Direct member reads (never bind import.meta.env to a variable) so
		// Vite's per-key define replacement prevents env serialization in the
		// production bundle. Node test runs have no import.meta.env at all and
		// drive battles through the probe, so they keep it unconditionally.
		let devServer = false;
		try {
			devServer = import.meta.env.DEV === true;
		} catch {
			/* node: import.meta.env is undefined */
		}
		const inNode = typeof process !== "undefined" && Boolean(process.versions?.node);
		if (devServer || inNode || shouldExposeControlsTestOnWindow()) this.installProbe();
		if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
			this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		}
		await this.loadImages(token);
	}
	async retryWorldAssets(): Promise<void> {
		if (this.lifecycle !== "booted" || this.worldAssetsReady && !this.worldAssetFailures.length && !this.assetFailures.length && !this.requiredAssetsLoading) return;
		this.cancelAssetLoad?.();
		await this.loadImages(++this.bootToken, true);
	}
	destroy(): void {
		this.bootToken += 1;
		this.cancelAssetLoad?.();
		this.cancelAssetLoad = null;
		this.clearWorldAssetStallTimer();
		this.worldAssetsLoading = false;
		this.worldAssetsStalled = false;
		this.requiredAssetsLoading = false;
		this.worldAssetsReady = false;
		if (this.lifecycle === "booted") {
			cancelAnimationFrame(this.raf);
			this.raf = 0;
			window.removeEventListener("keydown", this.onKeyDown);
			window.removeEventListener("keyup", this.onKeyUp);
			window.removeEventListener("blur", this.onBlur);
			document.removeEventListener("visibilitychange", this.visibilityHandler);
			if (window.__controlsTest === this.probe) delete window.__controlsTest;
		}
		this.lifecycle = "stopped";
		stopMusic();
		this.keys.clear();
		this.injected = null;
		this.lastTs = 0;
		this.animWait = 0;
		this.animFn = null;
		this.canvas = null;
		this.terrain = null;
	}
	cw(): number {
		return this.viewW * TILE;
	}
	ch(): number {
		return this.viewH * TILE;
	}
	layout(stageW: number, stageH: number, devicePortrait = false, frameCottage = false): void {
		// Battles own their stage (16:9 at the reference size, fitted rows/columns
		// for other aspect ratios) so the composition is not squeezed into the
		// exploration camera. The overworld keeps its 12x9 / 10x16 behavior.
		const inBattle = this.mode === "battle";
		const presentation = inBattle ? battlePresentation(stageW, stageH, devicePortrait) : null;
		const portrait = presentation === "portrait" ||
			(!inBattle && stageW > 0 && stageH > stageW * 1.05 && stageW < 920);
		const battleSize = presentation ? battleViewportForStage(presentation, stageW, stageH) : null;
		const room = this.mode === "world" && isInteriorRoom(this.mapId) ? this.map() : null;
		const cottage = frameCottage && this.mode === "world" && this.mapId === "home" ? room : null;
		// Interior maps are authored as complete rooms. Fit the whole room on
		// portrait screens so the threshold and every service prop remain visible;
		// this changes only the camera viewport, never map topology.
		// Rowan's cottage keeps its legacy viewport unless the responsive shell
		// explicitly opts into the authored full-room frame; service interiors can
		// always use their complete portrait composition.
		const framedRoom = room && (cottage || (portrait && this.mapId !== "home")) ? room : null;
		const vw = framedRoom?.ground[0]?.length ?? battleSize?.viewW ?? (portrait ? VIEW_W_PORT : VIEW_W);
		let vh = framedRoom?.ground.length ?? battleSize?.viewH ?? (portrait ? VIEW_H_PORT : VIEW_H);
		// Dialogue stays on the exploration view. Snapping back to the short
		// canvas made the playfield jump inward whenever a sign or conversation opened.
		if (!cottage && portrait && devicePortrait && this.mode === "world" && !this.menu) {
			const map = this.map();
			if ((map.ground[0]?.length ?? 0) >= VIEW_W_PORT) {
				// Frame the Grove at the edge of its authored clearing.
				const minMapHeight = map.id === "grove" ? 0 : VIEW_H_PORT;
				const maxHeight = Math.min(20, Math.max(minMapHeight, map.ground.length)) * TILE;
				const height = Math.max(12 * TILE, Math.min(maxHeight, Math.floor(stageH / stageW * vw * TILE)));
				vh = height / TILE;
			}
		}
		const ar = vw / vh;
		let cssW = stageW;
		let cssH = stageW / ar;
		if (cssH > stageH) {
			cssH = stageH;
			cssW = stageH * ar;
		}
		cssW = Math.max(1, Math.floor(cssW));
		cssH = Math.max(1, Math.floor(cssH));
		const canvas = this.canvas;
		if (!canvas) return;
		if (this.viewW === vw && this.viewH === vh && this.cssW === cssW && this.cssH === cssH && canvas.width === vw * TILE && canvas.height === vh * TILE) return;
		this.viewW = vw;
		this.viewH = vh;
		this.cssW = cssW;
		this.cssH = cssH;
		this.resetWorldCameraRelief();
		canvas.width = vw * TILE;
		canvas.height = vh * TILE;
		if (this.mode === "battle") {
			this.battleStableReserve = null;
			this.battleLayoutCanvasKey = null;
		}
		this.emit();
	}

	private bindInput(): void {
		window.addEventListener("keydown", this.onKeyDown);
		window.addEventListener("keyup", this.onKeyUp);
		window.addEventListener("blur", this.onBlur);
		document.addEventListener("visibilitychange", this.visibilityHandler);
	}
	private onKeyDown = (e: KeyboardEvent): void => {
		const target = e.target;
		if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
		// Shift+Tab must remain native inside dialogs. Treating its modifier as
		// the legacy cancel shortcut closes the panel before Tab can wrap focus.
		if (e.code === "ShiftLeft" && (this.dialog || this.namePrompt ||
			(target instanceof HTMLElement && target.closest("[role='dialog']")))) return;
		if (target instanceof HTMLElement && target.closest("button") && (e.code === "Enter" || e.code === "Space")) {
			if (e.repeat) e.preventDefault();
			return;
		}
		if (CONTROL_KEYS.has(e.code)) e.preventDefault();
		this.keys.add(e.code);
		if (e.repeat && ["KeyZ", "Enter", "Space", "KeyX", "Escape", "ShiftLeft", "KeyM", "KeyC"].includes(e.code)) return;
		if (e.code === "KeyZ" || e.code === "Enter" || e.code === "Space") this.confirm();
		if (e.code === "KeyX" || e.code === "Escape" || e.code === "ShiftLeft") this.cancel();
		if (e.code === "KeyM" || e.code === "KeyC") this.toggleMenu();
		const up = e.code === "ArrowUp" || e.code === "KeyW";
		const down = e.code === "ArrowDown" || e.code === "KeyS";
		if ((this.menu || this.battle || this.mode === "shop") && (up || down)) {
			const max = this.menuLen();
			if (max > 0) {
				const direction = up ? -1 : 1;
				this.moveMenu(direction, max);
				const list = target instanceof HTMLElement ? target.closest("ul.cmd, ul.menu-list") : null;
				const rootPanel = this.menu === "root" && target instanceof HTMLElement ? target.closest(".overlay-panel") : null;
				const buttons = rootPanel
					? rootPanel.querySelectorAll<HTMLButtonElement>(".menu-list button, .overlay-panel-close")
					: list?.querySelectorAll<HTMLButtonElement>("button");
				if (buttons?.length === max) {
					for (let i = 0; i < max && buttons[this.menuIndex]?.disabled; i++) this.moveMenu(direction, max);
					buttons[this.menuIndex]?.focus();
				}
			}
		}
	};
	private onKeyUp = (e: KeyboardEvent): void => {
		this.keys.delete(e.code);
	};
	private onBlur = (): void => {
		this.keys.clear();
	};
	private held(): Set<string> {
		if (this.injected) return new Set(this.injected);
		return this.keys;
	}
	setKeys(codes: string[]): void {
		this.injected = codes.length ? codes : null;
	}
	private installProbe(): void {
		this.probe = {
			getYaw: () => YAW[this.dir],
			getSpeed: () => this.moving ? 1 : this.mode === "world" && this.wantDir() != null ? .5 : 0,
			setKeys: (codes) => this.setKeys(codes),
			setSteer: (v) => {
				if (v > .2) this.setKeys(["KeyA"]);
				else if (v < -.2) this.setKeys(["KeyD"]);
				else this.setKeys([]);
			},
			getPos: () => ({
				map: this.mapId,
				x: this.tx,
				y: this.ty,
				mode: this.mode,
				dialog: !!this.dialog
			}),
			warp: (map, x, y) => {
				this.warp(map, x, y, 0);
			},
			startWild: () => {
				if (!this.party.length) {
					this.party = [makeBeast("emberkit", 5, { random: this.random })];
					this.flags.starter = true;
					this.caught.emberkit = true;
					this.seen.emberkit = true;
				}
				this.mapId = "briar_road";
				this.startWild();
			}
		};
		if (shouldExposeControlsTestOnWindow()) window.__controlsTest = this.probe;
	}
	startNew(notice?: string): void {
		if (!this.worldAssetsReady) return;
		unlockAudio();
		startMusic();
		sfxPlay.confirm();
		this.playerName = "Rowan";
		this.playTime = 0;
		this.animWait = 0;
		this.animFn = null;
		this.quietBell = 0;
		this.toast = null;
		this.toastT = 0;
		this.keys.clear();
		this.injected = null;
		this.mapId = "home";
		this.tx = MAPS.home!.spawn.x;
		this.ty = MAPS.home!.spawn.y;
		this.px = this.tx * TILE;
		this.py = this.ty * TILE;
		this.dir = 0;
		this.gold = STARTING_GOLD;
		this.party = [];
		this.box = [];
		this.inventory = {
			tonic: 3,
			common_sigil: 5,
			salve: 1
		};
		this.flags = {};
		this.seen = {};
		this.caught = {};
		this.battle = null;
		this.menu = null;
		this.namePrompt = null;
		this.moving = false;
		this.encounterLock = false;
		this.mode = "world";
		this.openDialog("", [
			...(notice ? [notice] : []),
			"A lantern ticks on the sill. Morning in Elderhall smells of peat and bread.",
			"You are Rowan, newly sworn Pactwarden. The Crown of Binding cracked a generation ago — beasts walk feral on the old roads.",
			`Move with arrows or the D-pad. Use Enter or A to interact. Exit south, then go west to Binding Grove. Elder Maren ${marenLandmark(isElderhallCandidateBuild())} can help.`
		]);
	}
	continueGame(): void {
		if (!this.worldAssetsReady) return;
		unlockAudio();
		startMusic();
		const s = loadSave(this.readOnlySaveSource);
		if (!s) {
			this.hasSave = false;
			this.startNew(
				"The last lantern fell silent — its story could not be read. This is a new beginning.",
			);
			return;
		}
		this.applySave(s);
		this.mode = "world";
		this.restoreNamePrompt(true);
		this.toastMsg(SAVE_RESUMED_MESSAGE);
		this.replayEndingIfOwed();
		this.emit();
	}
	private applySave(s: GameSave): void {
		this.playerName = s.playerName;
		this.mapId = s.mapId;
		this.tx = s.x;
		this.ty = s.y;
		this.px = s.x * TILE;
		this.py = s.y * TILE;
		this.dir = s.dir;
		this.gold = s.gold;
		this.playTime = s.playTime;
		this.party = s.party;
		this.box = s.box;
		this.inventory = s.inventory;
		this.flags = s.flags;
		this.seen = s.seen;
		this.caught = s.caught;
	}
	/** The live state as a save. Single source of truth for persisting and exporting. */
	currentSave(): GameSave {
		return {
			version: SAVE_VERSION,
			worldRevision: WORLD_REVISION,
			playerName: this.playerName,
			mapId: this.mapId,
			x: this.tx,
			y: this.ty,
			dir: this.dir,
			gold: this.gold,
			playTime: this.playTime,
			party: this.party,
			box: this.box,
			inventory: this.inventory,
			flags: this.flags,
			seen: this.seen,
			caught: this.caught
		};
	}
	exportGame(): boolean {
		if (this.mode !== "world") return false;
		const text = serializeSave(this.currentSave());
		if (text === null) {
			this.toastMsg("The lantern cannot be written as it stands.");
			this.emit();
			return false;
		}
		if (!this.exportFile) {
			this.toastMsg("This browser will not hand out save files.");
			this.emit();
			return false;
		}
		const slug = this.playerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wanderer";
		const written = this.exportFile(`reliquary-${slug}.json`, text);
		this.toastMsg(written ? "The lantern is copied to a file." : "The file could not be written.");
		this.emit();
		return written;
	}
	exportRecoverySave(archived = false): boolean {
		if (this.mode !== "title") return false;
		const text = archived ? findArchivedSave(this.readOnlySaveSource) : findNewerSave(this.readOnlySaveSource);
		return text !== null && (this.exportFile?.(archived ? "reliquary-archived-save.json" : "reliquary-newer-save.json", text) ?? false);
	}
	/** Ask the shell to open a file picker; the chosen text comes back to importGame. */
	requestImport(): void {
		if (this.mode !== "world" || this.battle) return;
		this.importTicket += 1;
		this.emit();
	}
	importGame(text: string): boolean {
		if (this.battle) {
			this.toastMsg("Not in the middle of a fight.");
			this.emit();
			return false;
		}
		// Engine-boundary authorization: a tab that lost (or has not yet been
		// granted) the save-writer session must not replace durable slots or
		// apply imported live state, even if a caller skips the UI guard.
		if (!this.saveWriteAllowed) {
			this.toastMsg("Another window holds your save. This tab is read-only.");
			this.emit();
			return false;
		}
		const save = parseSave(text);
		if (!save) {
			this.openDialog("The lantern", [
				"That file is not a readable Reliquary record. Nothing was changed."
			]);
			this.emit();
			return false;
		}
		if (!writeSave(save)) {
			this.openDialog("The lantern", [
				"This browser refused the record. Your last save is untouched."
			]);
			this.emit();
			return false;
		}
		this.applySave(save);
		this.restoreNamePrompt(false);
		this.menu = null;
		this.menuIndex = 0;
		this.hasSave = true;
		this.toastMsg(`The lantern takes up ${save.playerName} — ${MAPS[save.mapId]?.name ?? save.mapId}.`);
		this.replayEndingIfOwed();
		this.emit();
		return true;
	}
	setSaveWriteAllowed(allowed: boolean, message?: string): void {
		this.saveWriteAllowed = allowed && !this.readOnlySaveSource;
		if (!allowed && message) this.toastMsg(message);
		this.emit();
	}
	get canWriteSave(): boolean {
		return this.saveWriteAllowed;
	}
	persist(): boolean {
		if (!this.saveWriteAllowed) {
			this.toastMsg("Another window holds your save. This tab is read-only.");
			return false;
		}
		const saved = writeSave(this.currentSave());
		if (saved) {
			this.hasSave = true;
			this.emit();
		} else this.toastMsg("Could not save. Keep this window open and retry.");
		return saved;
	}
	private map(): MapDef {
		return MAPS[this.mapId]!;
	}
	private groundAt(x: number, y: number): string {
		const m = this.map();
		if (y < 0 || x < 0 || y >= m.ground.length || x >= (m.ground[0]?.length ?? 0)) return "#";
		return m.ground[y]![x]!;
	}
	private occupied(x: number, y: number): boolean {
		return isOccupied(this.map(), this.flags, x, y);
	}
	private persistBattleCheckpoint(): boolean {
		this.safeCheckpoint = cloneSave(this.currentSave());
		if (!this.saveWriteAllowed) return false;
		const saved = writeSave(this.safeCheckpoint);
		if (!saved) {
			this.toastMsg("Could not write a pre-battle save. Keep this window open and finish quickly.");
		}
		return saved;
	}
	private wantDir(): Dir | null {
		const k = this.held();
		if (k.has("KeyA") || k.has("ArrowLeft")) return 1 as Dir;
		if (k.has("KeyD") || k.has("ArrowRight")) return 2 as Dir;
		if (k.has("KeyW") || k.has("ArrowUp")) return 3 as Dir;
		if (k.has("KeyS") || k.has("ArrowDown")) return 0 as Dir;
		return null;
	}
	private loop = (ts: number): void => {
		if (this.lifecycle !== "booted") return;
		const dt = Math.min(.1, this.lastTs ? (ts - this.lastTs) / 1e3 : .016);
		this.lastTs = ts;
		if (this.mode !== "title" && this.mode !== "boot") this.playTime += dt;
		if (this.toastT > 0) {
			this.toastT -= dt;
			if (this.toastT <= 0) { this.toast = null; this.emit(); }
		}
		if (this.animWait > 0) {
			this.animWait -= dt;
			if (this.animWait <= 0 && this.animFn) {
				const fn = this.animFn;
				this.animFn = null;
				fn();
			}
		}
		if (this.mode === "battle" && this.battle?.phase === "anim" && this.battle.animCue) {
			this.battle.animElapsedMs += dt * 1000;
			const dur = battleAnimDurationMs(this.battle.animCue, this.reducedMotion);
			if (this.battle.animElapsedMs >= dur) {
				this.battle.animCue = null;
				this.battle.animElapsedMs = 0;
				if (this.battle.phase === "anim") {
					this.battle.phase = "command";
					this.battle.menuIndex = 0;
					this.menuIndex = 0;
					this.emit();
				}
			}
		}
		if (this.mode === "battle") this.battleIdlePhase += dt;
		if (this.mode === "world" && (!this.dialog || this.injected) && !this.menu && !this.namePrompt) this.tickMove(dt);
		this.draw(dt);
		this.raf = requestAnimationFrame(this.loop);
	};
	private tickMove(dt: number): void {
		if (this.moving) {
			this.moveT += dt * 1e3;
			const t = Math.min(1, this.moveT / WALK_MS);
			this.px = this.fromX + (this.toX - this.fromX) * t;
			this.py = this.fromY + (this.toY - this.fromY) * t;
			this.walkFrame = Math.floor(t * 4) % 4;
			if (t >= 1) {
				this.moving = false;
				this.tx = Math.round(this.toX / TILE);
				this.ty = Math.round(this.toY / TILE);
				this.px = this.tx * TILE;
				this.py = this.ty * TILE;
				this.afterStep();
			}
			return;
		}
		const d = this.wantDir();
		if (d == null) {
			this.walkFrame = 0;
			const wasLatched = this.autoEnterLatch;
			this.autoEnterLatch = false;
			if (wasLatched) this.refreshInteractionHint();
			return;
		}
		this.dir = d;
		const nx = this.tx + DIRS[d].x;
		const ny = this.ty + DIRS[d].y;
		const warp = this.map().warps.find((w) => w.x === nx && w.y === ny);
		if (warp) {
			if (!this.flags.starter && (warp.to === "briar_road" || this.mapId === "elderhall" && ny <= 0)) {
				this.openDialog("Gateward", ["The Briar Road is no place without a pact-beast. Speak with Elder Maren."], undefined, { npcId: "guard", sprite: "guard" });
				return;
			}
			this.warp(warp.to, warp.tx, warp.ty, warp.dir ?? d);
			return;
		}
		if (!this.autoEnterLatch) {
			const door = this.doorAhead(nx, ny, d);
			if (door) {
				this.handleInteract(door);
				return;
			}
		}
		if (this.occupied(nx, ny)) {
			this.refreshInteractionHint();
			return;
		}
		this.moving = true;
		this.moveT = 0;
		this.fromX = this.px;
		this.fromY = this.py;
		this.toX = nx * TILE;
		this.toY = ny * TILE;
		this.refreshInteractionHint();
	}
	private afterStep(): void {
		const here = this.map().warps.find((w) => w.x === this.tx && w.y === this.ty);
		if (here) {
			this.warp(here.to, here.tx, here.ty, here.dir ?? this.dir);
			return;
		}
		if (this.quietBell > 0) this.quietBell -= 1;
		this.settledSteps += 1;
		if (this.settledSteps >= 8) {
			this.settledSteps = 0;
			this.persist();
		}
		const def = encounterAt(this.map(), this.tx, this.ty);
		if (def && this.party.length && this.quietBell <= 0 && !this.encounterLock) {
			const rolled = rollEncounter(def, this.random);
			if (rolled) this.startWildFrom(rolled.species, rolled.level);
		}
		this.refreshInteractionHint();
	}
	private resetWorldCameraRelief(): void {
		resetWorldCamRelief(this.worldCamRelief);
		this.worldCameraSnap = { x: {}, y: {} };
	}
	/** Building door in front of the player, when walking into it should enter. */
	private doorAhead(nx: number, ny: number, facing: Dir): string | null {
		const obj = pickInteractObject(visibleObjects(this.map().objects, this.flags), nx, ny, facing);
		if (!obj?.autoEnter || !obj.interact || !WARP_TABLE[obj.interact]) return null;
		return obj.interact;
	}
	private warp(to: string, x: number, y: number, dir: Dir): void {
		if (!this.worldAssetsReady) return;
		if (!MAPS[to]) return;
		this.autoEnterLatch = true;
		this.resetWorldCameraRelief();
		this.mapId = to;
		this.tx = x;
		this.ty = y;
		this.px = x * TILE;
		this.py = y * TILE;
		this.dir = dir;
		this.moving = false;
		sfxPlay.step();
		this.emit();
	}
	// ---- UI command surface -------------------------------------------------
	// Overlays drive the game through these methods instead of assigning
	// engine fields directly, so engine invariants (index mirroring, emit
	// discipline) stay inside the engine.

	/** Shared menu index; an open battle mirrors it into the battle state. */
	setMenuIndex(i: number): void {
		this.menuIndex = i;
		if (this.battle) this.battle.menuIndex = i;
	}

	/** Select a world-menu item and confirm it. */
	chooseMenu(i: number): void {
		this.menuIndex = i;
		this.menuConfirm();
	}

	/** Select a battle option (index mirrored) and confirm it. */
	chooseBattle(i: number): void {
		this.setMenuIndex(i);
		this.confirm();
	}

	/** Confirm a root command by identity; unavailable commands are inert. */
	chooseBattleCommand(command: BattleCommand): void {
		if (!this.battle || this.battle.phase !== "command") return;
		const index = battleCommands(this.battle).indexOf(command);
		if (index < 0) return;
		this.chooseBattle(index);
	}

	/** Highlight a battle option without committing to it (emits so the HUD updates). */
	previewBattle(i: number): void {
		this.setMenuIndex(i);
		this.emit();
	}

	/** Highlight a root command by identity without executing it. */
	previewBattleCommand(command: BattleCommand): void {
		if (!this.battle || this.battle.phase !== "command") return;
		const index = battleCommands(this.battle).indexOf(command);
		if (index < 0) return;
		this.setMenuIndex(index);
		this.emit();
	}

	/** Battle-item eligibility, shared with the HUD so it can explain greyed rows. */
	battleItemHasEffect(id: string): boolean {
		const battle = this.battle;
		if (!battle) return false;
		const active = this.party[battle.playerIndex];
		if (!active) return false;
		return this.itemHasEffect(id, active, true);
	}

	/** Presentation-only menu tick for pointer/keyboard selection changes. */
	playMenuCue(): void {
		sfxPlay.menu();
	}

	/** Shop tab switch from the UI. */
	setShopTab(mode: "buy" | "sell"): void {
		this.shopMode = mode;
		this.shopIndex = 0;
		this.emitPublic();
	}

	/** Highlight a shop row without purchasing. */
	previewShopRow(i: number): void {
		this.shopIndex = i;
		this.emitPublic();
	}

	/** Victory epilogue dismissal from the UI. */
	dismissVictory(): void {
		this.mode = "world";
		this.emitPublic();
	}

	/**
	 * Claim a pending rename request for a beast. Returns true when the
	 * request targeted this beast (and clears + emits it); false otherwise.
	 */
	takeRenameSelection(uid: string): boolean {
		if (this.selectedUid !== uid) return false;
		this.selectedUid = null;
		this.emitPublic();
		return true;
	}

	/** Touch pad key hold from the UI. */
	holdKey(code: string, down: boolean): void {
		if (down) this.keys.add(code);
		else this.keys.delete(code);
	}

	/** A queued click belongs to the page whose action was rendered under it. */
	activateDialogueAction = (revision: number | null, action: "confirm" | "cancel"): void => {
		const current = this.dialog ? this.dialogRevision : null;
		if (revision === current) this[action]();
	};

	confirm = (): void => {
		unlockAudio();
		if (this.mode === "title") return;
		if (this.dialog) {
			this.dialogRevision += 1;
			sfxPlay.confirm();
			if (this.dialog.index < this.dialog.pages.length - 1) this.dialog.index += 1;
			else {
				const done = this.dialog.onDone;
				this.dialog = null;
				if (this.mode === "dialog") this.mode = "world";
				done?.();
			}
			this.emit();
			return;
		}
		if (this.namePrompt) return;
		if (this.battle) {
			this.battleConfirm();
			return;
		}
		if (this.mode === "shop") {
			this.shopConfirm();
			return;
		}
		if (this.menu) {
			this.menuConfirm();
			return;
		}
		if (this.mode === "world") this.interact();
	};
	cancel = (): void => {
		if (this.namePrompt && !this.dialog) {
			this.submitCreatureName(null);
			return;
		}
		if (this.dialog) {
			const secondary = dialogSecondaryLabel(this.dialog);
			if (!secondary) return;
			this.dialogRevision += 1;
			if (secondary === "Back") this.dialog.index -= 1;
			else {
				const onCancel = this.dialog.onCancel;
				this.dialog = null;
				if (this.mode === "dialog") this.mode = "world";
				onCancel?.();
			}
			sfxPlay.cancel();
			this.emit();
			return;
		}
		if (this.battle) {
			if (this.battle.phase === "party" && this.party[this.battle.playerIndex]!.hp <= 0) return;
			if (this.battle.phase === "skills" || this.battle.phase === "items" || this.battle.phase === "party" || this.battle.phase === "bind") {
				this.battle.phase = "command";
				this.battle.menuIndex = 0;
				sfxPlay.cancel();
				this.emit();
			}
			return;
		}
		if (this.mode === "shop") {
			this.mode = "world";
			sfxPlay.cancel();
			this.emit();
			return;
		}
		if (this.menu) {
			if (this.menu === "root") this.menu = null;
			else if (this.menu === "learn") this.menu = this.learnOrigin;
			else if (this.cardAction && (this.menu === "party" || this.menu === "storage")) {
				const uid = this.cardAction.uid;
				this.cardAction = null;
				this.menuIndex = this.cardIndexOf(uid);
				sfxPlay.cancel();
				this.emit();
				return;
			} else if (this.menu === "itemTarget") {
				this.menu = "items";
				const item = this.packTarget?.item;
				this.menuIndex = item ? Math.max(0, this.usableItems().indexOf(item)) : 0;
			} else this.menu = "root";
			this.menuIndex = 0;
			sfxPlay.cancel();
			this.emit();
		}
	};
	toggleMenu = (): void => {
		if (this.mode !== "world" || this.dialog || this.battle || this.namePrompt) return;
		if (this.menu) {
			this.menu = null;
			this.cardAction = null;
			this.learnMenu = null;
			this.packTarget = null;
		} else this.menu = "root";
		this.menuIndex = 0;
		sfxPlay.menu();
		this.emit();
	};
	emitPublic = (): void => {
		this.emit();
	};
	setLead(uid: string): void {
		if (this.mode !== "world" || (this.menu !== "party" && this.menu !== "storage") || this.battle || this.dialog) return;
		const party = moveToLead(this.party, uid);
		if (!party) return;
		this.party = party;
		this.persist();
		this.emit();
	}
	updateCreatureNameDraft(value: string): void {
		if (!this.namePrompt || value.length > 40 || value === this.namePrompt.draft) return;
		this.namePrompt = { ...this.namePrompt, draft: value };
		if (this.saveWriteAllowed) writeNameDraft(this.namePrompt.uid, value);
	}
	/** Empty, too long, or unchanged text keeps the creature's current name. */
	submitCreatureName(value: string | null): void {
		const prompt = this.namePrompt;
		if (!prompt) return;
		this.namePrompt = null;
		const beast = this.party.concat(this.box).find((item) => item.uid === prompt.uid);
		const renamed = beast && value != null ? renameCreature(beast, value) : null;
		if (renamed) {
			this.party = this.party.map((item) => item.uid === prompt.uid ? renamed : item);
			this.box = this.box.map((item) => item.uid === prompt.uid ? renamed : item);
		}
		const nickname = renamed?.nickname ?? beast?.nickname ?? prompt.speciesName;
		const saved = this.settleNameOffer(prompt.kind, prompt.uid);
		if (prompt.kind === "starter") {
			this.openDialog("Rowan", [
      `The grove goes still. ${nickname} steps down from the stone and comes to my side. Our first road together.`,
				"East to Elderhall, then north to Briar Road. A sigil works best on a weakened wild beast.",
			], undefined, isElderhallCandidateBuild() ? { npcId: "rowan", sprite: "player" } : undefined, undefined, prompt.speciesId);
			return;
		}
		if (renamed && saved) this.toastMsg(`${renamed.nickname} it is.`);
		this.replayEndingIfOwed();
		this.emit();
	}
	private settleNameOffer(kind: NamePromptView["kind"], uid: string): boolean {
		delete this.flags[nameOfferFlag(kind, uid)];
		const saved = this.persist();
		if (saved) writeNameDraft(uid, null);
		return saved;
	}
	renamePartyCreature(uid: string, value: string): void {
		if (this.mode !== "world" || (this.menu !== "party" && this.menu !== "storage") || this.battle || this.dialog) return;
		const original = this.party.concat(this.box).find((beast) => beast.uid === uid);
		const renamed = original && renameCreature(original, value);
		if (!renamed) return;
		this.party = this.party.map((beast) => beast.uid === uid ? renamed : beast);
		this.box = this.box.map((beast) => beast.uid === uid ? renamed : beast);
		this.persist();
		this.emit();
	}
	openLearnMenu(uid: string): void {
		if (this.mode !== "world" || (this.menu !== "party" && this.menu !== "storage") || this.battle || this.dialog) return;
		const beast = this.party.find((item) => item.uid === uid);
		const head = beast?.pendingSkills?.[0];
		if (!beast || !head) return;
		this.learnOrigin = this.menu;
		this.menu = "learn";
		this.menuIndex = beast.skills.length;
		this.learnMenu = { uid, skill: head };
		this.emit();
	}
	trainCreature(uid: string): void {
		if (this.mode !== "world" || (this.menu !== "party" && this.menu !== "storage") || this.battle || this.dialog) return;
		const beast = this.party.find((item) => item.uid === uid);
		if (!beast || beast.hp <= 0 || beast.level >= MAX_LEVEL || this.gold < PRACTICE_COST) return;
		this.gold -= PRACTICE_COST;
		this.toast = null;
		this.toastT = 0;
		this.grantXp(beast, PRACTICE_LORE);
		const announcement = this.toast;
		if (this.persist() && !announcement) this.toastMsg(`${beast.nickname} gained ${PRACTICE_LORE} lore from practice.`);
		this.emit();
	}
	transferBeast(uid: string, destination: "party" | "box"): void {
		if (this.mode !== "world" || this.menu !== "storage" || this.battle || this.dialog) return;
		const result = transferBeast(this.party, this.box, uid, destination);
		if (!result) { this.toastMsg("Keep a capable companion and leave room in your party."); return; }
		this.party = result.party;
		this.box = result.box;
		this.persist();
		this.emit();
	}
	private menuLen(): number {
		if (this.mode === "shop") {
			if (this.shopMode === "buy") return SHOP_STOCK.length;
			return Object.keys(this.inventory).filter((id) => (this.inventory[id] ?? 0) > 0).length;
		}
		if (this.menu === "root") return ROOT_MENU.length;
		if (this.menu === "items") return this.usableItems().length;
		if (this.menu === "learn") {
			const beast = this.party.find((item) => item.uid === this.learnMenu?.uid);
			return (beast?.skills.length ?? 0) + 1;
		}
		if (this.menu === "itemTarget") return this.packTarget?.uids.length ?? 0;
		if (this.menu === "party" || this.menu === "storage") {
			if (this.cardAction) return this.cardActions().length;
			return this.menu === "party" ? this.party.length : this.party.length + this.box.length;
		}
		const b = this.battle!;
		if (!b) return 0;
		if (b.phase === "command") return battleCommands(b).length;
		if (b.phase === "skills") return this.party[b.playerIndex]?.skills.length ?? 0;
		if (b.phase === "items") return this.usableItems().length;
		if (b.phase === "bind") return BATTLE_SIGILS.filter((s) => (this.inventory[s] ?? 0) > 0).length;
		if (b.phase === "party") return this.party.length;
		return 0;
	}
	moveMenu(delta: number, max: number): void {
		if (max <= 0) return;
		this.menuIndex = (this.menuIndex + delta + max) % max;
		if (this.battle) this.battle.menuIndex = this.menuIndex;
		if (this.mode === "shop") this.shopIndex = this.menuIndex;
		sfxPlay.menu();
		this.emit();
	}
	private interact(): void {
		const fx = this.tx + DIRS[this.dir].x;
		const fy = this.ty + DIRS[this.dir].y;
		const m = this.map();
		const target = selectInteractionTarget(m.npcs, visibleObjects(m.objects, this.flags), fx, fy, this.dir);
		if (target?.kind === "npc") {
			const npc = m.npcs.find((candidate) => candidate.id === target.id)!;
			this.talk(npc.talk, npc.name, { npcId: npc.id, sprite: npc.sprite });
			return;
		}
		if (target?.kind === "object") this.handleInteract(target.object.interact!);
	}
	private currentInteractionHint(): string | null {
		if (this.mode !== "world" || this.moving || this.dialog || this.menu || this.namePrompt || this.autoEnterLatch) return null;
		const m = this.map();
		const target = selectInteractionTarget(
			m.npcs,
			visibleObjects(m.objects, this.flags),
			this.tx + DIRS[this.dir].x,
			this.ty + DIRS[this.dir].y,
			this.dir,
		);
		if (!target) return null;
		let action = "Interact";
		if (target.kind === "npc") action = `Talk to ${target.name}`;
		else {
			const id = target.object.interact!;
			if (WARP_TABLE[id]) action = "Enter";
			else if (SIGN_TEXTS[id]) action = "Read sign";
			else if (CHEST_LOOT[id]) action = "Open chest";
			else {
				const special = SPECIAL_INTERACTIONS[id];
				if (special?.kind === "starter") {
					const name = SPECIES[special.speciesId]?.name ?? "creature";
					action = `${this.flags.starter ? "Observe" : "Inspect"} ${name}`;
				}
				else if (special?.kind === "shrine") action = "Rest and heal";
				else if (special?.kind === "rest") action = "Rest";
				else if (special?.kind === "books") action = "Read ledger";
				else if (special?.kind === "encounter") action = "Speak with challenger";
			}
		}
		return `${action} · Interact: Z or Enter; tap A`;
	}
	private refreshInteractionHint(): void {
		if (this.currentInteractionHint() !== this.snap.interactionHint) this.emit();
	}
	private handleInteract(id: string): void {
		const warp = WARP_TABLE[id];
		if (warp) {
			this.warp(warp.to, warp.x, warp.y, 3);
			return;
		}
		const sign = SIGN_TEXTS[id];
		if (sign) {
			this.openDialog("Sign", [sign]);
			return;
		}
		const loot = CHEST_LOOT[id];
		if (loot) {
			if (this.flags[id]) {
				this.openDialog("", ["Already looted."]);
				return;
			}
			this.flags[id] = true;
			this.give(loot.item, loot.count);
			sfxPlay.confirm();
			this.openDialog("", [`Inside: ${ITEMS[loot.item]?.name ?? loot.item} ×${loot.count}.`]);
			this.persist();
			return;
		}
		const special = SPECIAL_INTERACTIONS[id];
		if (special) {
			this.runSpecialInteraction(special);
			return;
		}
	}

	private runSpecialInteraction(special: SpecialInteraction): void {
		if (special.kind === "shrine") {
			this.party.forEach(healFull);
			const saved = this.persist();
			if (saved) sfxPlay.save();
			this.openDialog("Shrine", [saved ? "The old compact holds. Your beasts are whole. The lantern is written." : "Your beasts are whole, but the lantern could not be written. Keep this window open and retry saving."]);
			return;
		}
		if (special.kind === "rest") {
			this.party.forEach(healFull);
			this.persist();
			sfxPlay.heal();
			this.openDialog("", ["You rest. The lantern ticks. Dawn, again."]);
			return;
		}
		if (special.kind === "books") {
			this.openDialog("Ledger", ["Pactwardens do not own beasts. They keep them. The Reliquary is a promise, not a cage."]);
			return;
		}
		if (special.kind === "starter") {
			this.chooseStarter(special.speciesId);
			return;
		}
		const done = this.flags[`defeated_${special.encounterId}`];
		if (done) {
			this.openDialog(special.speaker, special.doneLines);
			return;
		}
		if (special.needsStarter && !this.flags.starter) {
			this.openDialog("", [special.gateLine]);
			return;
		}
		if (special.needsFlag && !this.flags[special.needsFlag]) {
			this.openDialog(special.speaker, [special.gateLine]);
			return;
		}
		const lines = special.lines.length ? special.lines : [];
		this.openDialog(special.speaker, lines.length ? [...lines, special.offerLine] : [special.offerLine], () => {
			if (!this.startEncounter(special.encounterId)) this.openDialog(special.speaker, [special.gateLine]);
		}, null, special.commitLabel);
	}
	private talk(id: string, name: string, npc?: DialogSpeaker): void {
		const dialog = NPC_DIALOGS[id];
		if (!dialog) return;
		if (dialog.kind === "action") {
			if (dialog.action === "inn") {
				this.openDialog(name, ["Fifteen crowns for a clean bed and a whole lantern."], () => this.offerInn(name, npc), npc, "Rest for 15 crowns");
			} else if (dialog.action === "shop") {
				this.mode = "shop";
				this.shopMode = "buy";
				this.shopIndex = 0;
				sfxPlay.menu();
				this.emit();
			} else {
				if (this.flags.trial) {
					this.openDialog(name, ["You already keep the Thorn Mark. Don't make me bored."], undefined, npc);
					return;
				}
				if (!this.flags.starter) {
					this.openDialog(name, ["Come back with a pact, green lantern."], undefined, npc);
					return;
				}
				const strongest = this.party.reduce((max, beast) => Math.max(max, beast.level), 0);
				this.openDialog(name, wardenPages({ flags: this.flags, strongestLevel: strongest }, id === "cael" ? "square" : "hall"),
					() => this.startWarden(), npc, "Begin the trial");
			}
			return;
		}
		const pages = dialog.pages({ flags: this.flags, strongestLevel: this.party.reduce((max, beast) => Math.max(max, beast.level), 0) });
		if (pages.length) this.openDialog(name, pages, undefined, npc);
	}
	private offerInn(name = "Innmother Cald", npc?: DialogSpeaker): void {
		if (this.gold < 15) {
			this.openDialog(name, ["Crowns first, kindness second. Come back when the purse is less embarrassed."], undefined, npc);
			return;
		}
		this.gold -= 15;
		this.party.forEach(healFull);
		this.persist();
		sfxPlay.heal();
		this.openDialog(name, ["Sleep. The road will still be there. Unfortunately."], undefined, npc);
	}
	private chooseStarter(id: string): void {
		const sp = SPECIES[id];
		if (!sp) return;
		if (this.flags.starter) {
			this.openDialog(sp.name, [`Your pact is already spoken. ${sp.description}`], undefined, null, undefined, id);
			return;
		}
		const skills = skillsForLevel(sp, STARTER_PACT_LEVEL).map((id) => {
			const skill = SKILLS[id];
			return skill ? `${skill.name} (${skill.mp} MP)` : id;
		}).join(", ");
		const strikeElement = ELEMENTS[sp.elements[0]!];
		const favored = strikeElement?.strong.map((id) => ELEMENTS[id].name).join(" and ");
		const matchup = favored ? ` ${strikeElement.name} is strong against ${favored}.` : "";
		const threats = (Object.keys(ELEMENTS) as (keyof typeof ELEMENTS)[])
			.filter((element) => typeMod(element, sp.elements) > 1)
			.map((element) => ELEMENTS[element].name);
		const danger = threats.length
			? ` Incoming ${new Intl.ListFormat("en").format(threats)} ${threats.length === 1 ? "hits" : "hit"} harder.`
			: "";
		this.openDialog(sp.name, [
			sp.description,
			`Starting skills: ${skills}.${matchup}${danger}`,
			`Speak your first pact with ${sp.name}? They will leave the Grove with you. The other two will stay at their stones.`,
		], () => this.bindStarter(id), null, `Bind ${sp.name}`, id);
	}
	private bindStarter(id: string): void {
		if (this.flags.starter) return;
		const sp = SPECIES[id];
		if (!sp) return;
		const beast = makeBeast(id, STARTER_PACT_LEVEL, { nickname: sp.name, random: this.random });
		this.party = [beast];
		this.caught[id] = true;
		this.seen[id] = true;
		this.flags.starter = true;
		this.flags[starterPactFlag(id)] = true;
		this.give("common_sigil", STARTER_PACT_REWARD.sigils);
		this.gold += STARTER_PACT_REWARD.crowns;
		sfxPlay.catch();
		this.flags[nameOfferFlag("starter", beast.uid)] = true;
		this.showNamePrompt(beast, "starter");
		this.persist();
	}
	private showNamePrompt(beast: Beast, kind: NamePromptView["kind"], draft = beast.nickname): void {
		this.namePrompt = {
			uid: beast.uid, speciesId: beast.speciesId, speciesName: SPECIES[beast.speciesId]?.name ?? beast.nickname, kind, draft
		};
	}
	private restoreNamePrompt(recoverDraft: boolean): void {
		this.namePrompt = null;
		for (const beast of this.party.concat(this.box)) {
			const speciesName = SPECIES[beast.speciesId]?.name;
			if (!this.flags.starter || !speciesName || speciesName !== beast.nickname) continue;
			const kind = this.flags[nameOfferFlag("starter", beast.uid)] && this.flags[starterPactFlag(beast.speciesId)]
				? "starter" : this.flags[nameOfferFlag("tame", beast.uid)] ? "tame" : null;
			if (!kind) continue;
			if (!recoverDraft && this.saveWriteAllowed) writeNameDraft(beast.uid, null);
			this.showNamePrompt(beast, kind, recoverDraft ? readNameDraft(beast.uid, this.readOnlySaveSource) : undefined);
			break;
		}
	}
	private offerCapturedName(uid: string): void {
		const beast = this.party.concat(this.box).find((item) => item.uid === uid);
		if (!beast) return;
		const speciesName = SPECIES[beast.speciesId]?.name ?? beast.nickname;
		this.openDialog("", [`${beast.nickname} accepts the compact. Give them a name, or leave ${speciesName}.`], () => {
			this.showNamePrompt(beast, "tame");
		}, undefined, "Give a name", undefined, () => this.settleNameOffer("tame", uid));
	}
	private give(id: string, n: number): void {
		this.inventory[id] = (this.inventory[id] ?? 0) + n;
	}
	openDialog(speaker: string, pages: string[], onDone?: () => void, npc?: DialogSpeaker | null, doneLabel?: string, speciesId?: string, onCancel?: () => void): void {
		this.dialogRevision += 1;
		this.dialog = {
			speaker,
			pages,
			index: 0,
			onDone,
			onCancel,
			doneLabel,
			speciesId,
			npcId: npc?.npcId ?? null,
			portraitKey: npc ? resolveNpcPortrait(npc.npcId, npc.sprite) : null
		};
		this.emit();
	}
	toastMsg(t: string): void {
		this.toast = t;
		this.toastT = 2.2;
		this.emit();
	}
	private startWildFrom(speciesId: string, level: number): void {
		this.resetWorldCameraRelief();
		const foe = makeBeast(speciesId, level, { random: this.random });
		this.seen[speciesId] = true;
		this.encounterLock = true;
		this.persistBattleCheckpoint();
		sfxPlay.encounter();
		this.battle = {
			kind: "wild",
			bg: this.map().battleBg,
			playerIndex: this.firstAble(),
			foes: [foe],
			foeIndex: 0,
			log: [`A wild ${SPECIES[speciesId].name} steps from the ${this.map().battleBg}.`],
			recap: [],
			phase: "command",
			menuIndex: 0,
			shake: 0,
			animCue: null,
			animElapsedMs: 0,
			catchStone: null,
			escaped: false,
			canFlee: true,
			canBind: true,
		};
		this.mode = "battle";
		this.menuIndex = 0;
		this.emit();
	}
	private startWild(): void {
		const table = this.map().encounters;
		if (!table.length) return;
		const total = table.reduce((s, e) => s + e.w, 0);
		let r = this.random() * total;
		let pick = table[0]!;
		for (const e of table) {
			r -= e.w;
			if (r <= 0) {
				pick = e;
				break;
			}
		}
		const level = pick.min + Math.floor(this.random() * (pick.max - pick.min + 1));
		this.startWildFrom(pick.species, level);
	}
	startEncounter(id: string): boolean {
		if (this.mode !== "world" || this.battle) return false;
		if (!this.party.some((beast) => beast.hp > 0)) return false;
		const def = FIXED_ENCOUNTERS[id];
		if (!def || def.mapId !== this.mapId) return false;
		if (def.requiredFlags.some((flag) => !this.flags[flag])) return false;
		if (this.flags[def.onceFlag]) return false;
		const foes = def.foes.map((f) => makeBeast(f.speciesId, f.level, { random: this.random }));
		foes.forEach((f) => {
			this.seen[f.speciesId] = true;
		});
		this.persistBattleCheckpoint();
		sfxPlay.encounter();
		const trainer =
			id === "goblin_scout" ? "Goblin Scout" : id === "goblin_king" ? "Goblin King" : undefined;
		this.battle = {
			kind: "fixed",
			bg: this.map().battleBg,
			playerIndex: this.firstAble(),
			foes,
			foeIndex: 0,
			trainerName: trainer,
			log: [...def.intro, `${SPECIES[foes[0]!.speciesId].name} is sent out.`],
			recap: [],
			phase: "command",
			menuIndex: 0,
			shake: 0,
			animCue: null,
			animElapsedMs: 0,
			catchStone: null,
			escaped: false,
			canFlee: def.canFlee,
			canBind: def.canBind,
			encounterId: id,
		};
		this.mode = "battle";
		this.menuIndex = 0;
		this.emit();
		return true;
	}
	private startWarden(): void {
		const strongest = this.party.reduce((max, beast) => Math.max(max, beast.level), 0);
		const levels = wardenTeamLevels(strongest);
		const foes = WARDEN_TRIAL_TEAM.map((foe, i) => makeBeast(foe.speciesId, levels[i]!, { random: this.random }));
		foes.forEach((f) => {
			this.seen[f.speciesId] = true;
		});
		this.persistBattleCheckpoint();
		sfxPlay.encounter();
		this.battle = {
			kind: "trial",
			bg: "keep",
			playerIndex: this.firstAble(),
			foes,
			foeIndex: 0,
			trainerName: "Warden Cael",
			log: ["Warden Cael sends out Ironnewt."],
			recap: [],
			phase: "command",
			menuIndex: 0,
			shake: 0,
			animCue: null,
			animElapsedMs: 0,
			catchStone: null,
			escaped: false,
			canFlee: false,
			canBind: false,
		};
		this.mode = "battle";
		this.emit();
	}
	private firstAble(): number {
		const i = this.party.findIndex((b) => b.hp > 0);
		return i < 0 ? 0 : i;
	}
	private static readonly BATTLE_RECAP_CAP = 8;
	/**
	 * Display the latest battle event AND retain a bounded, ordered recap of
	 * the current turn (S06): the one-line log alone replaces each earlier
	 * event, leaving both actions and outcomes uninspectable.
	 */
	private logBattle(...lines: string[]): void {
		const b = this.battle;
		if (!b) return;
		b.log = lines;
		for (const line of lines) {
			if (line) b.recap = [...b.recap, line].slice(-ReliquaryGame.BATTLE_RECAP_CAP);
		}
	}
	private battleConfirm(): void {
		const b = this.battle!;
		if (!b) return;
		if (b.phase === "intro" || b.phase === "anim") return;
		if (b.phase === "win") {
			this.endBattle(true);
			return;
		}
		if (b.phase === "lose") {
			this.whiteOut();
			return;
		}
		if (b.phase === "command") {
			const cmds = battleCommands(b);
			const c = cmds[b.menuIndex % cmds.length];
			// A new command opens a new turn: the recap shown at the next
			// decision describes exactly the turn about to resolve.
			b.recap = [];
			if (c === "Strike") this.playerAction({ type: "strike" });
			else if (c === "Skill") {
				b.phase = "skills";
				b.menuIndex = 0;
				this.menuIndex = 0;
			} else if (c === "Item") {
				b.phase = "items";
				b.menuIndex = 0;
				this.menuIndex = 0;
			} else if (c === "Bind") {
				b.phase = "bind";
				b.menuIndex = 0;
				this.menuIndex = 0;
			} else if (c === "Party") {
				b.phase = "party";
				b.menuIndex = 0;
				this.menuIndex = 0;
			} else if (c === "Flee") this.tryFlee();
			sfxPlay.confirm();
			this.emit();
			return;
		}
		if (b.phase === "skills") {
			const me = this.party[b.playerIndex]!;
			const sid = me.skills[b.menuIndex];
			if (!sid) return;
			const sk = SKILLS[sid];
			if (sk && me.mp < sk.mp) {
				this.logBattle(`${me.nickname} hasn't the breath.`);
				sfxPlay.fail();
				this.emit();
				return;
			}
			this.playerAction({
				type: "skill",
				skill: sid
			});
			return;
		}
		if (b.phase === "items") {
			const it = this.usableItems()[b.menuIndex];
			if (!it) return;
			if (!this.itemHasEffect(it, this.party[b.playerIndex]!, true)) {
				this.logBattle("That item would have no effect.");
				this.emit();
				return;
			}
			this.playerAction({
				type: "item",
				item: it
			});
			return;
		}
		if (b.phase === "bind") {
			const st = BATTLE_SIGILS.filter((s) => (this.inventory[s] ?? 0) > 0)[b.menuIndex];
			if (!st) return;
			this.playerAction({
				type: "bind",
				item: st
			});
			return;
		}
		if (b.phase === "party") {
			const idx = b.menuIndex;
			if (!this.party[idx] || this.party[idx].hp <= 0 || idx === b.playerIndex) return;
			if (this.party[b.playerIndex]!.hp <= 0) {
				b.playerIndex = idx;
				b.phase = "command";
				b.menuIndex = this.menuIndex = 0;
				this.logBattle(`${this.party[idx]!.nickname} steps forward.`);
				this.emit();
				return;
			}
			this.playerAction({
				type: "switch",
				index: idx
			});
		}
	}
	usableItems(): string[] {
		// In battle the item route always targets the living active beast, so
		// field-only and revive-kind items (which act on a chosen fainted
		// creature outside battle) would be offered as unusable actions.
		const battleExcluded = (kind: string | undefined): boolean => kind === "sigil" || kind === "key" || (!!this.battle && (kind === "field" || kind === "revive"));
		return Object.keys(this.inventory).filter((id) => (this.inventory[id] ?? 0) > 0 && ITEMS[id] && !battleExcluded(ITEMS[id].kind));
	}
	private tryFlee(): void {
		const b = this.battle!;
		const me = currentStats(this.party[b.playerIndex]!);
		const foe = currentStats(b.foes[b.foeIndex]!);
		if (this.party[b.playerIndex]!.status === "bind") {
			this.logBattle("Roots hold fast — no escape.");
			this.afterPlayer();
			if (this.battle && this.battle.log[0] !== "Roots hold fast — no escape.") {
				this.battle.log = ["Roots hold fast — no escape.", ...this.battle.log];
			}
			this.emit();
			return;
		}
		// Mirror the capture cap: extreme speed gaps can never make fleeing
		// certain or impossible.
		const chance = Math.min(.95, Math.max(.05, .4 + (me.spd - foe.spd) / 200));
		if (this.random() < chance) {
			this.logBattle("You break from the grass.");
			b.escaped = true;
			b.phase = "win";
			sfxPlay.confirm();
		} else {
			this.logBattle("The beast cuts off the path.");
			this.afterPlayer();
		}
		this.emit();
	}
	private playerAction(act: { type: string; skill?: string; item?: string; index?: number }): void {
		const b = this.battle!;
		let me = this.party[b.playerIndex]!;
		const foe = b.foes[b.foeIndex]!;
		const playerFirst = playerActsFirst(me, foe, this.random) || act.type === "item" || act.type === "switch" || act.type === "bind";
		let fumbleNotice: string | null = null;
		let strikeAnim: BattleAnimCue | null = null;
		const doPlayer = () => {
			if (me.hp <= 0) return;
			if (act.type === "strike" || act.type === "skill") {
				const name = act.type === "skill" ? SKILLS[act.skill!]?.name ?? act.skill : "Strike";
				if (dazeFumbles(me, this.random)) {
					fumbleNotice = `${me.nickname}'s ${name} falters — it cannot find its bearings.`;
					this.logBattle(fumbleNotice);
					return;
				}
			}
			if (act.type === "strike") {
				const cue = this.useSkill(me, foe, false, basicStrike(me), true);
				if (cue) strikeAnim = cue;
			} else if (act.type === "skill") {
				const sk = SKILLS[act.skill!];
				if (!sk) return;
				if (!spendSkillMp(me, sk)) {
					this.logBattle(`${me.nickname} hasn't the breath.`);
					return;
				}
				const cue = this.useSkill(me, foe, false, sk, true);
				if (cue) strikeAnim = cue;
			} else if (act.type === "item") this.useItem(act.item!, me, true);
			else if (act.type === "bind") this.tryCatch(act.item!);
			else if (act.type === "switch") {
				b.playerIndex = act.index!;
				me = this.party[b.playerIndex]!;
				this.logBattle(`${this.party[b.playerIndex]!.nickname} steps forward.`);
				b.animCue = null;
				b.animElapsedMs = 0;
			}
		};
		const doFoe = () => {
			if (foe.hp <= 0 || b.phase === "catch" || b.escaped) return;
			const cue = this.foeTurn(foe, me);
			if (cue) strikeAnim = cue;
		};
		if (playerFirst) {
			doPlayer();
			if (b.phase === "catch") return;
			if (foe.hp > 0) doFoe();
		} else {
			doFoe();
			if (me.hp > 0) doPlayer();
			if (b.phase === "catch") return;
		}
		// Resolve the completed turn before a KO handler changes active beasts.
		// Only survivors tick: burn's minimum-HP rule must not revive the fallen.
		if (me.hp > 0) this.tickStatus(me);
		if (foe.hp > 0) this.tickStatus(foe);
		if (foe.hp <= 0) { this.foeDown(); return; }
		if (me.hp <= 0) { this.playerDown(); return; }
		if (b.phase !== "win" && b.phase !== "lose") {
			if (strikeAnim) {
				b.animCue = strikeAnim;
				b.animElapsedMs = 0;
				b.phase = "anim";
			} else {
				b.phase = "command";
				b.menuIndex = 0;
				this.menuIndex = 0;
			}
		}
		if (fumbleNotice && !b.log.includes(fumbleNotice)) b.log = [fumbleNotice, ...b.log];
		this.emit();
	}
	private useSkill(atk: Beast, def: Beast, foeSide: boolean, skill: Skill, logIt: boolean): BattleAnimCue | null {
		const b = this.battle!;
		const animSide: BattleAnimCue["attacker"] = foeSide ? "foe" : "player";
		const maybeAnim = (hit: boolean): BattleAnimCue | null =>
			logIt && shouldPlayBattleAnim(skill.id) ? { skillId: skill.id, attacker: animSide, hit } : null;
		// Resolution lives in the pure, headless-tested battle core (issue #34
		// stage 1); this method is presentation: apply events, log, sound, anim.
		const events = resolveSkillUse(atk, def, skill, this.random);
		const log = applySkillEvents(atk, def, skill, events);
		const sfxCue = events[events.length - 1]!.sfx;
		if (log !== null) this.logBattle(log);
		const event = events[0]!;
		const targetSide: BattleAnimSide = foeSide ? "player" : "foe";
		if (this.battlePreview && logIt && skill.kind !== "heal" && skill.power > 0 &&
			(event.kind === "damage" || event.kind === "miss")) {
			this.battlePreview.attack(b, {
				skillId: skill.id, side: animSide, speciesId: atk.speciesId,
				targetSide, targetSpeciesId: def.speciesId,
				kind: skill.kind, element: skill.element, hit: event.kind === "damage",
			});
			if (event.kind === "damage" && def.hp <= 0) {
				this.battlePreview.faint(targetSide, def.speciesId);
			}
		}
		if (event.kind === "miss") sfxPlay.fail();
		else if (event.sfx === "heal") sfxPlay.heal();
		else if (event.sfx === "menu") sfxPlay.menu();
		else if (event.sfx === "crit") sfxPlay.crit();
		else if (event.kind === "damage") sfxPlay.hit();
		if (event.kind === "miss") return maybeAnim(false);
		if (event.kind === "damage") return maybeAnim(true);
		return null;
	}
	private foeTurn(foe: Beast, me: Beast): BattleAnimCue | null {
		const skills = foe.skills.map((id) => SKILLS[id]).filter(Boolean);
		const foS = currentStats(foe);
		if (dazeFumbles(foe, this.random)) {
			this.logBattle(`${foe.nickname}'s grip fumbles — it cannot find its line.`);
			return null;
		}
		if (foe.hp < foS.hp * .35) {
			const heal = skills.find((s) => s.kind === "heal" && foe.mp >= s.mp);
			if (heal) {
				foe.mp -= heal.mp;
				return this.useSkill(foe, foe, true, heal, true);
			}
		}
		const myEls = SPECIES[me.speciesId].elements;
		let best = basicStrike(foe);
		let bestS = -1;
		for (const s of skills) {
			if (s.mp > foe.mp || s.kind === "heal") continue;
			const score = s.power * typeMod(s.element, myEls);
			if (score > bestS) {
				bestS = score;
				best = s;
			}
		}
		if (best.mp) foe.mp = Math.max(0, foe.mp - best.mp);
		return this.useSkill(foe, me, true, best, true);
	}
	private tickStatus(b: Beast): void {
		if (!b.status) return;
		tickBeastStatus(b);
	}
	private foeDown(): void {
		const b = this.battle!;
		const foe = b.foes[b.foeIndex]!;
		const sp = SPECIES[foe.speciesId];
		sfxPlay.faint();
		const me = this.party[b.playerIndex]!;
		const xp = Math.floor(sp.expYield * foe.level / 5);
		this.logBattle(`${sp.name} falls. ${me.nickname} gains ${xp} lore.`);
		this.grantXp(me, xp);
		const next = b.foes.findIndex((f, i) => i > b.foeIndex && f.hp > 0);
		if (next >= 0) {
			b.foeIndex = next;
			const nsp = SPECIES[b.foes[next].speciesId];
			this.logBattle(`${sp.name} falls.`, `${b.trainerName ?? "The foe"} sends ${nsp.name}.`);
			b.animCue = null;
			b.animElapsedMs = 0;
			b.phase = "command";
			this.emit();
			return;
		}
		const gold = b.kind === "fixed" && b.encounterId
			? FIXED_ENCOUNTERS[b.encounterId]?.rewards.gold ?? 0
			: 8 + foe.level * 3 + (b.kind === "trial" ? 80 : 0);
		this.gold += gold;
		this.logBattle(`${sp.name} falls. The road yields ${gold} crowns.`);
		b.phase = "win";
		if (b.kind === "trial") {
			this.flags.trial = true;
			this.give("thorn_sigil", 3);
			this.give("greater_tonic", 2);
		} else if (b.kind === "fixed" && b.encounterId) {
			const def = FIXED_ENCOUNTERS[b.encounterId];
			if (def && !this.flags[def.onceFlag]) {
				this.flags[def.onceFlag] = true;
				for (const [item, count] of Object.entries(def.rewards.items)) this.give(item, count);
			}
		}
		this.emit();
	}
	private playerDown(): void {
		const b = this.battle!;
		sfxPlay.faint();
		const next = this.party.findIndex((p) => p.hp > 0);
		if (next >= 0) {
			this.logBattle(`${this.party[b.playerIndex]!.nickname} cannot stand.`, "Choose another.");
			b.phase = "party";
			b.menuIndex = this.menuIndex = next;
			this.emit();
			return;
		}
		this.logBattle("The lantern goes out.");
		b.phase = "lose";
		this.emit();
	}
	private grantXp(b: Beast, xp: number): void {
		const progression = awardExperience(b, xp);
		for (const skill of progression.learnedSkills) this.toastMsg(`${b.nickname} learned ${SKILLS[skill]?.name}.`);
		for (const skill of progression.queuedSkills)
			this.toastMsg(`${b.nickname} remembers ${SKILLS[skill]?.name} — open the Party card to decide.`);
		if (progression.evolvedFrom && progression.evolvedInto) {
			for (const speciesId of progression.evolvedStages) {
				this.caught[speciesId] = true;
				this.seen[speciesId] = true;
			}
			this.toastMsg(`${SPECIES[progression.evolvedFrom]?.name} becomes ${SPECIES[progression.evolvedInto]?.name}!`);
		}
		if (progression.levelsGained > 0) sfxPlay.level();
	}
	private tryCatch(stone: string): void {
		const b = this.battle!;
		if (!b.canBind || b.kind !== "wild") {
			this.logBattle("You cannot bind this foe.");
			b.phase = "command";
			this.emit();
			return;
		}
		if ((this.inventory[stone] ?? 0) <= 0) return;
		this.inventory[stone] -= 1;
		const foe = b.foes[0];
		const sp = SPECIES[foe.speciesId];
		const stoneB = ITEMS[stone]?.stone ?? 1;
		const chance = captureChance(foe, sp.catchRate, stoneB);
		sfxPlay.catch();
		b.catchStone = stone;
		b.phase = "catch";
		b.shake = 0;
		this.emit();
		const shakes = chance > .7 ? 3 : chance > .4 ? 2 : 1;
		const succeed = captureSucceeds(foe, sp.catchRate, stoneB, this.random);
		const step = (n: number): void => {
			if (!this.battle) return;
			this.battle.shake = n;
			this.emit();
			if (n < shakes) this.after(.45, () => step(n + 1));
			else if (succeed) {
				this.caught[foe.speciesId] = true;
				this.seen[foe.speciesId] = true;
				const stored = storeCapturedBeast(this.party, this.box, foe);
				this.party = stored.party;
				this.box = stored.box;
				healFull(foe);
				this.pendingCaptureNameUid = foe.uid;
				this.logBattle(`${sp.name} accepts the compact.`);
				this.battle.phase = "win";
				sfxPlay.catch();
				this.emit();
			} else {
				const failedBind = `${sp.name} breaks the sigil.`;
				this.logBattle(failedBind);
				this.battle.phase = "command";
				sfxPlay.fail();
				this.afterPlayer();
				if (this.battle) this.battle.log = [`${failedBind} ${this.battle.log.join(" ")}`];
				this.emit();
			}
		};
		this.after(.4, () => step(1));
	}
	private afterPlayer(): void {
		const b = this.battle!;
		if (!b) return;
		const me = this.party[b.playerIndex]!;
		const foe = b.foes[b.foeIndex]!;
		if (foe.hp > 0 && me.hp > 0) this.foeTurn(foe, me);
		// A failed flee or binding attempt completes its turn after retaliation.
		if (me.hp > 0) this.tickStatus(me);
		if (foe.hp > 0) this.tickStatus(foe);
		if (me.hp <= 0) this.playerDown();
	}
	private itemHasEffect(id: string, target: Beast, inBattle: boolean): boolean {
		const def = ITEMS[id];
		if (!def || (this.inventory[id] ?? 0) <= 0) return false;
		if (def.kind === "field") return !inBattle;
		if (def.kind === "revive") return target.hp <= 0;
		if (target.hp <= 0) return false;
		if (def.kind === "heal") return target.hp < currentStats(target).hp;
		if (def.kind === "ether") return target.mp < currentStats(target).mp;
		if (def.kind === "status") return target.status !== null && ["burn", "soak", "bind", "daze"].includes(target.status);
		return false;
	}
	private useItem(id: string, target: Beast, inBattle: boolean): void {
		const def = ITEMS[id];
		if (!def || !this.itemHasEffect(id, target, inBattle)) {
			if (inBattle && this.battle) this.logBattle("That item would have no effect.");
			else this.toastMsg("That item would have no effect.");
			return;
		}
		if (def.kind === "field") {
			this.inventory[id] -= 1;
			this.quietBell = def.power ?? 80;
			this.toastMsg("The grass stills.");
			return;
		}
		this.inventory[id] -= 1;
		const st = currentStats(target);
		if (def.kind === "heal") {
			healBeast(target, def.power ?? 40);
			sfxPlay.heal();
		} else if (def.kind === "ether") {
			target.mp = Math.min(st.mp, target.mp + (def.power ?? 30));
			sfxPlay.heal();
		} else if (def.kind === "status") target.status = null;
		else if (def.kind === "revive") {
			if (target.hp <= 0) target.hp = Math.floor(st.hp * ((def.power ?? 50) / 100));
		}
		if (this.battle) this.logBattle(`${def.name} on ${target.nickname}.`);
	}
	private endBattle(victory: boolean): void {
		const wasTrial = this.battle?.kind === "trial";
		const capturedUid = victory ? this.pendingCaptureNameUid : null;
		this.pendingCaptureNameUid = null;
		this.resetWorldCameraRelief();
		this.battle = null;
		this.battleStableReserve = null;
		this.battleIdlePhase = 0;
		this.mode = wasTrial && victory && !this.flags.ending ? this.maybeVictory() : "world";
		this.encounterLock = false;
		if (capturedUid) this.flags[nameOfferFlag("tame", capturedUid)] = true;
		this.persist();
		if (capturedUid && this.mode === "world" && !this.dialog) this.offerCapturedName(capturedUid);
		this.emit();
	}
	/**
	 * The victory epilogue is delivery, not rewards: foeDown granted the Thorn
	 * Mark and crowns exactly once before the flag, so re-presenting this
	 * dialog after a cancel/reload never pays out twice.
	 */
	private presentEnding(): void {
		this.openDialog("Warden Cael", [
			"Enough. You keep the compact.",
			"Take the Thorn Mark. The Hollow Crown still sits in rumor, west of the ash. That road is longer than this lantern-light.",
			"Come back when you have more names in the Reliquary. I'll still be here. Unfortunately."
		], () => {
			this.flags.ending_seen = true;
			this.mode = "victory";
			this.persist();
			this.emit();
		}, { npcId: "cael", sprite: "warden" });
	}
	/** A skipped epilogue (cancel/reload mid-dialog) is owed on the next load. */
	private replayEndingIfOwed(): void {
		if (this.flags.ending && !this.flags.ending_seen && !this.battle && !this.dialog && !this.namePrompt) this.presentEnding();
	}
	private maybeVictory(): Mode {
		if (this.flags.trial && !this.flags.ending) {
			this.flags.ending = true;
			this.presentEnding();
			return "world";
		}
		return "world";
	}
	private whiteOut(): void {
		this.pendingCaptureNameUid = null;
		this.party.forEach(healFull);
		this.gold = Math.max(0, Math.floor(this.gold * .85));
		this.battle = null;
		this.battleStableReserve = null;
		this.battleIdlePhase = 0;
		this.warp("elderhall", 12, 14, 0);
		this.mode = "world";
		this.encounterLock = false;
		this.openDialog("", ["You wake in Elderhall. The lantern is dim, but it is still yours."]);
		this.persist();
	}
	private after(sec: number, fn: () => void): void {
		this.animWait = sec;
		this.animFn = fn;
	}
	shopConfirm(): void {
		if (this.shopMode === "buy") {
			const id = SHOP_STOCK[this.shopIndex];
			if (!id) return;
			const it = ITEMS[id]!;
			const result = purchaseItem(this.gold, this.inventory, it, SHOP_STOCK);
			if (!result.ok) {
				this.toastMsg("Not enough crowns.");
				sfxPlay.fail();
			} else {
				this.gold = result.gold;
				this.inventory = result.inventory;
				sfxPlay.confirm();
				// Checkpoint policy: a completed purchase is an important
				// transaction. Persist it now, through the writer authorization,
				// instead of waiting for the step-cadence checkpoint.
				const saved = this.persist();
				if (saved) this.toastMsg(`Bought ${it.name}. The lantern is written.`);
				else this.toastMsg(`Bought ${it.name}, but the lantern could not be written. Keep this window open and retry Save.`);
			}
		} else {
			const id = Object.keys(this.inventory).filter((id) => (this.inventory[id] ?? 0) > 0 && ITEMS[id])[this.shopIndex];
			if (!id) return;
			const it = ITEMS[id]!;
			const result = sellItem(this.gold, this.inventory, it);
			if (!result.ok) return;
			this.gold = result.gold;
			this.inventory = result.inventory;
			// Keep the selection on a real row after the list shrinks; selling
			// the last owned item lands the selection back on the first row.
			const remaining = Object.keys(this.inventory).filter((k) => (this.inventory[k] ?? 0) > 0 && ITEMS[k]).length;
			this.shopIndex = remaining === 0 ? 0 : Math.min(this.shopIndex, remaining - 1);
			sfxPlay.confirm();
			// Same checkpoint policy as buying: the sale is durable immediately.
			const saved = this.persist();
			if (saved) this.toastMsg(`Sold ${it.name}. The lantern is written.`);
			else this.toastMsg(`Sold ${it.name}, but the lantern could not be written. Keep this window open and retry Save.`);
		}
		this.emit();
	}
	cardIndexOf(uid: string): number {
		if (this.menu === "party") return Math.max(0, this.party.findIndex((beast) => beast.uid === uid));
		return Math.max(0, this.party.concat(this.box).findIndex((beast) => beast.uid === uid));
	}
	private cardActions(): string[] {
		const uid = this.cardAction?.uid;
		if (!uid) return [];
		const partyIndex = this.party.findIndex((beast) => beast.uid === uid);
		const beast = partyIndex >= 0 ? this.party[partyIndex]! : this.box.find((item) => item.uid === uid);
		if (!beast) return [];
		const actions: string[] = [];
		if (this.menu === "storage" && partyIndex >= 0) {
			if (beast.hp > 0 && beast.level < MAX_LEVEL && this.gold >= PRACTICE_COST) actions.push("practice");
			if (beast.pendingSkills?.length) actions.push("learn");
		}
		if (this.menu === "party" && partyIndex >= 0) {
			if (partyIndex > 0 && beast.hp > 0) actions.push("lead");
			if (beast.hp > 0 && beast.level < MAX_LEVEL && this.gold >= PRACTICE_COST) actions.push("practice");
			if (beast.pendingSkills?.length) actions.push("learn");
		}
		if (this.menu === "storage") {
			if (partyIndex >= 0) actions.push("store");
			else if (this.party.length < 4) actions.push("in");
		}
		actions.push("rename");
		return actions;
	}
	requestRename(uid: string): void {
		this.selectedUid = uid;
		this.emit();
	}
	menuConfirm(): void {
		if (this.menu === "root") {
			const c = ROOT_MENU[this.menuIndex];
			if (!c) return;
			if (c === "Party") this.menu = "party";
			else if (c === "Storage") this.menu = "storage";
			else if (c === "Reliquary") this.menu = "reliquary";
			else if (c === "Pack") this.menu = "items";
			else if (c === "Save") {
				if (this.persist()) {
					sfxPlay.save();
					this.toastMsg("The lantern is written.");
				}
				this.menu = null;
			} else if (c === "Export") {
				this.exportGame();
				this.menu = null;
			} else if (c === "Import") {
				this.menu = null;
				this.requestImport();
			} else if (c === "Sound") {
				// Reachable, named in-game silence control (S16); the preference
				// persists through the shell's settings storage.
				const next = !isMuted();
				setMuted(next);
				setSoundMutedStored(next);
			} else if (c === "Close") {
				this.menu = null;
			}
			// The Sound toggle stays highlighted on its own row so repeated
			// toggles and keyboard focus do not jump back to the top.
			this.menuIndex = c === "Sound" ? ROOT_MENU.indexOf("Sound") : 0;
			this.emit();
			return;
		}
		if (this.menu === "party" || this.menu === "storage") {
			if (!this.cardAction) {
				const beast = this.menu === "party"
					? this.party[this.menuIndex]
					: this.party.concat(this.box)[this.menuIndex];
				if (!beast) return;
				this.cardAction = { uid: beast.uid };
				this.menuIndex = 0;
				sfxPlay.menu();
				this.emit();
				return;
			}
			const actions = this.cardActions();
			const action = actions[this.menuIndex] ?? "";
			const uid = this.cardAction.uid;
			if (!action) {
				this.cardAction = null;
				this.menuIndex = this.cardIndexOf(uid);
				this.emit();
				return;
			}
			if (action === "learn") {
				this.cardAction = null;
				this.openLearnMenu(uid);
				return;
			}
			if (action === "rename") {
				this.cardAction = null;
				this.requestRename(uid);
				return;
			}
			if (action === "lead") this.setLead(uid);
			else if (action === "practice") this.trainCreature(uid);
			else if (action === "store") this.transferBeast(uid, "box");
			else if (action === "in") this.transferBeast(uid, "party");
			else this.cardAction = null;
			this.menuIndex = this.cardIndexOf(uid);
			this.cardAction = null;
			this.emit();
			return;
		}
		if (this.menu === "learn") {
			const beast = this.party.find((item) => item.uid === this.learnMenu?.uid);
			const queue = beast?.pendingSkills ?? [];
			const skill = queue[0];
			if (!beast || !skill || skill !== this.learnMenu!.skill) {
				this.learnMenu = null;
				this.menu = this.learnOrigin;
				this.emit();
				return;
			}
			const learned = SKILLS[skill];
			if (this.menuIndex < beast.skills.length) {
				const replacedName = SKILLS[beast.skills[this.menuIndex]!]?.name ?? "old art";
				beast.skills = beast.skills.map((existing, i) => (i === this.menuIndex ? skill : existing));
				beast.pendingSkills = queue.slice(1);
				this.toastMsg(`${beast.nickname} learned ${learned?.name ?? skill}, retiring ${replacedName}.`);
			} else {
				beast.pendingSkills = queue.slice(1);
				this.toastMsg(`${beast.nickname} keeps what it knows. ${learned?.name ?? skill} fades.`);
			}
			this.persist();
			const next = beast.pendingSkills?.[0];
			if (next) {
				this.learnMenu = { uid: beast.uid, skill: next };
				this.menuIndex = beast.skills.length;
			} else {
				this.learnMenu = null;
				this.menu = this.learnOrigin;
			}
			this.emit();
			return;
		}
		if (this.menu === "items") {
			const id = this.usableItems()[this.menuIndex];
			if (!id) return;
			this.packTarget = null;
			const def = ITEMS[id];
			if (def?.kind === "field") {
				if (!this.party[0]) {
					this.toastMsg("That would do nothing here.");
					this.emit();
					return;
				}
				this.useItem(id, this.party[0], false);
				this.persist();
				this.emit();
				return;
			}
			const eligible: Beast[] = this.party.filter((beast) => this.itemHasEffect(id, beast, false));
			if (!eligible.length) {
				this.toastMsg("That would do nothing here.");
				this.emit();
				return;
			}
			if (eligible.length === 1) {
				this.useItem(id, eligible[0]!, false);
				this.persist();
				this.emit();
				return;
			}
			this.packTarget = { item: id, uids: eligible.map((beast) => beast.uid) };
			this.menu = "itemTarget";
			this.menuIndex = 0;
			this.emit();
			return;
		}
		if (this.menu === "itemTarget") {
			const item = this.packTarget?.item;
			const uid = this.packTarget?.uids[this.menuIndex];
			const beast = this.party.find((member) => member.uid === uid);
			this.packTarget = null;
			this.menu = "items";
			this.menuIndex = item ? Math.max(0, this.usableItems().indexOf(item)) : 0;
			if (item && beast) this.useItem(item, beast, false);
			this.persist();
			this.emit();
			return;
		}
	}
	private draw(dt: number): void {
		const canvas = this.canvas;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.fillStyle = "#14110e";
		ctx.fillRect(0, 0, this.cw(), this.ch());
		if (this.mode === "boot" || this.mode === "title" || this.mode === "victory") return;
		if (this.mode === "battle") {
			this.drawBattle(ctx);
			return;
		}
		this.drawWorld(ctx, dt);
	}
	private drawWorld(ctx: CanvasRenderingContext2D, dt: number): void {
		const m = this.map();
		const elderhallCandidate = isElderhallCandidateBuild();
		const mw = m.ground[0]?.length ?? 0;
		const mh = m.ground.length;
		const camX = Math.max(0, Math.min(this.px - (this.viewW / 2 - 0.5) * TILE, Math.max(0, mw * TILE - this.cw())));
		let camY = Math.max(0, Math.min(this.py - (this.viewH / 2 - 0.5) * TILE, Math.max(0, mh * TILE - this.ch())));
		const canvas = this.canvas;
		const playerHeadCanvasY = this.py + TILE - TILE * PLAYER_HEIGHT_TILES - camY;
		let cameraReport: Parameters<typeof reportWorldCameraGeometry>[2] | null = null;
		if (canvas && typeof document !== "undefined" && this.mode === "world" && !this.menu && !this.dialog) {
			const { insetCanvas, source } = readUiSafeTopCanvas(canvas);
			if (source) {
				const gate = elderhallCandidate && m.id === "elderhall"
					? m.objects.find((object) => object.id === "north_gate_candidate")
					: undefined;
				let landmarkTop: number | undefined;
				if (gate) {
					const gateLayout = resolveWorldPropLayout(gate, TILE);
					// Frame the arch on approach without pulling the camera toward it
					// from the village or overriding the player's viewport limits.
					const verticalDistance = Math.max(0, this.py - gateLayout.baseline - 2 * TILE);
					const horizontalDistance = Math.max(0, gate.x * TILE - this.px - TILE, this.px - (gate.x + gate.w) * TILE);
					landmarkTop = gateLayout.y - camY + 3 * Math.max(verticalDistance, horizontalDistance);
				}
				const adjusted = adjustCamYForHudInset(camY, playerHeadCanvasY, insetCanvas, this.worldCamRelief,
					{ viewportHeight: this.ch(), playerHeight: TILE * PLAYER_HEIGHT_TILES, landmarkTop: this.reducedMotion ? undefined : landmarkTop, dtSeconds: dt });
				camY = adjusted.camY;
				cameraReport = {
					hudInsetBottom: insetCanvas,
					hudInsetSource: source,
					camRelief: adjusted.relief,
					contentPanY: adjusted.contentPanY,
					headAfterCamRelief: adjusted.headAfterCamRelief,
					playerHeadCanvasY: adjusted.headAfterCamRelief,
				};
			} else {
				this.resetWorldCameraRelief();
			}
		} else if (canvas && typeof document !== "undefined") {
			this.resetWorldCameraRelief();
		}
		// Choose one integer world-to-screen offset for every layer. Limit its
		// rounding against both player travel and the camera's own direction.
		const worldPanY = this.worldCamRelief.contentPanY;
		const renderCamX = snapWorldCameraForPlayer(this.px, camX, this.worldCameraSnap.x);
		let renderCamY = snapWorldCameraForPlayer(this.py, camY - worldPanY, this.worldCameraSnap.y);
		if (cameraReport) {
			// A newly expanded HUD takes priority over the motion limiter.
			const safeHead = Math.min(cameraReport.hudInsetBottom + 4, this.ch() - TILE * PLAYER_HEIGHT_TILES);
			const maxCameraY = Math.floor(Math.round(this.py) + TILE - TILE * PLAYER_HEIGHT_TILES - safeHead);
			if (renderCamY > maxCameraY) {
				renderCamY = maxCameraY;
				this.worldCameraSnap.y.camera = renderCamY;
			}
			reportWorldCameraGeometry(this.cw(), this.ch(), { ...cameraReport,
				effectivePlayerHeadCanvasY: playerHeadCanvasYForCamera(this.px, this.py, TILE, renderCamX, renderCamY) });
		}
		if (this.terrain?.map !== m) {
			const canvas = document.createElement("canvas");
			canvas.width = mw * TILE;
			canvas.height = mh * TILE;
			const ground = canvas.getContext("2d");
			if (!ground) return;
			ground.imageSmoothingEnabled = false;
			const palette = woodlandPalette(m.id);
			const woodlandAtlas = this.images.woodland_terrain;
			const woodland = palette && woodlandAtlas ? { palette, atlas: woodlandAtlas } : null;
			const routeAtlas = this.images.chapter_route_terrain;
			const routeRows = chapterRouteRows(m.id);
			const drawRouteMaterial = routeAtlas && routeRows
				? (name: string, x: number, y: number) => drawChapterRouteMaterial(ground, routeAtlas, routeRows, m.id, name, x, y, TILE)
				: undefined;
			const candidateDirtAtlas = this.images["tile_elderhall-dirt-atlas"];
			const candidateGrassAtlas = this.images["tile_elderhall-grass-atlas"];
			const groveDirt = m.id === "grove" ? this.images.tile_dirt : undefined;
			const cottageExit = m.id === "home" ? m.warps.find((warp) => warp.to === "elderhall") : undefined;
			let finishFloor: (() => void) | undefined;
			if (elderhallCandidate && (m.id === "elderhall" || m.id === "grove") && candidateDirtAtlas && candidateGrassAtlas) {
				finishFloor = () => paintCandidateTerrainJunctions(ground, m, TILE, candidateDirtAtlas);
			} else if (groveDirt) {
				finishFloor = () => paintDirtPathJunctions(ground, m, TILE, (x, y) => {
					ground.drawImage(groveDirt, x * TILE, y * TILE, TILE, TILE);
				});
				} else if (cottageExit) {
				const room = this.images.room_rowan_cottage;
				finishFloor = () => {
					if (room) ground.drawImage(room, 0, 0, mw * TILE, mh * TILE);
					else {
						paintCottageFloor(ground, TILE, mw, mh, cottageExit.x);
						paintCottageRug(ground, TILE);
					}
				};
			}
				if (isInteriorRoom(m.id) && m.id !== "home") {
					const door = m.warps.find((warp) => warp.to === "elderhall" || warp.to === "thornkeep");
					finishFloor = () => paintInteriorRoom(ground, m.id as InteriorRoomId, mw, mh, door?.x ?? Math.floor(mw / 2), TILE);
				}
			bakeMapTerrain({
				map: m,
				tileSize: TILE,
				candidateTerrain: elderhallCandidate,
				chapterRouteTerrain: drawRouteMaterial !== undefined,
				woodlandTerrain: woodland ? { drawEncounter: (x, y) => {
					drawWoodlandUndergrowth(ground, woodland.atlas, woodland.palette, x, y, TILE);
				} } : undefined,
				drawJunctions: finishFloor,
				drawTile: (name, dx, dy, variant, pathMask, stoneMask) => {
					const tx = dx / TILE;
					const ty = dy / TILE;
					const candidateAtlas = elderhallTerrainAtlas(m.id, name, elderhallCandidate);
					const atlas = candidateAtlas ? this.images[candidateAtlas] : this.images[`tile_${name}-2x2`];
					const base = this.images[`tile_${name}`];
					if (pathMask !== undefined) {
						ground.save();
						clipSoftPath(ground, dx, dy, TILE, pathMask, elderhallCandidate && m.id === "grove");
					}
					const routeName = m.id === "mirefen" && m.ground[ty]?.[tx] === "=" ? "bridge" : name;
					const authoredMaterial = drawRouteMaterial?.(routeName, dx, dy) ||
						(woodland && drawWoodlandMaterial(ground, woodland.atlas, woodland.palette, name, dx, dy, TILE));
					if (!authoredMaterial) {
						if (atlas && (candidateAtlas || variant > 0)) {
							drawAtlasTile(ground, atlas, dx, dy, TILE, tileAtlasQuadrant(variant, tx, ty));
						} else if (base) ground.drawImage(base, dx, dy, TILE, TILE);
						else {
							ground.fillStyle = name === "water" ? "#3d6e8a" : name === "wall" ? "#3a342e" : "#3d4a38";
							ground.fillRect(dx, dy, TILE, TILE);
						}
					}
					if (elderhallCandidate && m.id === "grove" && candidateAtlas) {
						ground.fillStyle = name === "grass" ? "rgba(24,48,32,.22)" : name === "dirt" ? "rgba(63,45,31,.11)" : "rgba(33,42,34,.06)";
						ground.fillRect(dx, dy, TILE, TILE);
					}
					if (!authoredMaterial && variant > 0 && !atlas) {
						ground.fillStyle = `rgba(20,17,14,${0.035 * variant})`;
						ground.fillRect(dx, dy, TILE, TILE);
					}
					const candidateStoneKey = stoneMask ? elderhallTerrainAtlas(m.id, "cobble", elderhallCandidate) : null;
					const candidateStone = candidateStoneKey ? this.images[candidateStoneKey] : undefined;
					const stone = stoneMask ? this.images.tile_cobble : undefined;
					if (stoneMask && (drawRouteMaterial || candidateStone || stone)) {
						ground.save();
						clipStoneTransition(ground, dx, dy, TILE, stoneMask);
						if (!drawRouteMaterial?.("cobble", dx, dy)) {
							if (candidateStone) drawAtlasTile(ground, candidateStone, dx, dy, TILE, tileAtlasQuadrant(variant, tx, ty));
							else if (stone) ground.drawImage(stone, dx, dy, TILE, TILE);
						}
						ground.restore();
					}
					if (pathMask !== undefined) {
						ground.restore();
						if (woodland && name === "dirt") {
							drawWoodlandVerge(ground, woodland.atlas, woodland.palette, dx, dy, TILE, pathMask);
						} else if (m.roadBorder === "stone") {
							if (elderhallCandidate && m.id === "elderhall") paintOrganicStoneRoadBorder(ground, dx, dy, TILE, pathMask, tx, ty);
							else paintStoneRoadBorder(ground, dx, dy, TILE, pathMask);
						}
					}
				},
				drawOverlay: (style, dx, dy, strength) => {
					if (style === "edge") {
						ground.fillStyle = `rgba(20,17,14,${0.12 + strength * 0.2})`;
						ground.fillRect(dx + 2, dy + 2, TILE - 4, TILE - 4);
					} else if (style === "variation") {
						const tx = Math.floor(dx / TILE), ty = Math.floor(dy / TILE);
						const phase = (tx * 3 + ty * 5) % 4;
						const groundSymbol = m.ground[ty]?.[tx];
						ground.fillStyle = groundSymbol === "p"
							? `rgba(${m.id === "grove" ? "67,48,34" : "94,66,41"},${0.025 + strength * 0.025})`
							: m.id === "grove" && phase % 2 === 0
								? `rgba(103,131,82,${0.05 + strength * 0.04})`
								: phase % 2 === 0
									? `rgba(112,139,73,${0.045 + strength * 0.04})`
									: `rgba(205,179,112,${0.03 + strength * 0.025})`;
						ground.beginPath();
						const road = groundSymbol === "p";
						ground.ellipse(dx + TILE * (0.38 + (phase % 2) * 0.2), dy + TILE * (0.36 + (phase >> 1) * 0.22),
							TILE * (road ? 0.32 : 1.05), TILE * (road ? 0.1 : 0.72), phase * 0.3, 0, Math.PI * 2);
						ground.fill();
					} else {
						ground.fillStyle = `rgba(0,0,0,${strength * 0.15})`;
						ground.fillRect(dx, dy + TILE - 6, TILE, 6);
					}
				},
				drawDecoration: (sprite, dx, dy, w, h) => {
					const img = this.images[`prop_${sprite}`];
					if (img) ground.drawImage(img, dx, dy, w * TILE, h * TILE);
				},
				drawAccent: (kind, dx, dy) => paintTileAccent(ground, dx, dy, TILE, kind),
			});
			this.terrain = { map: m, canvas };
		}
		// Extend only beyond the map. Available terrain uses the same integer
		// camera sample as the actor and prop destinations.
		const edgeFill = Math.max(0, -renderCamY);
		if (edgeFill > 0 && mh > 0) ctx.drawImage(this.terrain.canvas, renderCamX, 0, this.cw(), 1, 0, 0, this.cw(), edgeFill);
		const visibleTop = Math.max(0, renderCamY);
		const visibleBottom = Math.min(mh * TILE, renderCamY + this.ch());
		if (visibleBottom > visibleTop) ctx.drawImage(this.terrain.canvas, renderCamX, visibleTop, this.cw(), visibleBottom - visibleTop,
			0, visibleTop - renderCamY, this.cw(), visibleBottom - visibleTop);
		const list: { y: number; priority: number; id: string; draw: () => void }[] = [];
		const playerFoot = resolvePlayerDrawFootprint(this.px, this.py, TILE);
		const playerFrame = this.moving ? this.walkFrame : 0;
		const playerImage = this.images[`player_${DIRS[this.dir].name}${playerFrame}`] || this.images.player_down0;
		// Completed props (opened chests, defeated bosses) share one predicate
		// with collision and interaction: they must not keep looking actionable.
		for (const o of visibleObjects(m.objects, this.flags)) {
			const candidateObject = elderhallCandidateObject(m.id, o, elderhallCandidate);
			const art = candidateObject !== o && this.images[`prop_${candidateObject.sprite}`] ? candidateObject : o;
			const visual = resolveWorldPropLayout(art, TILE);
			const bounds = worldPropCullBounds(o, visual, TILE);
			if (bounds.left >= renderCamX + this.cw() || bounds.right <= renderCamX || bounds.top >= visibleBottom || bounds.bottom <= visibleTop) continue;
			const img = this.images[`prop_${art.sprite}`] || this.images[`sprite_${art.sprite}`] || this.images[`npc_${art.sprite}`];
			if (o.id === "north_gate_candidate" && img) {
				for (const part of elderhallGateRenderRegions(visual)) {
					const rect = { x: visual.x + visual.width * part.left, y: visual.y,
						width: visual.width * (part.right - part.left), height: visual.height, baseline: part.baseline };
					const faded = shouldFadePropForPlayer({ ...rect, height: rect.height * part.revealBottom }, playerFoot);
					list.push({ y: part.baseline, priority: 0, id: `${o.id}:${part.kind}`, draw: () => {
						const source = { x: img.naturalWidth * part.left, y: 0,
							width: img.naturalWidth * (part.right - part.left), height: img.naturalHeight };
						const dest = { x: rect.x - renderCamX, y: rect.y - renderCamY, width: rect.width, height: rect.height };
						const playerRect = { x: playerFoot.x - renderCamX, y: playerFoot.y - renderCamY, width: playerFoot.width, height: playerFoot.height };
						if (faded && part.kind === "overhang") paintPropWithLocalFade(ctx, img, dest,
							playerRect,
							0.45, dest.y + dest.height * part.revealBottom, source);
						else {
							ctx.drawImage(img, source.x, source.y, source.width, source.height, dest.x, dest.y, dest.width, dest.height);
							if (faded && playerImage) paintActorBehindPost(ctx, playerImage, img, dest, playerRect,
								dest.y + dest.height * part.revealBottom, source);
						}
					} });
					}
				continue;
			}
			const overhang = worldPropOverhang(art.sprite, visual);
			const faded = overhang !== null && shouldFadePropForPlayer(overhang, playerFoot);
			list.push({
				y: visual.baseline,
				priority: 0,
				id: o.id,
				draw: () => {
					const dx = visual.x - renderCamX;
					const dy = visual.y - renderCamY;
					const dw = visual.width;
					const dh = visual.height;
					if (img) {
						paintWorldPropShadow(ctx, art.sprite, dx, dy, dw, dh);
						if (faded && overhang) {
							const treeCanopy = art.sprite === "elderhall-tree-reference";
							paintPropWithLocalFade(ctx, img, { x: dx, y: dy, width: dw, height: dh },
								{ x: playerFoot.x - renderCamX, y: playerFoot.y - renderCamY, width: playerFoot.width, height: playerFoot.height },
								treeCanopy ? 0.15 : 0.45, overhang.y + overhang.height - renderCamY, undefined,
								treeCanopy ? "elderhall-tree" : undefined);
						} else {
							ctx.drawImage(img, dx, dy, dw, dh);
						}
					} else if (o.id === "north_gate_candidate") paintCandidateGateFallback(ctx, o, renderCamX, renderCamY, TILE);
					else if (o.id === "green_bench_candidate") paintCandidateBenchFallback(ctx, o, renderCamX, renderCamY, TILE);
				}
			});
		}
		for (const n of m.npcs) {
			if (n.x * TILE >= renderCamX + this.cw() || (n.x + 1) * TILE <= renderCamX || (n.y - .25) * TILE >= visibleBottom || (n.y + 1) * TILE <= visibleTop) continue;
			list.push({
			y: (n.y + 1) * TILE,
			priority: 1,
			id: n.id,
			draw: () => {
				const img = this.images[`npc_${n.sprite}`];
				const dx = n.x * TILE - renderCamX;
				const dw = TILE;
				const dh = TILE * 1.25;
				const dy = n.y * TILE + TILE - dh - renderCamY;
				if (img) {
					paintWorldActorShadow(ctx, dx, dy + dh - 4, dw);
					ctx.drawImage(img, dx, dy, dw, dh);
				}
			}
		});
		}
		list.push({
			y: this.py + TILE,
			priority: 2,
			id: "player",
			draw: () => {
				const screenPlayer = resolvePlayerScreenFootprint(this.px, this.py, TILE, renderCamX, renderCamY);
				const dx = screenPlayer.x;
				const dw = screenPlayer.width;
				const dh = screenPlayer.height;
				const dy = screenPlayer.y;
				if (playerImage) {
					paintWorldActorShadow(ctx, dx, dy + dh - 4, dw);
					ctx.drawImage(playerImage, dx, dy, dw, dh);
				} else {
					ctx.fillStyle = "#c4a574";
					ctx.fillRect(dx + 8, dy + 8, 16, 20);
				}
			}
		});
		for (const deco of m.decorations ?? []) {
			if (deco.layer !== "canopy") continue;
			const baseline = (deco.y + deco.h) * TILE;
			const width = deco.w * TILE;
			const height = deco.h * TILE;
			const ox = deco.x * TILE;
			const oy = deco.y * TILE;
			if (ox + width < renderCamX || ox > renderCamX + this.cw() || oy + height < visibleTop || oy > visibleBottom) continue;
			const canopyRect = { x: ox, y: oy, width, height, baseline };
			const overhang = worldPropOverhang(deco.sprite, canopyRect);
			const faded = overhang !== null && shouldFadePropForPlayer(overhang, playerFoot);
			list.push({
				y: baseline,
				priority: 0,
				id: `decoration:${deco.sprite}:${deco.x}:${deco.y}`,
				draw: () => {
					const img = this.images[`prop_${deco.sprite}`];
					if (!img) return;
					const dx = ox - renderCamX;
					const dy = oy - renderCamY;
					paintWorldPropShadow(ctx, deco.sprite, dx, dy, width, height);
					if (faded && overhang) paintPropWithLocalFade(ctx, img, { x: dx, y: dy, width, height },
						{ x: playerFoot.x - renderCamX, y: playerFoot.y - renderCamY, width: playerFoot.width, height: playerFoot.height },
						0.45, overhang.y + overhang.height - renderCamY);
					else ctx.drawImage(img, dx, dy, width, height);
				},
			});
		}
		list.sort(compareWorldDepth);
		for (const s of list) s.draw();
	}
	setBattleStatusBottomRatio(ratio: number | null): void {
		this.battleStatusBottomRatio = ratio;
	}
	private drawBattle(ctx: CanvasRenderingContext2D): void {
		const b = this.battle!;
		if (!b) return;
		const cw = this.cw();
		const ch = this.ch();
		if (this.battleStableReserve == null) {
			this.battleStableReserve = stableBattleUiReserveTop(cw, ch);
		}
		const canvasKey = `${cw}x${ch}`;
		if (this.battleLayoutCanvasKey !== canvasKey) {
			this.battleStableReserve = stableBattleUiReserveTop(cw, ch);
			this.battleLayoutCanvasKey = canvasKey;
		}
		const layout = computeBattleLayout(cw, ch, this.battleStableReserve, {
			stableReserve: true,
			presentation: battlePresentation(this.cssW, this.cssH),
			statusBottom: this.battleStatusBottomRatio == null ? undefined : this.battleStatusBottomRatio * ch,
		});
		const geometryBase = computeBattleStageGeometry(cw, ch, layout, b.phase);
		const road = this.mapId === "briar_road" ? this.images.bg_briar_road : undefined;
		const bg = road || this.images[`bg_${b.bg}`] || this.images.bg_grass;
		paintBattleBackdrop(ctx, cw, ch, layout, b.bg, bg ?? null, road ? "roadside" : "scenic");
		const anchors = { player: layout.player, foe: { cx: layout.foe.cx, cy: layout.foe.cy } };
		const motion = b.animCue
			? sampleBattleAnim(b.animCue, b.animElapsedMs, geometryBase.animCorridor, anchors, {
					reducedMotion: this.reducedMotion,
					idlePhase: this.battleIdlePhase,
				})
			: sampleBattleIdle({ reducedMotion: this.reducedMotion, idlePhase: this.battleIdlePhase });
		// Side-correct cosmetics: the attacker gets the lunge offset, the
		// defender gets the impact reaction — never both mirrored.
		const attacker = b.animCue?.attacker;
		const playerCosmetic = {
			dx: attacker === "player" ? motion.dx : attacker === "foe" ? motion.defenderShakeX : 0,
			dy: motion.dy,
		};
		const foeCosmetic = {
			dx: attacker === "foe" ? motion.dx : attacker === "player" ? motion.defenderShakeX : 0,
			dy: motion.dy * 0.35,
		};
		const geometry = { ...geometryBase, cosmeticOffset: { player: playerCosmetic, foe: foeCosmetic } };
		reportBattleStageGeometry(cw, ch, geometry);
		const preview = this.battlePreview;
		preview?.beginFrame(b, this.reducedMotion);
		const foe = b.foes[b.foeIndex]!;
		const foeFainting = !!foe && foe.hp <= 0 && preview?.faintVisible("foe", foe.speciesId);
		if (foe && (foe.hp > 0 || foeFainting)) {
			const img = this.images[`sprite_${foe.speciesId}`];
			const catchShake = b.phase === "catch" ? Math.sin(b.shake * 8) * 6 : 0;
			const paint = preview?.sprite("foe", foe.speciesId);
			const bounds = measureSpriteAlphaBounds(img) ?? undefined;
			if (img || paint) {
				drawBattleFoeSprite(ctx, img, layout, catchShake, foeCosmetic, paint, bounds);
			}
		}
		const me = this.party[b.playerIndex]!;
		if (me) {
			const img = this.images[`sprite_${me.speciesId}`];
			const paint = preview?.sprite("player", me.speciesId);
			const bounds = measureSpriteAlphaBounds(img) ?? undefined;
			if (img || paint) drawBattlePlayerSprite(ctx, img, layout, playerCosmetic, paint, bounds);
		}
		if (motion.projectile) paintGustProjectile(ctx, motion.projectile);
		preview?.overlay(ctx, layout);
	}
};
function basicStrike(b: Beast): Skill {
	return {
		id: "strike",
		name: "Strike",
		element: SPECIES[b.speciesId]!.elements[0]!,
		kind: "strike",
		power: 45,
		accuracy: 100,
		mp: 0,
		desc: "A plain blow."
	};
}
function collectPaths(): [string, string][] {
	return collectGameAssets().map((entry) => [entry.key, entry.url]);
}

export type { Snapshot } from "./types";
