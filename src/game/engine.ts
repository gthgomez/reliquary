import {
  currentStats,
  healFull,
  ITEMS,
  makeBeast,
  MAX_LEVEL,
  PRACTICE_COST,
  PRACTICE_LORE,
  SHOP_STOCK,
  SKILLS,
  SPECIES,
  typeMod,
	STARTING_GOLD,
} from "./content.ts";
import { MAPS } from "./maps.ts";
import { resolveNpcPortrait, type PortraitKey } from "./portraits.ts";
import { FIXED_ENCOUNTERS } from "./encounters.ts";
import { sfxPlay, startMusic, stopMusic, unlockAudio } from "./audio.ts";
import { hasSave, cloneSave, loadSave, parseSave, SAVE_VERSION, serializeSave, WORLD_REVISION, writeSave } from "./save.ts";
import { collectGameAssets } from "./assets.ts";
import { mathRandom, type RandomSource } from "./rng.ts";
import { battleCommands, encounterAt, rollEncounter } from "./world/encounters.ts";
import { isOccupied } from "./world/movement.ts";
import { pickInteractObject } from "./world/interaction.ts";
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
  battleAnimDurationMs,
  paintGustProjectile,
  sampleBattleAnim,
  sampleBattleIdle,
  shouldPlayBattleAnim,
  type BattleAnimCue,
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
import { drawAtlasTile, paintTileAccent, tileAtlasQuadrant } from "./render/tile-surface.ts";
import { paintWorldActorShadow } from "./render/world-actors.ts";
import { captureChance, captureSucceeds, storeCapturedBeast } from "./systems/capture.ts";
import { healBeast, playerActsFirst, spendSkillMp } from "./systems/combat.ts";
import { applySkillEvents, resolveSkillUse } from "./systems/battle-engine.ts";

import { purchaseItem, sellItem } from "./systems/economy.ts";
import { awardExperience } from "./systems/progression.ts";
import { moveToLead, renameCreature, transferBeast } from "./systems/party.ts";
import { currentObjective } from "./systems/objective.ts";
import { STATUS_ADJECTIVES, applyStatus, dazeFumbles, tickStatus as tickBeastStatus } from "./systems/status.ts";
import type {
  BattleState,
  Beast,
  Dir,
  GameSave,
  MapDef,
  Mode,
  Skill,
  Snapshot,
} from "./types.ts";

export const TILE = 32;
export const VIEW_W = 12;
export const VIEW_H = 9;
export const VIEW_W_PORT = 10;
export const VIEW_H_PORT = 16;
export const ROOT_MENU = ["Party", "Storage", "Reliquary", "Pack", "Save", "Export", "Import", "Close"] as const;

type Dialog = {
	speaker: string;
	pages: string[];
	index: number;
	onDone?: () => void;
	npcId: string | null;
	portraitKey: PortraitKey | null;
};

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
	private safeCheckpoint: GameSave | null = null;
	private saveWriteAllowed = true;
	lifecycle: "constructed" | "booted" | "stopped" = "constructed";
	private readonly random: RandomSource;
	private bootToken = 0;
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
	private battleLayoutCanvasKey: string | null = null;
	private battleIdlePhase = 0;
	private reducedMotion = false;
	private worldCamRelief: WorldCamReliefState = { relief: 0, contentPanY: 0 };
	constructor(options: { random?: RandomSource } = {}) {
		this.random = options.random ?? mathRandom;
		this.snap = this.buildSnap();
		this.hasSave = hasSave();
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
			viewW: this.viewW,
			viewH: this.viewH,
			cssW: this.cssW,
			cssH: this.cssH,
			mapName: MAPS[this.mapId]?.name ?? "",
			region: MAPS[this.mapId]?.region ?? "",
			objective: currentObjective(this.flags),
			gold: this.gold,
			party: this.party,
			box: this.box,
			inventory: this.inventory,
			flags: this.flags,
			seen: this.seen,
			caught: this.caught,
			dialog: this.dialog ? {
				speaker: this.dialog.speaker,
				text: this.dialog.pages[this.dialog.index] ?? "",
				last: this.dialog.index >= this.dialog.pages.length - 1,
				npcId: this.dialog.npcId,
				portraitKey: this.dialog.portraitKey
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
			selectedUid: this.selectedUid,
			shopIndex: this.shopIndex,
			shopMode: this.shopMode,
			shopStock: SHOP_STOCK,
			hasSave: this.hasSave,
			importTicket: this.importTicket,
			items: ITEMS
		};
	}
	get started(): boolean {
		return this.lifecycle === "booted";
	}
	private async loadImages(token: number): Promise<void> {
		const entries = collectGameAssets();
		const requiredByUrl = new Map(entries.map((entry) => [entry.url, entry.required]));
		let done = 0;
		const requiredFailures: string[] = [];
		await Promise.all(entries.map((entry) => new Promise<void>((resolve) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				if (token !== this.bootToken || this.lifecycle !== "booted") { resolve(); return; }
				this.images[entry.key] = img;
				this.terrain = null;
				done += 1;
				this.loadProgress = done / entries.length;
				resolve();
			};
			img.onerror = () => {
				if (requiredByUrl.get(entry.url)) requiredFailures.push(entry.url);
				done += 1;
				if (token === this.bootToken && this.lifecycle === "booted") {
					this.loadProgress = done / entries.length;
				}
				resolve();
			};
			img.src = entry.url;
		})));
		if (token !== this.bootToken || this.lifecycle !== "booted") return;
		this.loadProgress = 1;
		if (requiredFailures.length) {
			this.toastMsg(`Missing required assets (${requiredFailures.length}). Reload when files are available.`);
		}
		this.emit();
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
	destroy(): void {
		this.bootToken += 1;
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
	layout(stageW: number, stageH: number): void {
		const portrait = stageW > 0 && stageH > stageW * 1.05 && stageW < 920;
		const vw = portrait ? VIEW_W_PORT : VIEW_W;
		const vh = portrait ? VIEW_H_PORT : VIEW_H;
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
		if (this.viewW === vw && this.viewH === vh && this.cssW === cssW && this.cssH === cssH && canvas.width === vw * TILE) return;
		this.viewW = vw;
		this.viewH = vh;
		this.cssW = cssW;
		this.cssH = cssH;
		resetWorldCamRelief(this.worldCamRelief);
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
				const buttons = list?.querySelectorAll<HTMLButtonElement>("button");
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
		this.moving = false;
		this.encounterLock = false;
		this.mode = "world";
		this.openDialog("???", [
			...(notice ? [notice] : []),
			"A lantern ticks on the sill. Morning in Elderhall smells of peat and bread.",
			"You are Rowan, newly sworn Pactwarden. The Crown of Binding cracked a generation ago — beasts walk feral on the old roads.",
			"Elder Maren is waiting at the Chapter house. Take the lantern. Walk."
		]);
	}
	continueGame(): void {
		unlockAudio();
		startMusic();
		const s = loadSave();
		if (!s) {
			this.hasSave = false;
			this.startNew(
				"The last lantern fell silent — its story could not be read. This is a new beginning.",
			);
			return;
		}
		this.applySave(s);
		this.mode = "world";
		this.toastMsg("The lantern remembers.");
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
		this.menu = null;
		this.menuIndex = 0;
		this.hasSave = true;
		this.toastMsg(`The lantern takes up ${save.playerName} — ${MAPS[save.mapId]?.name ?? save.mapId}.`);
		this.emit();
		return true;
	}
	setSaveWriteAllowed(allowed: boolean, message?: string): void {
		this.saveWriteAllowed = allowed;
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
		if (this.mode === "world" && (!this.dialog || this.injected) && !this.menu) this.tickMove(dt);
		this.draw();
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
		if (this.occupied(nx, ny)) return;
		this.moving = true;
		this.moveT = 0;
		this.fromX = this.px;
		this.fromY = this.py;
		this.toX = nx * TILE;
		this.toY = ny * TILE;
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
	}
	private resetWorldCameraRelief(): void {
		resetWorldCamRelief(this.worldCamRelief);
	}
	private warp(to: string, x: number, y: number, dir: Dir): void {
		if (!MAPS[to]) return;
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

	/** Highlight a battle option without committing to it. */
	previewBattle(i: number): void {
		this.setMenuIndex(i);
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

	confirm = (): void => {
		unlockAudio();
		if (this.mode === "title") return;
		if (this.dialog) {
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
		if (this.dialog) {
			if (this.dialog.onDone) {
				this.dialog = null;
				sfxPlay.cancel();
				this.emit();
				return;
			}
			this.confirm();
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
		if (this.mode !== "world" || this.dialog || this.battle) return;
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
		if (b.phase === "bind") return [
			"common_sigil",
			"thorn_sigil",
			"relic_sigil"
		].filter((s) => (this.inventory[s] ?? 0) > 0).length;
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
		const npc = m.npcs.find((n) => n.x === fx && n.y === fy);
		if (npc) {
			this.talk(npc.talk, npc.name, { npcId: npc.id, sprite: npc.sprite });
			return;
		}
		const obj = pickInteractObject(m.objects, fx, fy);
		if (obj?.interact) {
			this.handleInteract(obj.interact);
			return;
		}
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
		});
	}
	private talk(id: string, name: string, npc?: DialogSpeaker): void {
		const dialog = NPC_DIALOGS[id];
		if (!dialog) return;
		if (dialog.kind === "action") {
			if (dialog.action === "inn") {
				this.openDialog(name, ["Fifteen crowns for a clean bed and a whole lantern. (A rest · B not now)"], () => this.offerInn(name, npc), npc);
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
				this.openDialog(name, wardenPages({ flags: this.flags, strongestLevel: strongest }), () => this.startWarden(), npc);
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
		if (this.flags.starter && this.party.length > 0) {
			this.openDialog("", ["The grove is quiet. Your pact is already spoken."]);
			return;
		}
		const sp = SPECIES[id];
		if (!sp) return;
		this.openDialog(sp.name, [`${sp.name}, the ${sp.epithet}. ${sp.description}`, "Speak the pact? (A bind · B wait)"], () => {
			const b = makeBeast(id, 5, { nickname: sp.name, random: this.random });
			this.party = [b];
			this.caught[id] = true;
			this.seen[id] = true;
			this.flags.starter = true;
			this.give("common_sigil", 3);
			this.gold += 40;
			sfxPlay.catch();
			this.openDialog("Elder Maren", [`So it is ${sp.name}. Keep the name.`, "I have left sigils in your pack. The Briar Road will teach the rest."], undefined, { npcId: "maren", sprite: "elder" });
			this.persist();
		});
	}
	private give(id: string, n: number): void {
		this.inventory[id] = (this.inventory[id] ?? 0) + n;
	}
	openDialog(speaker: string, pages: string[], onDone?: () => void, npc?: DialogSpeaker | null): void {
		this.dialog = {
			speaker,
			pages,
			index: 0,
			onDone,
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
				b.log = [`${me.nickname} hasn't the breath.`];
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
				b.log = ["That item would have no effect."];
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
			const st = [
				"common_sigil",
				"thorn_sigil",
				"relic_sigil"
			].filter((s) => (this.inventory[s] ?? 0) > 0)[b.menuIndex];
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
				b.log = [`${this.party[idx]!.nickname} steps forward.`];
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
		return Object.keys(this.inventory).filter((id) => (this.inventory[id] ?? 0) > 0 && ITEMS[id] && ITEMS[id].kind !== "sigil" && ITEMS[id].kind !== "key" && (!this.battle || ITEMS[id].kind !== "field"));
	}
	private tryFlee(): void {
		const b = this.battle!;
		const me = currentStats(this.party[b.playerIndex]!);
		const foe = currentStats(b.foes[b.foeIndex]!);
		if (this.party[b.playerIndex]!.status === "bind") {
			const roots = "Roots hold fast — no escape.";
			this.afterPlayer();
			if (this.battle) this.battle.log = [roots, ...(this.battle.log ?? [])];
			this.emit();
			return;
		}
		// Mirror the capture cap: extreme speed gaps can never make fleeing
		// certain or impossible.
		const chance = Math.min(.95, Math.max(.05, .4 + (me.spd - foe.spd) / 200));
		if (this.random() < chance) {
			b.log = ["You break from the grass."];
			b.escaped = true;
			b.phase = "win";
			sfxPlay.confirm();
		} else {
			b.log = ["The beast cuts off the path."];
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
					b.log = [fumbleNotice];
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
					b.log = [`${me.nickname} hasn't the breath.`];
					return;
				}
				const cue = this.useSkill(me, foe, false, sk, true);
				if (cue) strikeAnim = cue;
			} else if (act.type === "item") this.useItem(act.item!, me, true);
			else if (act.type === "bind") this.tryCatch(act.item!);
			else if (act.type === "switch") {
				b.playerIndex = act.index!;
				me = this.party[b.playerIndex]!;
				b.log = [`${this.party[b.playerIndex]!.nickname} steps forward.`];
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
		if (log !== null) b.log = [log];
		const event = events[0]!;
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
			this.battle!.log = [`${foe.nickname}'s grip fumbles — it cannot find its line.`];
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
		b.log = [`${sp.name} falls. ${me.nickname} gains ${xp} lore.`];
		this.grantXp(me, xp);
		const next = b.foes.findIndex((f, i) => i > b.foeIndex && f.hp > 0);
		if (next >= 0) {
			b.foeIndex = next;
			const nsp = SPECIES[b.foes[next].speciesId];
			b.log = [`${sp.name} falls.`, `${b.trainerName ?? "The foe"} sends ${nsp.name}.`];
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
		b.log = [`${sp.name} falls. The road yields ${gold} crowns.`];
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
			b.log = [`${this.party[b.playerIndex]!.nickname} cannot stand.`, "Choose another."];
			b.phase = "party";
			b.menuIndex = this.menuIndex = next;
			this.emit();
			return;
		}
		b.log = ["The lantern goes out."];
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
			b.log = ["You cannot bind this foe."];
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
				this.battle.log = [`${sp.name} accepts the compact.`];
				this.battle.phase = "win";
				sfxPlay.catch();
				this.emit();
			} else {
				const failedBind = `${sp.name} breaks the sigil.`;
				if (this.battle) this.battle.log = [failedBind];
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
			if (inBattle && this.battle) this.battle.log = ["That item would have no effect."];
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
		if (this.battle) this.battle.log = [`${def.name} on ${target.nickname}.`];
	}
	private endBattle(victory: boolean): void {
		const wasTrial = this.battle?.kind === "trial";
		this.resetWorldCameraRelief();
		this.battle = null;
		this.battleStableReserve = null;
		this.battleIdlePhase = 0;
		this.mode = wasTrial && victory && !this.flags.ending ? this.maybeVictory() : "world";
		this.encounterLock = false;
		this.persist();
		this.emit();
	}
	private maybeVictory(): Mode {
		if (this.flags.trial && !this.flags.ending) {
			this.flags.ending = true;
			this.openDialog("Warden Cael", [
				"Enough. You keep the compact.",
				"Take the Thorn Mark. The Hollow Crown still sits in rumor, west of the ash. That road is longer than this lantern-light.",
				"Come back when you have more names in the Reliquary. I'll still be here. Unfortunately."
			], () => {
				this.mode = "victory";
				this.emit();
			}, { npcId: "cael", sprite: "warden" });
			return "world";
		}
		return "world";
	}
	private whiteOut(): void {
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
				this.toastMsg(`Bought ${it.name}.`);
			}
		} else {
			const id = Object.keys(this.inventory).filter((id) => (this.inventory[id] ?? 0) > 0 && ITEMS[id])[this.shopIndex];
			if (!id) return;
			const it = ITEMS[id]!;
			const result = sellItem(this.gold, this.inventory, it);
			if (!result.ok) return;
			this.gold = result.gold;
			this.inventory = result.inventory;
			sfxPlay.confirm();
			this.toastMsg(`Sold ${it.name}.`);
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
			} else this.menu = null;
			this.menuIndex = 0;
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
	private draw(): void {
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
		this.drawWorld(ctx);
	}
	private drawWorld(ctx: CanvasRenderingContext2D): void {
		const m = this.map();
		const mw = m.ground[0]?.length ?? 0;
		const mh = m.ground.length;
		const camX = Math.max(0, Math.min(this.px - (this.viewW / 2 - 0.5) * TILE, Math.max(0, mw * TILE - this.cw())));
		let camY = Math.max(0, Math.min(this.py - (this.viewH / 2 - 0.5) * TILE, Math.max(0, mh * TILE - this.ch())));
		const canvas = this.canvas;
		const playerHeadCanvasY = this.py + TILE - TILE * 1.5 - camY;
		if (canvas && typeof document !== "undefined" && this.mode === "world" && !this.menu && !this.dialog) {
			const { insetCanvas, source } = readUiSafeTopCanvas(canvas);
			if (source) {
				const adjusted = adjustCamYForHudInset(camY, playerHeadCanvasY, insetCanvas, this.worldCamRelief);
				camY = adjusted.camY;
				this.worldCamRelief.relief = adjusted.relief;
				this.worldCamRelief.contentPanY = adjusted.contentPanY;
				reportWorldCameraGeometry(this.cw(), this.ch(), {
					hudInsetBottom: insetCanvas,
					hudInsetSource: source,
					camRelief: adjusted.relief,
					contentPanY: adjusted.contentPanY,
					headAfterCamRelief: adjusted.headAfterCamRelief,
					effectivePlayerHeadCanvasY: adjusted.effectiveHeadCanvasY,
					playerHeadCanvasY: adjusted.headAfterCamRelief,
				});
			} else {
				this.resetWorldCameraRelief();
			}
		} else if (canvas && typeof document !== "undefined") {
			this.resetWorldCameraRelief();
		}
		const worldPanY = this.worldCamRelief.contentPanY;
		if (worldPanY > 0) {
			ctx.save();
			ctx.translate(0, worldPanY);
		}
		if (this.terrain?.map !== m) {
			const canvas = document.createElement("canvas");
			canvas.width = mw * TILE;
			canvas.height = mh * TILE;
			const ground = canvas.getContext("2d");
			if (!ground) return;
			ground.imageSmoothingEnabled = false;
			bakeMapTerrain({
				map: m,
				tileSize: TILE,
				drawTile: (name, dx, dy, variant) => {
					const tx = dx / TILE;
					const ty = dy / TILE;
					const atlas = this.images[`tile_${name}-2x2`];
					const base = this.images[`tile_${name}`];
					if (atlas && variant > 0) {
						drawAtlasTile(ground, atlas, dx, dy, TILE, tileAtlasQuadrant(variant, tx, ty));
					} else if (base) ground.drawImage(base, dx, dy, TILE, TILE);
					else {
						ground.fillStyle = name === "water" ? "#3d6e8a" : name === "wall" ? "#3a342e" : "#3d4a38";
						ground.fillRect(dx, dy, TILE, TILE);
					}
					if (variant > 0 && !atlas) {
						ground.fillStyle = `rgba(20,17,14,${0.035 * variant})`;
						ground.fillRect(dx, dy, TILE, TILE);
					}
				},
				drawOverlay: (style, dx, dy, strength) => {
					if (style === "edge") {
						ground.fillStyle = `rgba(20,17,14,${0.12 + strength * 0.2})`;
						ground.fillRect(dx + 2, dy + 2, TILE - 4, TILE - 4);
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
		ctx.drawImage(this.terrain.canvas, Math.ceil(camX), Math.ceil(camY), this.cw(), this.ch(), 0, 0, this.cw(), this.ch());
		const list: { y: number; draw: () => void }[] = [];
		for (const o of m.objects) {
			if (this.flags.starter && o.id.startsWith("st_")) continue;
			if (o.x * TILE >= camX + this.cw() || (o.x + o.w) * TILE <= camX || o.y * TILE >= camY + this.ch() || (o.y + o.h) * TILE <= camY) continue;
			list.push({
				y: (o.y + o.h) * TILE,
				draw: () => {
					const img = this.images[`prop_${o.sprite}`] || this.images[`sprite_${o.sprite}`] || this.images[`npc_${o.sprite}`];
					const dx = o.x * TILE - camX;
					const dy = o.y * TILE - camY;
					const dw = o.w * TILE;
					const dh = o.h * TILE;
					if (img) {
						paintWorldActorShadow(ctx, dx, dy + dh - 4, dw);
						ctx.drawImage(img, dx, dy, dw, dh);
					}
				}
			});
		}
		for (const n of m.npcs) {
			if (n.x * TILE >= camX + this.cw() || (n.x + 1) * TILE <= camX || (n.y - .25) * TILE >= camY + this.ch() || (n.y + 1) * TILE <= camY) continue;
			list.push({
			y: (n.y + 1) * TILE,
			draw: () => {
				const img = this.images[`npc_${n.sprite}`];
				const dx = n.x * TILE - camX;
				const dw = TILE;
				const dh = TILE * 1.25;
				const dy = n.y * TILE + TILE - dh - camY;
				if (img) {
					paintWorldActorShadow(ctx, dx, dy + dh - 4, dw);
					ctx.drawImage(img, dx, dy, dw, dh);
				}
			}
		});
		}
		list.push({
			y: this.py + TILE,
			draw: () => {
				const frame = this.moving ? this.walkFrame : 0;
				const key = `player_${DIRS[this.dir].name}${frame}`;
				const img = this.images[key] || this.images.player_down0;
				const dx = this.px - camX;
				const dw = TILE;
				const dh = TILE * 1.5;
				const dy = this.py + TILE - dh - camY;
				if (img) {
					paintWorldActorShadow(ctx, dx, dy + dh - 4, dw);
					ctx.drawImage(img, dx, dy, dw, dh);
				} else {
					ctx.fillStyle = "#c4a574";
					ctx.fillRect(dx + 8, dy + 8, 16, 20);
				}
			}
		});
		list.sort((a, b) => a.y - b.y);
		for (const s of list) s.draw();
		if (worldPanY > 0) ctx.restore();
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
		const layout = computeBattleLayout(cw, ch, this.battleStableReserve, { stableReserve: true });
		const geometryBase = computeBattleStageGeometry(cw, ch, layout, b.phase);
		const bg = this.images[`bg_${b.bg}`] || this.images.bg_grass;
		if (bg) ctx.drawImage(bg, 0, 0, cw, ch);
		else {
			ctx.fillStyle = "#2c3d32";
			ctx.fillRect(0, 0, cw, ch);
		}
		paintBattleBackdrop(ctx, cw, ch, layout, b.bg);
		const anchors = { player: layout.player, foe: { cx: layout.foe.cx, cy: layout.foe.cy } };
		const motion = b.animCue
			? sampleBattleAnim(b.animCue, b.animElapsedMs, geometryBase.animCorridor, anchors, {
					reducedMotion: this.reducedMotion,
					idlePhase: this.battleIdlePhase,
				})
			: sampleBattleIdle({ reducedMotion: this.reducedMotion, idlePhase: this.battleIdlePhase });
		const playerCosmetic = { dx: motion.dx, dy: motion.dy };
		const foeCosmetic = {
			dx: b.animCue?.attacker === "foe" ? motion.dx : 0,
			dy: motion.dy * 0.35,
		};
		const geometry = { ...geometryBase, cosmeticOffset: { player: playerCosmetic, foe: foeCosmetic } };
		reportBattleStageGeometry(cw, ch, geometry);
		const foe = b.foes[b.foeIndex]!;
		if (foe && foe.hp > 0) {
			const img = this.images[`sprite_${foe.speciesId}`];
			const catchShake = b.phase === "catch" ? Math.sin(b.shake * 8) * 6 : 0;
			const shake = catchShake + motion.foeShakeX;
			if (img) {
				drawBattleFoeSprite(ctx, img, layout, shake, foeCosmetic);
			}
		}
		const me = this.party[b.playerIndex]!;
		if (me) {
			const img = this.images[`sprite_${me.speciesId}`];
			if (img) drawBattlePlayerSprite(ctx, img, layout, playerCosmetic);
		}
		if (motion.projectile) paintGustProjectile(ctx, motion.projectile);
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
