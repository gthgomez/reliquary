import type { MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  currentStats,
  expToNext,
  ELEMENTS,
  ITEMS,
  MAX_LEVEL,
  PRACTICE_COST,
  PRACTICE_LORE,
  SKILLS,
  SPECIES,
  TEMPERAMENTS,
} from "../content";
import { battleCommands } from "../world/encounters.ts";
import type { ReliquaryGame } from "../engine";
import { ROOT_MENU } from "../engine";
import type { Beast, Snapshot } from "../types";
import { OverlayPanel } from "./OverlayPanel";
import { DialogScene } from "./DialogScene";
import {
  leadActionHint,
  practiceActionHint,
  practiceEnabledHint,
} from "./party-actions.ts";
import { battlePanelHeading, isBattleSubmenuPhase } from "./battle-chrome.ts";
import { shopBuyAffordability, skillMpAffordability, skillMpHint } from "./ui-chrome.ts";
import { STATUS_ADJECTIVES } from "../systems/status.ts";
import { objectiveHint } from "../systems/objective.ts";
import { clearTouchHolds, requestAccessibleStep, updateTouchHold, type HoldId } from "./touch-hold.ts";

export function TitleScreen({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const newGameRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirmingReplace) newGameRef.current?.focus({ preventScroll: true });
  }, [confirmingReplace]);
  return (
    <div className="title-screen">
      <img src="/game/bg/title.jpg" alt="" className="title-bg" />
      <div className="title-veil" />
      <div className="title-copy">
        <div className="title-plaque">
          <p className="title-kicker">A beastbinding chronicle</p>
          <h1 className="title-word">Reliquary</h1>
          <p className="title-tag">Bind the wild. Keep the old roads.</p>
          {snap.hasSave && confirmingReplace ? (
            <div
              className="title-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="new-game-confirm-title"
              aria-describedby="new-game-confirm-detail"
              onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "Backspace") {
                  event.stopPropagation();
                  setConfirmingReplace(false);
                }
              }}
            >
              <p className="title-tag" id="new-game-confirm-title">
                Replace the saved journey?
              </p>
              <p className="title-hint" id="new-game-confirm-detail">
                A new game takes the one save slot. The old lantern is kept until the new journey
                first writes over it — after that it is gone.
              </p>
              <div className="title-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  autoFocus
                  onClick={() => setConfirmingReplace(false)}
                >
                  Keep current save
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setConfirmingReplace(false);
                    game.startNew();
                  }}
                >
                  Begin new game
                </button>
              </div>
            </div>
          ) : (
            <div className="title-actions">
              {snap.hasSave ? (
                <button
                  type="button"
                  className="btn-primary"
                  ref={newGameRef}
                  onClick={() => setConfirmingReplace(true)}
                >
                  New Game
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => game.startNew()}>
                  Start
                </button>
              )}
              {snap.hasSave ? (
                <button type="button" className="btn-ghost" onClick={() => game.continueGame()}>
                  Continue
                </button>
              ) : null}
            </div>
          )}
          <p className="title-hint">
            Arrows or WASD to walk · Z / Enter to speak · X / Esc back · M menu
          </p>
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="title-screen boot">
      <div className="title-copy">
        <p className="title-kicker">Hollowmere</p>
        <h1 className="title-word">Reliquary</h1>
        <div className="load-bar" aria-label="Loading">
          <div className="load-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="title-hint">Lighting the lantern…</p>
      </div>
    </div>
  );
}

export function VictoryScreen({ game }: { game: ReliquaryGame }) {
  return (
    <div className="title-screen">
      <img src="/game/bg/bg_keep.jpg" alt="" className="title-bg" />
      <div className="title-veil" />
      <div className="title-copy">
        <div className="title-plaque">
          <p className="title-kicker">The Thorn Mark is yours</p>
          <h1 className="title-word">Reliquary</h1>
          <p className="title-tag">
            Warden Cael has tested the compact and found it held. The Hollow Crown still waits west
            of the ash — a later road.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => game.dismissVictory()}
          >
            Walk on
          </button>
        </div>
      </div>
    </div>
  );
}

export function Hud({
  snap,
  onMenu,
  menuButtonRef,
  dormant = false,
}: {
  snap: Snapshot;
  onMenu: () => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  dormant?: boolean;
}) {
  const lead = snap.party[0];
  const st = lead ? currentStats(lead) : null;
  const companionCritical = lead && st ? lead.hp > 0 && lead.hp * 4 <= st.hp : false;
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  const objectiveButtonRef = useRef<HTMLButtonElement>(null);
  const hint = objectiveHint(snap.flags, snap.mapName);
  useEffect(() => {
    if (dormant) setObjectiveOpen(false);
  }, [dormant]);
  return (
    <div
      className={`hud${dormant ? " hud-dormant" : ""}${objectiveOpen ? " hud-objective-expanded" : ""}`}
      aria-hidden={dormant}
      inert={dormant}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !objectiveOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setObjectiveOpen(false);
        objectiveButtonRef.current?.focus();
      }}
    >
      <div className="hud-row">
        <div className="hud-chip hud-chip-grow">
          <div className="hud-location">
            <span className="hud-sigil" aria-hidden="true">
              <svg viewBox="0 0 32 38" focusable="false">
                <path d="M2 1h28v27l-14 8L2 28z" fill="currentColor" />
                <path d="M16 27V12m0 9-7-5m7 2 7-6M9 16l-2-4m16 0 2-4M16 12l-3-5m3 5 4-6M10 28h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="7" cy="11" r="1.6" /><circle cx="13" cy="6" r="1.6" /><circle cx="20" cy="5" r="1.6" /><circle cx="25" cy="7" r="1.6" />
              </svg>
            </span>
            <div className="hud-location-copy">
              <span className="hud-place">{snap.mapName}</span>
              <span className="hud-muted hud-region">{snap.region}</span>
            </div>
          </div>
          {snap.objective ? (
            <div className="hud-objective-slot">
              <button
                type="button"
                className="hud-objective-btn"
                ref={objectiveButtonRef}
                aria-expanded={objectiveOpen}
                onClick={() => setObjectiveOpen((open) => !open)}
              >
                <span className="hud-objective-label">Objective</span>
                <span className="hud-objective-preview">{snap.objective}</span>
                <span className="hud-objective-chevron">{objectiveOpen ? "▾" : "▸"}</span>
              </button>
              {objectiveOpen ? (
                <div className="hud-objective-popover" role="region" aria-label="Current objective">
                  <p className="hud-objective-full">{snap.objective}</p>
                  {hint ? <p className="hud-objective-full">{hint}</p> : null}
                  <button type="button" className="hud-objective-lantern" onClick={onMenu}>
                    Open in Lantern menu
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="hud-chip hud-chip-stats">
          <span className="hud-gold"><span className="hud-coin" aria-hidden="true">◉</span> {snap.gold} cr</span>
          {lead && st ? (
            <span
              className={`hud-muted hud-companion${companionCritical ? " hud-companion-critical" : ""}`}
              aria-label={`Lead companion ${lead.nickname}, health ${lead.hp} of ${st.hp}${companionCritical ? ", critically wounded" : ""}`}
            >
              <span className="hud-companion-name">{lead.nickname}</span>
              <span className="hud-companion-hp">{lead.hp}/{st.hp}</span>
              {companionCritical ? <span className="hud-companion-alert" aria-hidden="true">!</span> : null}
            </span>
          ) : (
            <span className="hud-muted hud-companion">No pact yet</span>
          )}
        </div>
        <button type="button" className="hud-menu" ref={menuButtonRef} onClick={onMenu}>
          <span className="hud-menu-icon" aria-hidden="true">☰</span><span>Menu</span>
        </button>
      </div>
    </div>
  );
}

export function DialogBox({ snap, onAdvance }: { snap: Snapshot; onAdvance: () => void }) {
  if (!snap.dialog) return null;
  return <DialogScene dialog={snap.dialog} onAdvance={onAdvance} />;
}

export function MenuPanel({ game, snap, onImportActivate }: { game: ReliquaryGame; snap: Snapshot; onImportActivate?: () => void }) {
  if (!snap.menu) return null;
  const actionLabels: Record<string, (nickname: string) => string> = {
    lead: (n) => `Make ${n} lead`,
    practice: () => `Practice · ${PRACTICE_COST} cr`,
    learn: () => "Learn a new skill",
    rename: () => "Rename",
    store: (n) => `Store ${n}`,
    in: (n) => `Add ${n} to the party`,
  };
  if ((snap.menu === "party" || snap.menu === "storage") && snap.cardMenu) {
    const beast = [...snap.party, ...snap.box].find((b) => b.uid === snap.cardMenu!.uid);
    return (
      <OverlayPanel title={snap.cardMenu.nickname} onClose={() => game.cancel()}>
        <p className="sheet-sub">Choose an action.</p>
        <ul className="menu-list">
          {snap.cardMenu.actions.map((action, i) => (
            <li key={action}>
              <button
                type="button"
                className={i === snap.menuIndex ? "active" : ""}
                onClick={() => game.chooseMenu(i)}
              >
                {actionLabels[action]?.(beast?.nickname ?? "") ?? action}
              </button>
            </li>
          ))}
        </ul>
      </OverlayPanel>
    );
  }
  if (snap.menu === "root") {
    return (
      <OverlayPanel
        title="Lantern"
        subtitle={snap.objective ? `Objective — ${snap.objective}` : undefined}
        closeLabel="Close"
        onClose={() => game.chooseMenu(ROOT_MENU.length - 1)}
        onCloseFocus={() => { game.setMenuIndex(ROOT_MENU.length - 1); game.emitPublic(); }}
      >
        <ul className="menu-list">
          {ROOT_MENU.slice(0, -1).map((it, i) => (
            <li key={it}>
              <button
                type="button"
                className={i === snap.menuIndex ? "active" : ""}
                onFocus={() => { game.setMenuIndex(i); game.emitPublic(); }}
                onClick={() => {
                  // Open the picker inside this gesture (Safari-safe); the
                  // engine ticket effect stays as the fallback path.
                  if (it === "Import") onImportActivate?.();
                  game.chooseMenu(i);
                }}
              >
                {it === "Sound" ? (snap.soundOff ? "Sound: off" : "Sound: on") : it}
              </button>
            </li>
          ))}
        </ul>
      </OverlayPanel>
    );
  }
  if (snap.learnMenu) {
    const beast = snap.party.find((b) => b.uid === snap.learnMenu!.uid);
    const skill = SKILLS[snap.learnMenu.skill];
    return (
      <OverlayPanel
        title={skill?.name ?? snap.learnMenu.skill}
        subtitle={`${beast?.nickname ?? "Your companion"} could learn ${
          skill ? `${skill.name} — ${skill.desc}` : snap.learnMenu.skill
        }. Replacing a skill retires it for good.`}
        onClose={() => game.cancel()}
      >
        <ul className="menu-list">
          {beast?.skills.map((existingId, i) => (
            <li key={existingId}>
              <button
                type="button"
                className={i === snap.menuIndex ? "active" : ""}
                onClick={() => game.chooseMenu(i)}
              >
                Replace {SKILLS[existingId]?.name ?? existingId}
              </button>
            </li>
          ))}
          <li key="decline">
            <button
              type="button"
              className={(beast?.skills.length ?? 0) === snap.menuIndex ? "active" : ""}
              onClick={() => game.chooseMenu(beast?.skills.length ?? 0)}
            >
              Decline — keep what it knows
            </button>
          </li>
        </ul>
      </OverlayPanel>
    );
  }
  if (snap.menu === "learn") {
    return (
      <OverlayPanel title="No offer to consider" onClose={() => game.cancel()}>
        <p className="sheet-sub">Return to your party when a skill beckons.</p>
      </OverlayPanel>
    );
  }
  if (snap.menu === "party") {
    return (
      <OverlayPanel
        wide
        title="Party"
        subtitle={`Lead walks first in battle. Practice costs ${PRACTICE_COST} cr and grants ${PRACTICE_LORE} lore (XP).`}
        onClose={() => game.cancel()}
      >
        <div className="party-grid">
          {snap.party.map((b, index) => (
            <BeastCard key={b.uid} beast={b} selected={index === snap.menuIndex}>
              {b.pendingSkills?.length ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => game.openLearnMenu(b.uid)}
                  aria-label={`Teach ${b.nickname} ${SKILLS[b.pendingSkills[0]!]?.name ?? b.pendingSkills[0]}`}
                >
                  Learn {SKILLS[b.pendingSkills[0]!]?.name ?? b.pendingSkills[0]}
                  {b.pendingSkills.length > 1 ? ` (${b.pendingSkills.length})` : ""}
                </button>
              ) : null}
              <div className="action-with-hint">
                <button
                  type="button"
                  className={index === 0 ? "btn-lead-active" : "btn-ghost"}
                  disabled={index !== 0 && b.hp <= 0}
                  aria-pressed={index === 0}
                  onClick={() => {
                    if (index !== 0 && b.hp > 0) game.setLead(b.uid);
                  }}
                  aria-label={`Make ${b.nickname} lead`}
                  aria-describedby={`lead-hint-${b.uid}`}
                >
                  {index === 0 ? "Party lead" : "Make lead"}
                </button>
                <p id={`lead-hint-${b.uid}`} className="action-hint" role="note">
                  {leadActionHint(index, b) ?? "Send this companion to the front of the party and into battle first."}
                </p>
              </div>
              <RenameCreature game={game} beast={b} />
              <div className="action-with-hint">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={b.hp <= 0 || b.level >= MAX_LEVEL || snap.gold < PRACTICE_COST}
                  onClick={() => game.trainCreature(b.uid)}
                  aria-label={`Practice with ${b.nickname} for ${PRACTICE_COST} crowns`}
                  aria-describedby={`practice-hint-${b.uid}`}
                >
                  Practice · {PRACTICE_COST} cr
                </button>
                <p id={`practice-hint-${b.uid}`} className="action-hint" role="note">
                  {practiceActionHint(b, snap.gold) ?? practiceEnabledHint()}
                </p>
              </div>
            </BeastCard>
          ))}
          {snap.party.length === 0 ? <p className="empty">No pact spoken yet.</p> : null}
        </div>
      </OverlayPanel>
    );
  }
  if (snap.menu === "storage") {
    return (
      <OverlayPanel
        wide
        title="Creature storage"
        subtitle={`Party ${snap.party.length}/4 · Stored ${snap.box.length}`}
        onClose={() => game.cancel()}
      >
        <h3 className="sheet-section">Travelling companions</h3>
        <div className="party-grid">
          {snap.party.map((b, index) => (
            <BeastCard key={b.uid} beast={b} selected={index === snap.menuIndex}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => game.transferBeast(b.uid, "box")}
                aria-label={`Store ${b.nickname}`}
              >
                Store
              </button>
            </BeastCard>
          ))}
        </div>
        <h3 className="sheet-section">Stored creatures</h3>
        <div className="party-grid">
          {snap.box.map((b, boxIndex) => (
            <BeastCard key={b.uid} beast={b} selected={snap.party.length + boxIndex === snap.menuIndex}>
              <div className="action-with-hint">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={snap.party.length >= 4}
                  onClick={() => game.transferBeast(b.uid, "party")}
                  aria-label={`Add ${b.nickname} to party`}
                  aria-describedby={`store-in-hint-${b.uid}`}
                >
                  Add to party
                </button>
                {snap.party.length >= 4 ? (
                  <p id={`store-in-hint-${b.uid}`} className="action-hint" role="note">
                    Party is full (4/4). Store a traveller first.
                  </p>
                ) : null}
              </div>
            </BeastCard>
          ))}
          {snap.box.length === 0 ? <p className="empty">No creatures in storage yet.</p> : null}
        </div>
      </OverlayPanel>
    );
  }
  if (snap.menu === "reliquary") {
    const ids = Object.keys(SPECIES);
    return (
      <OverlayPanel
        wide
        title="Reliquary"
        subtitle={`Bound ${Object.keys(snap.caught).length} · Seen ${Object.keys(snap.seen).length} of ${ids.length} · ? unheard · —— spotted only`}
        onClose={() => game.cancel()}
      >
        <div className="reliq-grid" role="list">
          {ids.map((id) => {
            const sp = SPECIES[id]!;
            const caught = Boolean(snap.caught[id]);
            const seen = Boolean(snap.seen[id]);
            const known = seen || caught;
            const stateLabel = caught
              ? `${sp.name} — bound to your compact`
              : seen
                ? `${sp.name} — seen in the wild, not yet bound`
                : "Unheard of — bind one to learn its name";
            return (
              <div key={id} role="listitem" aria-label={stateLabel} className={`reliq-cell ${caught ? "have" : ""}${seen && !caught ? " seen" : ""}`} title={stateLabel}>
                {known ? (
                  <img src={`/game/sprites/${id}.png`} alt="" />
                ) : (
                  <span className="unknown" aria-hidden="true">
                    ?
                  </span>
                )}
                <span>{caught || seen ? sp.name : "——"}</span>
              </div>
            );
          })}
        </div>
      </OverlayPanel>
    );
  }
  if (snap.packTarget) {
    return (
      <OverlayPanel
        title={`Use ${ITEMS[snap.packTarget.item]?.name ?? snap.packTarget.item}`}
        subtitle="Choose a companion. Nothing is spent until you pick one."
        onClose={() => game.cancel()}
        closeLabel="Back to the pack"
      >
        <ul className="menu-list target-list">
          {snap.packTarget.targets.map((target, i) => (
            <li key={target.uid}>
              <button
                type="button"
                className={i === snap.menuIndex ? "active" : ""}
                onClick={() => game.chooseMenu(i)}
              >
                {target.nickname} <em>{target.hp}</em>
                <span className="muted"> — {target.note}</span>
              </button>
            </li>
          ))}
          {snap.packTarget.targets.length === 0 ? (
            <li className="empty">Nobody here would benefit.</li>
          ) : null}
        </ul>
      </OverlayPanel>
    );
  }
  if (snap.menu === "items") {
    const ids = game.usableItems();
    const stones = Object.keys(snap.inventory).filter(
      (id) => (snap.inventory[id] ?? 0) > 0 && ITEMS[id]?.kind === "sigil",
    );
    return (
      <OverlayPanel title="Pack" onClose={() => game.cancel()}>
        <ul className="menu-list">
          {ids.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className={i === snap.menuIndex ? "active" : ""}
                onClick={() => game.chooseMenu(i)}
              >
                {ITEMS[id]?.name ?? id}
                <em>×{snap.inventory[id]}</em>
              </button>
            </li>
          ))}
          {ids.length === 0 ? <li className="empty">No usable items.</li> : null}
        </ul>
        {stones.length > 0 ? (
          <p className="sheet-sub">
            Binding stones:{" "}
            {stones.map((id) => `${ITEMS[id]?.name} ×${snap.inventory[id]}`).join(" · ")}
          </p>
        ) : null}
      </OverlayPanel>
    );
  }
  return null;
}

function RenameCreature({ game, beast }: { game: ReliquaryGame; beast: Beast }) {
  const [name, setName] = useState(beast.nickname);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (game.takeRenameSelection(beast.uid)) {
      setName(beast.nickname);
      setEditing(true);
    }
  }, [game.selectedUid, beast.uid, beast.nickname, game]);
  if (!editing)
    return (
      <button
        type="button"
        className="btn-ghost"
        onClick={() => {
          setName(beast.nickname);
          setEditing(true);
        }}
        aria-label={`Rename ${beast.nickname}`}
      >
        Rename
      </button>
    );
  return (
    <form
      className="rename-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          game.renamePartyCreature(beast.uid, name);
          setEditing(false);
        }
      }}
    >
      <label>
        Creature name{" "}
        <input
          value={name}
          maxLength={40}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button type="submit" className="btn-ghost" disabled={!name.trim()}>
        Save name
      </button>
      <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

function BeastCard({ beast, children, selected }: { beast: Beast; children?: ReactNode; selected?: boolean }) {
  const sp = SPECIES[beast.speciesId]!;
  const st = currentStats(beast);
  const t = TEMPERAMENTS[beast.temperament];
  return (
    <article className={`beast-card${selected ? " beast-card-active" : ""}`}>
      <img src={`/game/sprites/${beast.speciesId}.png`} alt="" />
      <div>
        <h3>
          {beast.nickname} <small>Lv {beast.level}</small>
        </h3>
        <p className="els">
          {sp.elements.map((e) => (
            <span key={e} className={`el el-${e}`}>
              {ELEMENTS[e].name}
            </span>
          ))}
        </p>
        <Meter label="HP" value={beast.hp} max={st.hp} kind="hp" />
        <Meter label="MP" value={beast.mp} max={st.mp} kind="mp" />
        {beast.level < MAX_LEVEL ? (
          <Meter
            label="Lore"
            value={beast.exp}
            max={expToNext(beast.level)}
            kind="mp"
            longLabel="Lore (experience to next level)"
          />
        ) : (
          <p className="skills">Level cap reached</p>
        )}
        <p className="skills">
          {sp.evolves
            ? `Evolution: ${SPECIES[sp.evolves.into]?.name} at Lv ${sp.evolves.level}`
            : "Mature form"}
        </p>
        <p className="muted">
          {t.name} · {sp.epithet}
        </p>
        <p className="skills">{beast.skills.map((s) => SKILLS[s]?.name ?? s).join(" · ")}</p>
        {children ? <div className="beast-actions">{children}</div> : null}
      </div>
    </article>
  );
}

export function Meter({
  label,
  value,
  max,
  kind,
  longLabel,
}: {
  label: string;
  value: number;
  max: number;
  kind: "hp" | "mp";
  /** Accessible/visible full label; defaults from the visual kind (S31: never
   * infer a resource's meaning from styling alone). */
  longLabel?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const resolvedLabel = longLabel ?? (kind === "hp" ? "Health" : "Skill points");
  return (
    <div className="meter" role="group" aria-label={`${resolvedLabel} ${value} of ${max}`}>
      <div className="meter-head">
        <span className="meter-kicker">{resolvedLabel}</span>
        <span className="meter-frac">
          <abbr title={resolvedLabel} className="meter-abbr">
            {label}
          </abbr>{" "}
          {value}/{max}
        </span>
      </div>
      <div className="meter-track" aria-hidden>
        <div className={`meter-fill ${kind}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BattleHud({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  const b = snap.battle;
  if (!b) return null;
  const me = snap.party[b.playerIndex];
  const foe = b.foes[b.foeIndex];
  const meS = me ? currentStats(me) : null;
  const foS = foe ? currentStats(foe) : null;
  const cmds = battleCommands(b);
  const panelHeading = battlePanelHeading(b.phase);
  const showBack = isBattleSubmenuPhase(b.phase);
  const showRecap = (b.phase === "command" || b.phase === "win" || b.phase === "lose") && b.recap.length > 0;

  const renderCmdList = (items: ReactNode, className = "cmd") => (
    <ul className={className}>{items}</ul>
  );

  let scrollBody: ReactNode = null;
  if (b.phase === "skills" && me) {
    scrollBody = renderCmdList(
      me.skills.map((sid, i) => {
        const sk = SKILLS[sid];
        const cost = sk?.mp ?? 0;
        const afford = skillMpAffordability(me.mp, cost);
        const hint = skillMpHint(me.mp, cost);
        return (
          <li key={sid}>
            <button
              type="button"
              className={`${i === b.menuIndex ? "active" : ""} skill-${afford}`}
              aria-describedby={afford === "unaffordable" ? `skill-mp-${sid}` : undefined}
              onClick={() => {
                if (afford === "unaffordable") {
                  game.previewBattle(i);
                  return;
                }
                game.chooseBattle(i);
              }}
            >
              <span className="cmd-skill-main">
                <span className="cmd-skill-name">{sk?.name}</span>
                <em id={afford === "unaffordable" ? `skill-mp-${sid}` : undefined}>{hint}</em>
              </span>
            </button>
          </li>
        );
      }),
      "cmd cmd-scroll cmd-skills",
    );
  } else if (b.phase === "items") {
    scrollBody = renderCmdList(
      game.usableItems().map((id, i) => (
        <li key={id}>
          <button
            type="button"
            className={i === b.menuIndex ? "active" : ""}
            onClick={() => game.chooseBattle(i)}
          >
            {ITEMS[id]?.name} <em>×{snap.inventory[id]}</em>
          </button>
        </li>
      )),
      "cmd cmd-scroll",
    );
  } else if (b.phase === "bind") {
    scrollBody = renderCmdList(
      ["common_sigil", "thorn_sigil", "relic_sigil"]
        .filter((s) => (snap.inventory[s] ?? 0) > 0)
        .map((id, i) => (
          <li key={id}>
            <button
              type="button"
              className={i === b.menuIndex ? "active" : ""}
              onClick={() => game.chooseBattle(i)}
            >
              {ITEMS[id]?.name} <em>×{snap.inventory[id]}</em>
            </button>
          </li>
        )),
      "cmd cmd-scroll",
    );
  } else if (b.phase === "party") {
    scrollBody = renderCmdList(
      snap.party.map((p, i) => {
        const pst = currentStats(p);
        return (
          <li key={p.uid}>
            <button
              type="button"
              className={`cmd-party-row${i === b.menuIndex ? " active" : ""}`}
              disabled={p.hp <= 0}
              onClick={() => game.chooseBattle(i)}
            >
              <span className="cmd-party-name">{p.nickname}</span>
              <span className="cmd-party-meta">
                <em>
                  {p.hp}/{pst.hp} hp
                </em>
              </span>
            </button>
          </li>
        );
      }),
      "cmd cmd-scroll cmd-party",
    );
  }

  return (
    <div className="battle-ui">
      <div className="battle-status-zone">
        {foe && foS ? (
          <div className="battler foe">
            <strong>{SPECIES[foe.speciesId]?.name}</strong>
            <span>Lv {foe.level}</span>
            {foe.status ? (
              <span className="battler-status">{STATUS_ADJECTIVES[foe.status]}</span>
            ) : null}
            <Meter label="HP" value={foe.hp} max={foS.hp} kind="hp" />
          </div>
        ) : null}
      </div>
      <div className="battle-controls" data-battle-phase={b.phase}>
        {me && meS ? (
          <div className="battler me">
            <strong>{me.nickname}</strong>
            <span>Lv {me.level}</span>
            {me.status ? (
              <span className="battler-status">{STATUS_ADJECTIVES[me.status]}</span>
            ) : null}
            <div className="meter-row">
              <Meter label="HP" value={me.hp} max={meS.hp} kind="hp" />
              <Meter label="MP" value={me.mp} max={meS.mp} kind="mp" />
            </div>
          </div>
        ) : null}
        <div className="battle-log" aria-live="polite">
          <span className="battle-log-text">{b.log[b.log.length - 1]}</span>
        </div>
        <div className={`battle-controls-body${scrollBody || showRecap ? "" : " is-empty"}`}>
          {panelHeading ? <p className="battle-panel-title">{panelHeading}</p> : null}
          {/* Bounded turn/win recap (S06): the one-line log replaces each
              event, so the ordered recap keeps the turn inspectable. Rendered
              only where it cannot push commands out of reach. */}
          {showRecap ? (
            <div className="battle-recap-wrap">
              {b.phase !== "command" ? <p className="battle-panel-title">How it ended</p> : null}
              <ol
                className="battle-recap"
                aria-label={b.phase === "command" ? "This turn so far" : "How the battle ended"}
              >
                {b.recap.map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {scrollBody}
        </div>
        <div className="battle-controls-actions">
          {showBack && b.phase !== "win" && b.phase !== "lose" ? (
            <button type="button" className="btn-ghost battle-back" onClick={() => game.cancel()}>
              Back
            </button>
          ) : null}
          {b.phase === "command"
            ? renderCmdList(
                cmds.map((c, i) => (
                  <li key={c}>
                    <button
                      type="button"
                      className={i === b.menuIndex ? "active" : ""}
                      onClick={() => game.chooseBattle(i)}
                    >
                      {c}
                    </button>
                  </li>
                )),
              )
            : null}
          {b.phase === "win" || b.phase === "lose" ? (
            <button type="button" className="btn-primary battle-continue" onClick={() => game.confirm()}>
              {b.phase === "win" ? "Continue" : "Wake"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ShopPanel({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  const list =
    snap.shopMode === "buy"
      ? snap.shopStock
      : Object.keys(snap.inventory).filter((id) => (snap.inventory[id] ?? 0) > 0 && ITEMS[id]);
  const selectedId = list[snap.shopIndex];
  const selected = selectedId ? ITEMS[selectedId] : null;
  const canAffordBuy = selected && snap.shopMode === "buy" ? snap.gold >= selected.price : true;

  return (
    <OverlayPanel
      title="Chandler"
      subtitle={`${snap.gold} crowns in purse`}
      onClose={() => game.cancel()}
      closeLabel="Leave"
    >
      <div className="shop-tabs">
        <button
          type="button"
          className={snap.shopMode === "buy" ? "active" : ""}
          onClick={() => game.setShopTab("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          className={snap.shopMode === "sell" ? "active" : ""}
          onClick={() => game.setShopTab("sell")}
        >
          Sell
        </button>
      </div>
      <ul className="menu-list shop-list">
        {list.map((id, i) => {
          const it = ITEMS[id]!;
          const price = snap.shopMode === "buy" ? it.price : Math.floor(it.price / 2);
          const owned = snap.inventory[id] ?? 0;
          const unaffordable = snap.shopMode === "buy" && shopBuyAffordability(snap.gold, it.price) === "unaffordable";
          const affordable = snap.shopMode === "buy" && !unaffordable;
          return (
            <li key={id}>
              <button
                type="button"
                className={`shop-row${i === snap.shopIndex ? " active" : ""}${unaffordable ? " unaffordable" : ""}${affordable ? " affordable" : ""}`}
                aria-pressed={i === snap.shopIndex}
                onClick={() => game.previewShopRow(i)}
              >
                <span className="shop-row-main">
                  <span className="shop-row-name">{it.name}</span>
                  <span className="shop-row-desc">{it.desc}</span>
                </span>
                <span className="shop-row-price">
                  <em>
                    {price} cr
                    {snap.shopMode === "buy" ? ` · own ×${owned}` : ` · sell ×${owned}`}
                  </em>
                  {unaffordable ? <span className="shop-row-note">Need {it.price} cr</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selected && snap.shopMode === "buy" ? (
        <button
          type="button"
          className="btn-primary shop-buy-btn"
          disabled={!canAffordBuy}
          onClick={() => game.shopConfirm()}
        >
          {canAffordBuy
            ? `Buy for ${selected.price} cr`
            : `Need ${selected.price} cr (${snap.gold} in purse)`}
        </button>
      ) : null}
      {selected && snap.shopMode === "sell" ? (
        <button
          type="button"
          className="btn-primary shop-buy-btn"
          onClick={() => game.shopConfirm()}
        >
          {`Sell for ${Math.floor(selected.price / 2)} cr`}
        </button>
      ) : null}
      {selected ? (
        <p className="sheet-sub shop-detail" aria-live="polite">
          {selected.desc}
          {snap.shopMode === "buy" && !canAffordBuy
            ? ` — ${selected.price} cr required (short ${selected.price - snap.gold}).`
            : null}
        </p>
      ) : null}
    </OverlayPanel>
  );
}

export function TouchPad({ game, variant = "full", dialogActive = variant === "dialog" }: {
  game: ReliquaryGame;
  variant?: "full" | "dialog";
  dialogActive?: boolean;
}) {
  const heldRef = useRef<Map<string, Set<HoldId>>>(new Map());
  const accessibleStops = useRef(new Set<() => void>());
  const accessibleSequence = useRef(0);
  const hold = (code: string, pointerId: HoldId, on: boolean) => {
    const transition = updateTouchHold(heldRef.current, code, pointerId, on);
    if (transition !== null) game.holdKey(code, transition);
  };
  // S25: a held key must not outlive the control that owns it. The pad STAYS
  // MOUNTED across the world↔dialog transition (only its variant changes), so
  // release on dialogue/variant change and final unmount — classic mode keeps
  // its full pad mounted during dialogue, but a prior movement hold must end.
  useEffect(() => {
    const held = heldRef.current;
    const stops = accessibleStops.current;
    return () => {
      for (const stop of stops) stop();
      stops.clear();
      for (const code of clearTouchHolds(held)) game.holdKey(code, false);
    };
  }, [game, variant, dialogActive]);
  const dir = (code: string) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
      hold(code, e.pointerId, true);
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => hold(code, e.pointerId, false),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => hold(code, e.pointerId, false),
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => hold(code, e.pointerId, false),
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      // Pointer presses already drive a hold. Keyboard and screen-reader
      // activation generate a detail=0 click; request one discrete step.
      if (e.detail !== 0) return;
      const id = `accessible-${++accessibleSequence.current}`;
      const stopRef: { current?: () => void } = {};
      let done = false;
      const stop = requestAccessibleStep(
        () => ({
          canMove: game.mode === "world" && !game.dialog && !game.menu,
          moving: game.moving,
          map: game.mapId,
          x: game.tx,
          y: game.ty,
        }),
        (on) => hold(code, id, on),
        {
          frame: (fn) => requestAnimationFrame(fn),
          cancelFrame: (handle) => cancelAnimationFrame(handle),
          timeout: (fn, ms) => window.setTimeout(fn, ms),
          cancelTimeout: (handle) => window.clearTimeout(handle),
        },
        () => { done = true; if (stopRef.current) accessibleStops.current.delete(stopRef.current); },
      );
      stopRef.current = stop;
      if (!done) accessibleStops.current.add(stop);
    },
  });
  return (
    <div className={`touch touch-${variant}`} role="group" aria-label={dialogActive ? "Dialog controls" : "Movement controls"}>
      {variant === "full" ? (
        <div className="dpad">
          <button type="button" className="d up" aria-label="North" {...dir("KeyW")}>
            <span aria-hidden="true">▲</span>
          </button>
          <button type="button" className="d left" aria-label="West" {...dir("KeyA")}>
            <span aria-hidden="true">◀</span>
          </button>
          <button type="button" className="d right" aria-label="East" {...dir("KeyD")}>
            <span aria-hidden="true">▶</span>
          </button>
          <button type="button" className="d down" aria-label="South" {...dir("KeyS")}>
            <span aria-hidden="true">▼</span>
          </button>
        </div>
      ) : (
        <p className="touch-dialog-hint">A · Next · B · Back</p>
      )}
      <div className="ab">
        <button type="button" className="b-btn" aria-label={dialogActive ? "B — Back" : "B — Cancel"} onClick={() => game.cancel()}>
          B
        </button>
        <button type="button" className="a-btn" aria-label={dialogActive ? "A — Next" : "A — Interact"} onClick={() => game.confirm()}>
          A
        </button>
      </div>
    </div>
  );
}

export function Toast({ text, className }: { text: string; className?: string }) {
  return <div role="status" className={className ? `toast ${className}` : "toast"}>{text}</div>;
}
