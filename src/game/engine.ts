import {
  currentStats,
  healFull,
  ITEMS,
  makeBeast,
  SHOP_STOCK,
  SKILLS,
  SPECIES,
} from "./content.ts";
import { ENCOUNTER_TILES, GROUND_TILE, MAPS } from "./maps.ts";
import { DIRS, YAW, facingOffset, isOccupied } from "./world/movement.ts";
import { CHEST_LOOT, SIGN_TEXT, WARP_TABLE, findInteractionTarget } from "./world/interactions.ts";
import { npcDialogue } from "./story/interactions.ts";
import { sfxPlay, startMusic, unlockAudio } from "./audio.ts";
import { hasSave, loadSave, writeSave, type SaveStorage } from "./save.ts";
import { mathRandom, type RandomSource } from "./rng.ts";
import { chooseFoeSkill } from "./battle/ai.ts";
import { reduceAttack } from "./battle/reducer.ts";
import { createTrialBattle, createWildBattle } from "./battle/state.ts";
import { captureChance, captureSucceeds, storeCapturedBeast } from "./systems/capture.ts";
import { healBeast, playerActsFirst, spendSkillMp } from "./systems/combat.ts";
import { purchaseItem, sellItem } from "./systems/economy.ts";
import { validateItemUse } from "./systems/items.ts";
import { awardExperience } from "./systems/progression.ts";
import { tickStatus as tickBeastStatus } from "./systems/status.ts";
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

type Dialog = {
  speaker: string;
  pages: string[];
  index: number;
  onDone?: () => void;
};

const WALK_MS = 160;
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
	gold = 200;
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
	lifecycle: "constructed" | "booted" | "stopped" = "constructed";
	private readonly storage?: SaveStorage | null;
	private readonly random: RandomSource;
	private bootToken = 0;
	private visibilityHandler = (): void => {
		if (document.visibilityState === "hidden") {
			this.keys.clear();
			this.persist();
		}
	};
	private probe: NonNullable<Window["__controlsTest"]> | null = null;
	constructor(options: { random?: RandomSource; storage?: SaveStorage | null } = {}) {
		this.random = options.random ?? mathRandom;
		this.storage = options.storage;
		this.snap = this.buildSnap();
		this.hasSave = hasSave(this.storage);
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
				last: this.dialog.index >= this.dialog.pages.length - 1
			} : null,
			menu: this.menu,
			menuIndex: this.menuIndex,
			battle: this.battle,
			toast: this.toast,
			selectedUid: this.selectedUid,
			shopIndex: this.shopIndex,
			shopMode: this.shopMode,
			shopStock: SHOP_STOCK,
			hasSave: this.hasSave,
			items: ITEMS
		};
	}
	get started(): boolean {
		return this.lifecycle === "booted";
	}
	private async loadImages(token: number): Promise<void> {
		const paths = collectPaths();
		let done = 0;
		await Promise.all(paths.map(([key, src]) => new Promise<void>((resolve) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				this.images[key] = img;
				done += 1;
				this.loadProgress = done / paths.length;
				resolve();
			};
			img.onerror = () => {
				done += 1;
				this.loadProgress = done / paths.length;
				resolve();
			};
			img.src = src;
		})));
		if (token !== this.bootToken || this.lifecycle !== "booted") return;
		this.loadProgress = 1;
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
		this.installProbe();
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
		this.keys.clear();
		this.injected = null;
		this.lastTs = 0;
		this.animWait = 0;
		this.animFn = null;
		this.canvas = null;
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
		canvas.width = vw * TILE;
		canvas.height = vh * TILE;
		this.emit();
	}

	private bindInput(): void {
		window.addEventListener("keydown", this.onKeyDown);
		window.addEventListener("keyup", this.onKeyUp);
		window.addEventListener("blur", this.onBlur);
		document.addEventListener("visibilitychange", this.visibilityHandler);
	}
	private onKeyDown = (e: KeyboardEvent): void => {
		if ((new Set([
			"ArrowUp",
			"ArrowDown",
			"ArrowLeft",
			"ArrowRight",
			"KeyW",
			"KeyA",
			"KeyS",
			"KeyD",
			"KeyZ",
			"KeyX",
			"KeyC",
			"KeyM",
			"Enter",
			"Space",
			"Escape",
			"ShiftLeft"
		])).has(e.code)) e.preventDefault();
		this.keys.add(e.code);
		if (e.code === "KeyZ" || e.code === "Enter" || e.code === "Space") this.confirm();
		if (e.code === "KeyX" || e.code === "Escape" || e.code === "ShiftLeft") this.cancel();
		if (e.code === "KeyM" || e.code === "KeyC") this.toggleMenu();
		const up = e.code === "ArrowUp" || e.code === "KeyW";
		const down = e.code === "ArrowDown" || e.code === "KeyS";
		if ((this.menu || this.battle || this.mode === "shop") && (up || down)) {
			const max = this.menuLen();
			if (max > 0) this.moveMenu(up ? -1 : 1, max);
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
		window.__controlsTest = this.probe;
	}
	startNew(): void {
		unlockAudio();
		startMusic();
		sfxPlay.confirm();
		this.playerName = "Rowan";
		this.mapId = "home";
		this.tx = MAPS.home!.spawn.x;
		this.ty = MAPS.home!.spawn.y;
		this.px = this.tx * TILE;
		this.py = this.ty * TILE;
		this.dir = 0;
		this.gold = 180;
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
			this.startNew();
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
	persist(): boolean {
		const ok = writeSave({
			version: 2,
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
		}, this.storage);
		if (ok) this.hasSave = true;
		return ok;
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
		this.playTime += dt;
		if (this.toastT > 0) {
			this.toastT -= dt;
			if (this.toastT <= 0) this.toast = null;
		}
		if (this.animWait > 0) {
			this.animWait -= dt;
			if (this.animWait <= 0 && this.animFn) {
				const fn = this.animFn;
				this.animFn = null;
				fn();
			}
		}
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
		const off = facingOffset(d);
		const nx = this.tx + off.x;
		const ny = this.ty + off.y;
		const warp = this.map().warps.find((w) => w.x === nx && w.y === ny);
		if (warp) {
			if (!this.flags.starter && (warp.to === "briar_road" || this.mapId === "elderhall" && ny <= 0)) {
				this.openDialog("Gateward", ["The Briar Road is no place without a pact-beast. Speak with Elder Maren."]);
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
		const g = this.groundAt(this.tx, this.ty);
		if (ENCOUNTER_TILES.has(g) && this.party.length && this.quietBell <= 0 && !this.encounterLock) {
			const rate = this.map().encounterRate;
			if (this.random() < rate) this.startWild();
		}
	}
	private warp(to: string, x: number, y: number, dir: Dir): void {
		if (!MAPS[to]) return;
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
			if (this.battle.phase === "party" && this.battle.pendingSwitch) return;
			if (this.battle.phase === "skills" || this.battle.phase === "items" || this.battle.phase === "item-target" || this.battle.phase === "party" || this.battle.phase === "bind") {
				this.battle.pendingItem = null;
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
			else this.menu = "root";
			this.menuIndex = 0;
			sfxPlay.cancel();
			this.emit();
		}
	};
	toggleMenu = (): void => {
		if (this.mode !== "world" || this.dialog || this.battle) return;
		this.menu = this.menu ? null : "root";
		this.menuIndex = 0;
		sfxPlay.menu();
		this.emit();
	};
	emitPublic = (): void => {
		this.emit();
	};
	private menuLen(): number {
		if (this.mode === "shop") {
			if (this.shopMode === "buy") return SHOP_STOCK.length;
			return Object.keys(this.inventory).filter((id) => (this.inventory[id] ?? 0) > 0).length;
		}
		if (this.menu === "root") return 5;
		if (this.menu === "items") return this.usableItems().length;
		if (this.menu === "party") return this.party.length;
		const b = this.battle!;
		if (!b) return 0;
		if (b.phase === "command") return b.canFlee ? 6 : 4;
		if (b.phase === "skills") return this.party[b.playerIndex]?.skills.length ?? 0;
		if (b.phase === "items") return this.usableItems().length;
		if (b.phase === "bind") return [
			"common_sigil",
			"thorn_sigil",
			"relic_sigil"
		].filter((s) => (this.inventory[s] ?? 0) > 0).length;
		if (b.phase === "item-target") return this.party.length;
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
		const off = facingOffset(this.dir);
		const fx = this.tx + off.x;
		const fy = this.ty + off.y;
		const { npc, object } = findInteractionTarget(this.map(), fx, fy);
		if (npc) {
			this.talk(npc.talk, npc.name);
			return;
		}
		if (object?.interact) {
			this.handleInteract(object.interact);
			return;
		}
	}
	private handleInteract(id: string): void {
		if (WARP_TABLE[id]) {
			const [to, x, y] = WARP_TABLE[id]!;
			this.warp(to, x, y, 3);
			return;
		}
		if (id === "shrine") {
			this.party.forEach(healFull);
			this.persist();
			sfxPlay.save();
			this.openDialog("Shrine", ["The old compact holds. Your beasts are whole. The lantern is written."]);
			return;
		}
		if (id === "bed") {
			this.party.forEach(healFull);
			this.persist();
			sfxPlay.heal();
			this.openDialog("", ["You rest. The lantern ticks. Dawn, again."]);
			return;
		}
		if (id === "books") {
			this.openDialog("Ledger", ["Pactwardens do not own beasts. They keep them. The Reliquary is a promise, not a cage."]);
			return;
		}
		if (id.startsWith("starter_")) {
			this.chooseStarter(id.slice(8));
			return;
		}
		if (id.startsWith("sign_")) {
			this.openDialog("Sign", [SIGN_TEXT[id] ?? "The letters have worn away."]);
			return;
		}
		if (id.startsWith("chest_")) {
			if (this.flags[id]) {
				this.openDialog("", ["Already looted."]);
				return;
			}
			this.flags[id] = true;
			const [item, n] = CHEST_LOOT[id] ?? ["tonic", 1];
			this.give(item, n);
			sfxPlay.confirm();
			this.openDialog("", [`Inside: ${ITEMS[item]?.name ?? item} ×${n}.`]);
		}
	}
	private talk(id: string, name: string): void {
		const d = npcDialogue(id, this.flags);
		if (!d) return;
		if (d.effect === "shop") {
			this.mode = "shop";
			this.shopMode = "buy";
			this.shopIndex = 0;
			sfxPlay.menu();
			this.emit();
			return;
		}
		const onDone = d.effect === "offerInn" ? () => this.offerInn() : d.effect === "startWarden" ? () => this.startWarden() : undefined;
		this.openDialog(d.speaker || name, d.pages, onDone);
	}
	private offerInn(): void {
		if (this.gold < 15) {
			this.openDialog("Innmother Cald", ["Crowns first, kindness second. Come back when the purse is less embarrassed."]);
			return;
		}
		this.gold -= 15;
		this.party.forEach(healFull);
		this.persist();
		sfxPlay.heal();
		this.openDialog("Innmother Cald", ["Sleep. The road will still be there. Unfortunately."]);
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
			this.openDialog("Elder Maren", [`So it is ${sp.name}. Keep the name.`, "I have left sigils in your pack. The Briar Road will teach the rest."]);
			this.persist();
		});
	}
	private give(id: string, n: number): void {
		this.inventory[id] = (this.inventory[id] ?? 0) + n;
	}
	openDialog(speaker: string, pages: string[], onDone?: () => void): void {
		this.dialog = {
			speaker,
			pages,
			index: 0,
			onDone
		};
		this.emit();
	}
	toastMsg(t: string): void {
		this.toast = t;
		this.toastT = 2.2;
		this.emit();
	}
	private startWild(): void {
		const table = this.map().encounters;
		if (!table.length) return;
		const total = table.reduce((s, e) => s + e.w, 0);
		let r = this.random() * total;
		let pick = table[0];
		for (const e of table) {
			r -= e.w;
			if (r <= 0) {
				pick = e;
				break;
			}
		}
		const level = pick.min + Math.floor(this.random() * (pick.max - pick.min + 1));
		const foe = makeBeast(pick.species, level, { random: this.random });
		this.seen[pick.species] = true;
		this.encounterLock = true;
		sfxPlay.encounter();
		this.battle = createWildBattle(foe, this.map().battleBg, this.firstAble());
		this.mode = "battle";
		this.menuIndex = 0;
		this.emit();
	}
	private startWarden(): void {
		const foes = [
			makeBeast("ironnewt", 12, { random: this.random }),
			makeBeast("chapelite", 13, { random: this.random }),
			makeBeast("keepdrake", 15, { random: this.random })
		];
		foes.forEach((f) => {
			this.seen[f.speciesId] = true;
		});
		sfxPlay.encounter();
		this.battle = createTrialBattle(foes, this.firstAble(), "Warden Cael");
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
			const cmds = b.canFlee ? [
				"Strike",
				"Skill",
				"Item",
				"Bind",
				"Party",
				"Flee"
			] : [
				"Strike",
				"Skill",
				"Item",
				"Party"
			];
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
			b.phase = "item-target";
			b.pendingItem = it;
			b.menuIndex = 0;
			this.menuIndex = 0;
			sfxPlay.confirm();
			this.emit();
			return;
		}
		if (b.phase === "item-target") {
			const id = b.pendingItem;
			if (!id) {
				b.phase = "command";
				this.emit();
				return;
			}
			// This validation and the one inside useItem run synchronously on the same
			// state (playerAction invokes useItem with no await in between), so their
			// verdicts cannot disagree.
			const plan = validateItemUse(ITEMS[id], this.party, b.playerIndex, true, b.menuIndex);
			if (!plan.ok) {
				const fieldName = ITEMS[id]?.name ?? "That item";
				const message = plan.reason === "field-only"
					? `${fieldName} cannot be heard here.`
					: plan.reason === "invalid-target"
						? "That pact-beast cannot take it."
						: plan.reason === "no-target"
							? "There is no one to use it on."
							: "Nothing happens.";
				b.log = [message];
				sfxPlay.fail();
				if (plan.reason === "field-only" || plan.reason === "no-target" || plan.reason === "unusable") {
					b.pendingItem = null;
					b.phase = "command";
					b.menuIndex = 0;
					this.menuIndex = 0;
				}
				this.emit();
				return;
			}
			b.pendingItem = null;
			this.playerAction({ type: "item", item: id, index: plan.targetIndex });
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
			const target = this.party[idx];
			if (!target || target.hp <= 0) return;
			if (idx === b.playerIndex) return;
			if (b.pendingSwitch) {
				b.playerIndex = idx;
				b.pendingSwitch = false;
				b.phase = "command";
				b.menuIndex = 0;
				this.menuIndex = 0;
				b.log = [`${this.party[idx]!.nickname} steps forward.`];
				sfxPlay.confirm();
				this.emit();
				return;
			}
			this.playerAction({ type: "switch", index: idx });
		}
	}
	usableItems(): string[] {
		return Object.keys(this.inventory).filter((id) => (this.inventory[id] ?? 0) > 0 && ITEMS[id] && ITEMS[id].kind !== "sigil" && ITEMS[id].kind !== "key");
	}
	private tryFlee(): void {
		const b = this.battle!;
		const me = currentStats(this.party[b.playerIndex]!);
		const foe = currentStats(b.foes[b.foeIndex]!);
		const chance = .4 + (me.spd - foe.spd) / 200;
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
		const me = this.party[b.playerIndex]!;
		const foe = b.foes[b.foeIndex]!;
		const playerFirst = playerActsFirst(me, foe, this.random) || act.type === "item" || act.type === "switch" || act.type === "bind";
		const doPlayer = () => {
			if (me.hp <= 0) return;
			if (act.type === "strike") this.useSkill(me, foe, false, basicStrike(me), true);
			else if (act.type === "skill") {
				const sk = SKILLS[act.skill!];
				if (!sk) return;
				if (!spendSkillMp(me, sk)) {
					b.log = [`${me.nickname} hasn't the breath.`];
					return;
				}
				this.useSkill(me, foe, false, sk, true);
			} else if (act.type === "item") this.useItem(act.item!, true, act.index);
			else if (act.type === "bind") this.tryCatch(act.item!);
			else if (act.type === "switch") {
				b.playerIndex = act.index!;
				b.log = [`${this.party[b.playerIndex]!.nickname} steps forward.`];
			}
		};
		const doFoe = () => {
			const active = this.party[b.playerIndex]!;
			if (foe.hp <= 0 || b.phase === "catch" || b.escaped || active.hp <= 0) return;
			this.foeTurn(foe, active);
		};
		if (playerFirst) {
			doPlayer();
			if (b.phase === "catch") return;
			if (foe.hp <= 0) {
				this.foeDown();
				return;
			}
			doFoe();
			if (this.party[b.playerIndex]!.hp <= 0) {
				this.playerDown();
				return;
			}
		} else {
			doFoe();
			if (this.party[b.playerIndex]!.hp <= 0) {
				this.playerDown();
				return;
			}
			doPlayer();
			if (b.phase === "catch") return;
			if (foe.hp <= 0) this.foeDown();
		}
		if (b.phase !== "win" && b.phase !== "lose") {
			b.phase = "command";
			b.menuIndex = 0;
			this.menuIndex = 0;
			this.tickStatus(this.party[b.playerIndex]!);
			this.tickStatus(foe);
		}
		this.emit();
	}
	private useSkill(atk: Beast, def: Beast, _foeSide: boolean, skill: Skill, logIt: boolean): void {
		const b = this.battle!;
		const outcome = reduceAttack(atk, def, skill, this.random).outcome;
		const messages = outcome.events.filter((e) => e.kind === "message").map((e) => e.text);
		const missed = outcome.events.some((e) => e.kind === "miss");
		if (messages.length && (logIt || !missed)) b.log = [messages.join(" ")];
		if (missed) sfxPlay.fail();
		else if (outcome.events.some((e) => e.kind === "heal")) sfxPlay.heal();
		else if (outcome.events.some((e) => e.kind === "hit" && e.critical)) sfxPlay.crit();
		else if (outcome.events.some((e) => e.kind === "hit")) sfxPlay.hit();
		else sfxPlay.menu();
	}
	private foeTurn(foe: Beast, me: Beast): void {
		const skills = foe.skills.map((id) => SKILLS[id]).filter(Boolean) as Skill[];
		const best = chooseFoeSkill(foe, SPECIES[me.speciesId]!.elements, skills, SKILLS.nip);
		if (best.mp) foe.mp = Math.max(0, foe.mp - best.mp);
		this.useSkill(foe, me, true, best, true);
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
			b.phase = "command";
			this.emit();
			return;
		}
		const gold = 8 + foe.level * 3 + (b.kind === "trial" ? 80 : 0);
		this.gold += gold;
		b.log = [`${sp.name} falls. The road yields ${gold} crowns.`];
		b.phase = "win";
		if (b.kind === "trial") {
			this.flags.trial = true;
			this.give("thorn_sigil", 3);
			this.give("greater_tonic", 2);
		}
		this.emit();
	}
	private playerDown(): void {
		const b = this.battle!;
		const fallen = this.party[b.playerIndex]!;
		sfxPlay.faint();
		const next = this.party.findIndex((p) => p.hp > 0);
		if (next >= 0) {
			b.log = [`${fallen.nickname} cannot stand.`, "Choose another."];
			b.phase = "party";
			b.pendingSwitch = true;
			b.menuIndex = next;
			this.menuIndex = next;
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
		if (progression.evolvedFrom && progression.evolvedInto) {
			this.caught[progression.evolvedInto] = true;
			this.seen[progression.evolvedInto] = true;
			this.toastMsg(`${SPECIES[progression.evolvedFrom]?.name} becomes ${SPECIES[progression.evolvedInto]?.name}!`);
		}
		if (progression.levelsGained > 0) sfxPlay.level();
	}
	private tryCatch(stone: string): void {
		const b = this.battle!;
		if (b.kind !== "wild") {
			b.log = ["You cannot bind a Warden's pact."];
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
				this.battle.log = [`${sp.name} breaks the sigil.`];
				this.battle.phase = "command";
				sfxPlay.fail();
				this.afterPlayer();
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
		if (me.hp <= 0) this.playerDown();
	}
	private useItem(id: string, inBattle: boolean, requestedTarget?: number): boolean {
		const def = ITEMS[id];
		const plan = validateItemUse(def, this.party, this.battle?.playerIndex ?? 0, inBattle, requestedTarget);
		if (!plan.ok) return false;
		this.inventory[id] -= 1;
		if (plan.targetIndex < 0) {
			this.quietBell = def!.power ?? 80;
			this.toastMsg("The grass stills.");
			return true;
		}
		const target = this.party[plan.targetIndex]!;
		const st = currentStats(target);
		if (def!.kind === "heal") {
			healBeast(target, def!.power ?? 40);
			sfxPlay.heal();
		} else if (def!.kind === "ether") {
			target.mp = Math.min(st.mp, target.mp + (def!.power ?? 30));
			sfxPlay.heal();
		} else if (def!.kind === "status") {
			target.status = null;
		} else if (def!.kind === "revive") {
			target.hp = Math.floor(st.hp * ((def!.power ?? 50) / 100));
		}
		if (this.battle) this.battle.log = [`${def!.name} on ${target.nickname}.`];
		return true;
	}
	private endBattle(victory: boolean): void {
		this.battle = null;
		this.mode = this.flags.trial && victory && !this.flags.ending ? this.maybeVictory() : "world";
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
			});
			return "world";
		}
		return "world";
	}
	private whiteOut(): void {
		this.party.forEach(healFull);
		this.gold = Math.max(0, Math.floor(this.gold * .85));
		this.battle = null;
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
	menuConfirm(): void {
		if (this.menu === "root") {
			const c = [
				"Party",
				"Reliquary",
				"Pack",
				"Save",
				"Close"
			][this.menuIndex];
			if (c === "Party") this.menu = "party";
			else if (c === "Reliquary") this.menu = "reliquary";
			else if (c === "Pack") this.menu = "items";
			else if (c === "Save") {
				const ok = this.persist();
				if (ok) {
					sfxPlay.save();
					this.toastMsg("The lantern is written.");
				} else {
					sfxPlay.fail();
					this.toastMsg("The lantern will not take the ink. Try again.");
				}
				this.menu = null;
			} else this.menu = null;
			this.menuIndex = 0;
			this.emit();
			return;
		}
		if (this.menu === "items") {
			const id = this.usableItems()[this.menuIndex];
			if (!id) return;
			const ok = this.useItem(id, false);
			if (!ok) this.toastMsg("That pact-beast cannot take it.");
			this.emit();
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
		const camY = Math.max(0, Math.min(this.py - (this.viewH / 2 - 0.5) * TILE, Math.max(0, mh * TILE - this.ch())));
		const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
		const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
		const x1 = Math.min(mw, x0 + this.viewW + 3);
		const y1 = Math.min(mh, y0 + this.viewH + 3);
		for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
			const g = m.ground[y]![x]!;
			const tileName = GROUND_TILE[g] ?? "grass";
			const img = this.images[`tile_${tileName}`];
			const dx = Math.floor(x * TILE - camX);
			const dy = Math.floor(y * TILE - camY);
			if (img) ctx.drawImage(img, dx, dy, TILE, TILE);
			else {
				ctx.fillStyle = tileName === "water" ? "#3d6e8a" : tileName === "wall" ? "#3a342e" : "#3d4a38";
				ctx.fillRect(dx, dy, TILE, TILE);
			}
			if (g === ",") {
				const tg = this.images.prop_tallgrass;
				if (tg) ctx.drawImage(tg, dx, dy, TILE, TILE);
				else {
					ctx.fillStyle = "rgba(40,70,40,0.35)";
					ctx.fillRect(dx, dy, TILE, TILE);
				}
			}
		}
		const list: { y: number; draw: () => void }[] = [];
		for (const o of m.objects) {
			if (this.flags.starter && o.id.startsWith("st_")) continue;
			list.push({
				y: (o.y + o.h) * TILE,
				draw: () => {
					const img = this.images[`prop_${o.sprite}`] || this.images[`sprite_${o.sprite}`] || this.images[`npc_${o.sprite}`];
					const dx = o.x * TILE - camX;
					const dy = o.y * TILE - camY;
					const dw = o.w * TILE;
					const dh = o.h * TILE;
					if (img) ctx.drawImage(img, dx, dy, dw, dh);
				}
			});
		}
		for (const n of m.npcs) list.push({
			y: (n.y + 1) * TILE,
			draw: () => {
				const img = this.images[`npc_${n.sprite}`];
				const dx = n.x * TILE - camX;
				const dw = TILE;
				const dh = TILE * 1.25;
				const dy = n.y * TILE + TILE - dh - camY;
				if (img) ctx.drawImage(img, dx, dy, dw, dh);
			}
		});
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
				if (img) ctx.drawImage(img, dx, dy, dw, dh);
				else {
					ctx.fillStyle = "#c4a574";
					ctx.fillRect(dx + 8, dy + 8, 16, 20);
				}
			}
		});
		list.sort((a, b) => a.y - b.y);
		for (const s of list) s.draw();
	}
	private drawBattle(ctx: CanvasRenderingContext2D): void {
		const b = this.battle!;
		if (!b) return;
		const bg = this.images[`bg_${b.bg}`] || this.images.bg_grass;
		if (bg) ctx.drawImage(bg, 0, 0, this.cw(), this.ch());
		else {
			ctx.fillStyle = "#2c3d32";
			ctx.fillRect(0, 0, this.cw(), this.ch());
		}
		const foe = b.foes[b.foeIndex]!;
		if (foe && foe.hp > 0) {
			const img = this.images[`sprite_${foe.speciesId}`];
			const shake = b.phase === "catch" ? Math.sin(b.shake * 8) * 6 : 0;
			if (img) ctx.drawImage(img, this.cw() / 2 - 56 + shake, 18, 120, 120);
		}
		const me = this.party[b.playerIndex]!;
		if (me) {
			const img = this.images[`sprite_${me.speciesId}`];
			if (img) {
				ctx.save();
				ctx.translate(this.cw() * 0.23, this.ch() - 70);
				ctx.scale(-.7, .7);
				ctx.drawImage(img, -60, -60, 120, 120);
				ctx.restore();
			}
		}
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
	const out: [string, string][] = [];
	for (const t of [
		"grass",
		"dirt",
		"water",
		"cobble",
		"wood",
		"cave",
		"marsh",
		"wall"
	]) out.push([`tile_${t}`, `/game/tiles/${t}.png`]);
	for (const d of [
		"down",
		"left",
		"right",
		"up"
	]) for (let i = 0; i < 4; i++) out.push([`player_${d}${i}`, `/game/sprites/player/${d}${i}.png?v=4`]);
	for (const id of Object.keys(SPECIES)) out.push([`sprite_${id}`, `/game/sprites/${id}.png`]);
	for (const n of [
		"elder",
		"innkeep",
		"shopkeep",
		"warden",
		"guard",
		"traveler"
	]) out.push([`npc_${n}`, `/game/sprites/npc/${n}.png`]);
	for (const p of [
		"tree",
		"cottage",
		"inn",
		"shop",
		"shrine",
		"sign",
		"barrel",
		"crate",
		"shrub",
		"boulder",
		"fence",
		"tallgrass",
		"pot",
		"well",
		"bed",
		"table",
		"chair",
		"bookshelf",
		"hearth",
		"counter"
	]) out.push([`prop_${p}`, `/game/props/${p}.png`]);
	for (const bg of [
		"grass",
		"forest",
		"cave",
		"marsh",
		"keep"
	]) out.push([`bg_${bg}`, `/game/bg/bg_${bg}.jpg`]);
	out.push(["bg_title", "/game/bg/title.jpg"]);
	out.push(["ui_panel", "/game/ui/panel.png"]);
	return out;
}

export type { Snapshot } from "./types";
