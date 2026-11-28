import type { MouseEvent, PointerEvent, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  currentStats,
  ITEMS,
  PRACTICE_COST,
  PRACTICE_LORE,
  SKILLS,
  SPECIES,
} from "../content";
import type { ReliquaryGame } from "../engine";
import { ROOT_MENU, STARTER_PACT_REWARD } from "../engine";
import type { Beast, DialogView, NamePromptView, Snapshot } from "../types";
import { OverlayPanel } from "./OverlayPanel";
import { DialogScene } from "./DialogScene";
import { OfflineMenuStatus, TitleOfflineProgress } from "./AppStatus";
import { useOverlayFocusTrap } from "./useOverlayFocusTrap.ts";
import { shopBuyAffordability } from "./ui-chrome.ts";
import { objectiveHint, objectivePreview } from "../systems/objective.ts";
import { clearTouchHolds, requestAccessibleStep, updateTouchHold, type HoldId } from "./touch-hold.ts";
import { shouldShowTitleWorldRetry } from "./asset-recovery.ts";
import { isElderhallCandidateBuild } from "../build-flags.ts";
import { portraitSource } from "../portraits.ts";
import { BestiaryPanel } from "./components/BestiaryPanel.tsx";
import { CompanionDetailOverlay, PartyPanel, StoragePanel } from "./components/CompanionPanels.tsx";
import { FiligreeSurface, PortraitCrest } from "./components/ReliquaryPrimitives.tsx";

export function TitleScreen({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const titleScreenRef = useRef<HTMLDivElement>(null);
  const newGameRef = useRef<HTMLButtonElement>(null);
  const keepSaveRef = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const confirmationWasShown = useRef(false);
  useOverlayFocusTrap(confirmationRef, confirmingReplace);
  useEffect(() => {
    if (confirmingReplace) {
      confirmationWasShown.current = true;
      if (titleScreenRef.current) titleScreenRef.current.scrollTop = 0;
      keepSaveRef.current?.focus({ preventScroll: true });
    } else if (confirmationWasShown.current) {
      newGameRef.current?.focus();
    }
  }, [confirmingReplace]);
  return (
    <div
      className="title-screen title-opening"
      ref={titleScreenRef}
      onPointerDownCapture={(event) => {
        if (!confirmingReplace || confirmationRef.current?.contains(event.target as Node)) return;
        event.preventDefault();
        keepSaveRef.current?.focus({ preventScroll: true });
      }}
    >
      <img src="/game/bg/title.jpg" alt="" className="title-bg" />
      <div className="title-veil" aria-hidden="true" />
      <div className="title-copy">
        <h1 className="title-word">Reliquary</h1>
        <p className="title-tag">Bind the wild. Keep the old roads.</p>
        {!snap.worldAssetsReady ? (
          <div className="title-save-recovery">
            <p role="status" aria-live="polite">
              {snap.worldAssetFailures.length
                ? "Some world art could not be loaded. Your saved journey is unchanged."
                : snap.worldAssetsStalled
                  ? "World art is taking longer than expected. Your saved journey is unchanged."
                  : "Preparing the world. Your saved journey is unchanged."}
            </p>
            <div className="load-bar" role="progressbar" aria-label="World art loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(snap.loadProgress * 100)}>
              <div className="load-fill" style={{ width: `${Math.round(snap.loadProgress * 100)}%` }} />
            </div>
            {shouldShowTitleWorldRetry(snap) ? (
              <button type="button" className="btn-ghost" onClick={() => void game.retryWorldAssets()}>
                Retry world art
              </button>
            ) : null}
          </div>
        ) : null}
        {snap.worldAssetsReady && snap.assetFailures.length ? (
          <div className="title-save-recovery" role="status">
            <p>Some required game art could not be loaded. Your save is unchanged.</p>
            <button type="button" className="btn-ghost" onClick={() => void game.retryWorldAssets()}>
              Retry game art
            </button>
          </div>
        ) : null}
        {snap.hasSave && confirmingReplace ? (
          <div
            className="title-confirm"
            ref={confirmationRef}
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
            <h2 className="title-confirm-heading" id="new-game-confirm-title">
              Replace the saved journey?
            </h2>
            <p className="title-confirm-detail" id="new-game-confirm-detail">
              A new game uses the one save slot. Your current journey stays safe until the new game
              first saves; after that, it is replaced.
            </p>
            <div className="title-actions">
              <button
                type="button"
                className="btn-ghost"
                ref={keepSaveRef}
                onClick={() => setConfirmingReplace(false)}
              >
                Keep current save
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={(event) => {
                  // A rapid second activation can land on this button after the
                  // first one opened the question beneath the same pointer.
                  if (event.detail > 1) {
                    event.preventDefault();
                    keepSaveRef.current?.focus({ preventScroll: true });
                    return;
                  }
                  setConfirmingReplace(false);
                  game.startNew();
                }}
                disabled={!snap.worldAssetsReady}
              >
                Begin new game
              </button>
            </div>
          </div>
        ) : (
          <div className="title-actions">
            {snap.hasSave ? (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => game.continueGame()}
                  disabled={!snap.worldAssetsReady}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  ref={newGameRef}
                  onClick={() => setConfirmingReplace(true)}
                disabled={!snap.worldAssetsReady}
                >
                  New Game
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={() => game.startNew()}
                disabled={!snap.worldAssetsReady}
              >
                Start
              </button>
            )}
          </div>
        )}
        {!confirmingReplace ? <TitleOfflineProgress worldReady={snap.worldAssetsReady} /> : null}
        {(game.hasNewerSave || game.hasArchivedSave) && !confirmingReplace ? (
          <div className="title-save-recovery">
            {game.hasNewerSave ? <>
              <p>A journey here was saved by a newer version. Export it here and import the file in that version.</p>
              <button type="button" className="btn-ghost" onClick={() => setExportFailed(!game.exportRecoverySave())}>
                Export newer save
              </button>
            </> : null}
            {game.hasArchivedSave ? <>
              <p>A previous version archived a journey. Export it here, then use Import from the Lantern menu to resume it.</p>
              <button type="button" className="btn-ghost" onClick={() => setExportFailed(!game.exportRecoverySave(true))}>
                Export archived save
              </button>
            </> : null}
            {exportFailed ? <p role="status">Could not export the save. Try again in the browser that holds it.</p> : null}
          </div>
        ) : null}
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
  mapId,
  onMenu,
  onObjectiveMenu,
  onHudFocus,
  menuButtonRef,
  dormant = false,
}: {
  snap: Snapshot;
  mapId: string;
  onMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onObjectiveMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onHudFocus?: (button: HTMLButtonElement) => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  dormant?: boolean;
}) {
  const lead = snap.party[0];
  const st = lead ? currentStats(lead) : null;
  const companionCritical = lead && st ? lead.hp > 0 && lead.hp * 4 <= st.hp : false;
  const companionFainted = lead ? lead.hp <= 0 : false;
  const hpRatio = lead && st && st.hp > 0 ? Math.max(0, Math.min(1, lead.hp / st.hp)) : 0;
  const preview = objectivePreview(snap.flags, mapId);
  return (
    <div
      className={`hud${dormant ? " hud-dormant" : ""}`}
      aria-hidden={dormant}
      inert={dormant}
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
              <span className="hud-region-sep" aria-hidden="true">·</span>
              <span className="hud-muted hud-region">{snap.region}</span>
            </div>
          </div>
          {snap.objective ? (
            <div className="hud-objective-slot">
              <button
                type="button"
                className="hud-objective-btn"
                aria-haspopup="dialog"
                aria-label={`Objective: ${preview}. Open full directions in Lantern`}
                onFocus={(event) => onHudFocus?.(event.currentTarget)}
                onClick={onObjectiveMenu}
              >
                <span className="hud-objective-label">Objective</span>
                <span className="hud-objective-preview">{preview}</span>
                <svg className="hud-objective-chevron" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 12 12 4M5 4h7v7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : null}
          <div className="hud-stats">
            <span className="hud-gold"><span className="hud-coin" aria-hidden="true">◉</span> {snap.gold} cr</span>
            {lead && st ? (
              <span
                className={`hud-muted hud-companion${companionCritical ? " hud-companion-critical" : ""}${companionFainted ? " hud-companion-fainted" : ""}`}
                aria-label={`Lead companion ${lead.nickname}, health ${lead.hp} of ${st.hp}${companionFainted ? ", fainted" : companionCritical ? ", critically wounded" : ""}`}
              >
                <span className="hud-companion-name">{lead.nickname}</span>
                <span className="hud-companion-hp">{lead.hp}/{st.hp} HP</span>
                {companionCritical ? <span className="hud-companion-alert" aria-hidden="true">!</span> : null}
                <span className="hud-companion-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(hpRatio * 100)}%` }} />
                </span>
              </span>
            ) : (
              <span className="hud-muted hud-companion">No pact yet</span>
            )}
          </div>
        </div>
        <button type="button" className="hud-menu" ref={menuButtonRef} onFocus={(event) => onHudFocus?.(event.currentTarget)} onClick={onMenu} aria-label="Menu">
          <span className="hud-menu-icon" aria-hidden="true">☰</span><span className="hud-menu-label">Menu</span>
        </button>
      </div>
    </div>
  );
}

export function DialogBox({ dialog, game }: { dialog: DialogView; game: ReliquaryGame }) {
  return <DialogScene
    dialog={dialog}
    onAdvance={() => game.activateDialogueAction(dialog.revision, "confirm")}
    onBack={() => game.activateDialogueAction(dialog.revision, "cancel")}
  />;
}

export function NamePrompt({ game, prompt }: { game: ReliquaryGame; prompt: NamePromptView }) {
  const [name, setName] = useState(prompt.draft);
  const customName = name.trim() !== "" && name.trim() !== prompt.speciesName;
  const formRef = useRef<HTMLFormElement>(null);
  useOverlayFocusTrap(formRef, true);
  useLayoutEffect(() => {
    const form = formRef.current;
    const target = window.matchMedia("(pointer: coarse)").matches ? form : form?.querySelector("input");
    target?.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    const form = formRef.current;
    const stage = form?.parentElement;
    const viewport = window.visualViewport;
    if (!form || !stage || !viewport) return;

    // The keyboard can shrink or pan the visible viewport while the stage
    // and camera still occupy the layout viewport.
    const fitPrompt = () => {
      const frame = stage.getBoundingClientRect();
      const top = Math.max(0, viewport.offsetTop - frame.top);
      const bottom = Math.max(0, frame.bottom - (viewport.offsetTop + viewport.height));
      form.style.setProperty("--name-viewport-bottom", `${bottom}px`);
      form.style.setProperty("--name-viewport-insets", `${top + bottom}px`);
    };
    fitPrompt();
    viewport.addEventListener("resize", fitPrompt);
    viewport.addEventListener("scroll", fitPrompt);
    window.addEventListener("resize", fitPrompt);
    return () => {
      viewport.removeEventListener("resize", fitPrompt);
      viewport.removeEventListener("scroll", fitPrompt);
      window.removeEventListener("resize", fitPrompt);
    };
  }, []);

  return (
    <form
      ref={formRef}
      className="name-prompt"
      role="dialog"
      aria-modal="true"
      aria-label="Name your creature"
      aria-describedby="creature-name-instructions"
      tabIndex={-1}
      onSubmit={(event) => {
        event.preventDefault();
        if (!customName) return;
        game.submitCreatureName(name);
      }}
    >
      <div className="name-prompt-companion">
        <img src={`/game/sprites/${prompt.speciesId}.png`} alt="" draggable={false} />
        <div>
          <p id="creature-name-instructions">What will you call <strong>{prompt.speciesName}</strong>?</p>
          {prompt.kind === "starter" ? (
            <p className="name-prompt-reward">First pact kept · +{STARTER_PACT_REWARD.sigils} common sigils · +{STARTER_PACT_REWARD.crowns} crowns</p>
          ) : null}
        </div>
      </div>
      <label>
        Creature name
        <input
          aria-label="Creature name"
          value={name}
          maxLength={40}
          onChange={(event) => {
            const draft = event.target.value;
            setName(draft);
            game.updateCreatureNameDraft(draft);
          }}
        />
      </label>
      <div className="dialog-actions name-prompt-actions">
        <button type="submit" className={customName ? "dialog-next" : "dialog-back"} disabled={!customName}>
          Confirm name
        </button>
        <button type="button" className={customName ? "dialog-back" : "dialog-next"} onClick={() => game.submitCreatureName(null)}>
          Keep {prompt.speciesName}
        </button>
      </div>
    </form>
  );
}

export function MenuPanel({ game, snap, onImportActivate }: { game: ReliquaryGame; snap: Snapshot; onImportActivate?: () => void }) {
  const [bestiaryLink, setBestiaryLink] = useState<{
    speciesId: string;
    returnMenu: "party" | "storage";
    uid: string;
    label: string;
  } | null>(null);

  if (!snap.menu) return null;

  if ((snap.menu === "party" || snap.menu === "storage") && snap.cardMenu) {
    const returnMenu = snap.menu;
    const cardBeast = [...snap.party, ...snap.box].find((b) => b.uid === snap.cardMenu!.uid);
    const cardSp = cardBeast ? SPECIES[cardBeast.speciesId] : null;
    if (!cardBeast || !cardSp) return null;
    return (
      <OverlayPanel
        wide
        title={cardBeast.nickname}
        subtitle={`#${String(cardSp.collectionNumber).padStart(3, "0")} ${cardSp.name} · Lv ${cardBeast.level} · ${cardSp.combatRole}`}
        onClose={() => game.cancel()}
      >
        <CompanionDetailOverlay
          game={game}
          snap={snap}
          onViewInReliquary={(speciesId, uid) => {
            setBestiaryLink({
              speciesId,
              returnMenu,
              uid,
              label: `Back to ${cardBeast.nickname}`,
            });
            game.openMenuSection("reliquary", null);
          }}
        />
      </OverlayPanel>
    );
  }

  if (snap.menu === "root") {
    const totalSpecies = Object.keys(SPECIES).length;
    const boundCount = Object.values(snap.caught).filter(Boolean).length;
    const itemCount = Object.values(snap.inventory).reduce((sum, q) => sum + (q > 0 ? q : 0), 0);
    const lead = snap.party[0];
    const leadStats = lead ? currentStats(lead) : null;
    const destinationMeta: Record<string, string> = {
      Party: `${snap.party.length}/4 active`,
      Storage: `${snap.box.length} stored`,
      Reliquary: `${boundCount}/${totalSpecies} bound`,
      Pack: `${itemCount} carried`,
      Save: "Write record",
      Export: "JSON backup",
      Import: "Load JSON",
      Sound: snap.soundOff ? "Muted" : "Audible",
    };
    return (
      <OverlayPanel
        wide
        title="Lantern"
        subtitle={snap.objective
          ? `Objective — ${snap.objective}${objectiveHint(snap.flags, snap.mapName) ? `\n\n${objectiveHint(snap.flags, snap.mapName)}` : ""}`
          : undefined}
        closeLabel="Close"
        onClose={() => {
          setBestiaryLink(null);
          game.chooseMenu(ROOT_MENU.length - 1);
        }}
        onCloseFocus={() => { game.setMenuIndex(ROOT_MENU.length - 1); game.emitPublic(); }}
      >
        <FiligreeSurface className="rq-lantern-summary">
          <div className="rq-lantern-meta">
            <div>
              <span className="rq-lantern-place">{snap.mapName}</span>
              <strong className="rq-lantern-purse">{snap.gold} crowns</strong>
            </div>
            {lead && leadStats ? (
              <div className="rq-lantern-lead">
                <PortraitCrest speciesId={lead.speciesId} alt="" size="sm" />
                <div>
                  <span className="rq-lantern-lead-name">{lead.nickname} · Lv {lead.level}</span>
                  <span className="rq-lantern-lead-hp">HP {lead.hp}/{leadStats.hp} · MP {lead.mp}/{leadStats.mp}</span>
                </div>
              </div>
            ) : null}
          </div>
        </FiligreeSurface>
        <ul className="menu-list rq-lantern-grid">
          {ROOT_MENU.slice(0, -1).map((it, i) => {
            const label = it === "Sound" ? (snap.soundOff ? "Sound: off" : "Sound: on") : it;
            return (
              <li key={it}>
                <button
                  type="button"
                  aria-label={label}
                  className={i === snap.menuIndex ? "active" : ""}
                  onFocus={() => { game.setMenuIndex(i); game.emitPublic(); }}
                  onClick={() => {
                    setBestiaryLink(null);
                    // Open the picker inside this gesture (Safari-safe); the
                    // engine ticket effect stays as the fallback path.
                    if (it === "Import") onImportActivate?.();
                    game.chooseMenu(i);
                  }}
                >
                  <span className="rq-menu-title">{label}</span>
                  <em>{destinationMeta[it] ?? ""}</em>
                </button>
              </li>
            );
          })}
        </ul>
        <OfflineMenuStatus />
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
        <PartyPanel game={game} snap={snap} renderRename={(beast) => <RenameCreature game={game} beast={beast} />} />
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
        <StoragePanel game={game} snap={snap} />
      </OverlayPanel>
    );
  }
  if (snap.menu === "reliquary") {
    const allSpecies = Object.values(SPECIES);
    const boundCount = allSpecies.filter((sp) => Boolean(snap.caught[sp.id])).length;
    const seenCount = allSpecies.filter((sp) => Boolean(snap.seen[sp.id]) || Boolean(snap.caught[sp.id])).length;
    const progressPct = allSpecies.length ? Math.round((boundCount / allSpecies.length) * 100) : 0;
    return (
      <OverlayPanel
        wide
        title="Reliquary"
        subtitle={`Bound ${boundCount}/${allSpecies.length} · Seen ${seenCount}/${allSpecies.length} (${progressPct}% complete)`}
        onClose={() => {
          setBestiaryLink(null);
          game.cancel();
        }}
      >
        <BestiaryPanel
          snap={snap}
          initialSpeciesId={bestiaryLink?.speciesId ?? null}
          returnLabel={bestiaryLink?.label ?? null}
          onReturn={
            bestiaryLink
              ? () => {
                  const target = bestiaryLink;
                  setBestiaryLink(null);
                  game.openMenuSection(target.returnMenu, target.uid);
                }
              : undefined
          }
        />
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

export function ShopPanel({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  const [portraitFailed, setPortraitFailed] = useState(false);
  const elderhallVendor = game.mapId === "shop_in";
  const namedVendor = elderhallVendor || game.mapId === "keep_shop";
  const vendor = elderhallVendor ? "Calder" : "Chandler";
  const list =
    snap.shopMode === "buy"
      ? snap.shopStock
      : Object.keys(snap.inventory).filter((id) => (snap.inventory[id] ?? 0) > 0 && ITEMS[id]);
  const selectedId = list[snap.shopIndex];
  const selected = selectedId ? ITEMS[selectedId] : null;
  const canAffordBuy = selected && snap.shopMode === "buy" ? snap.gold >= selected.price : true;

  return (
    <OverlayPanel
      title={namedVendor ? snap.mapName : "Chandler"}
      subtitle={`${namedVendor ? `${vendor} · ` : ""}${snap.gold} crowns in purse`}
      onClose={() => game.cancel()}
      closeLabel="Leave"
    >
      <div className="shop-tabs">
        {isElderhallCandidateBuild() && !portraitFailed ? (
          <img className="shop-portrait" src={portraitSource(elderhallVendor ? "shopkeep" : "chandler", true)} alt=""
            width={40} height={52} onError={() => setPortraitFailed(true)} />
        ) : null}
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

export function TouchPad({ game, variant = "full", dialog }: {
  game: ReliquaryGame;
  variant?: "full" | "dialog";
  dialog: DialogView | null;
}) {
  const dialogActive = Boolean(dialog);
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
    const release = () => {
      for (const stop of stops) stop();
      stops.clear();
      for (const code of clearTouchHolds(held)) game.holdKey(code, false);
    };
    const orientation = window.matchMedia("(orientation: portrait)");
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") release();
    };
    orientation.addEventListener("change", release);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      orientation.removeEventListener("change", release);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
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
            <span aria-hidden="true" />
          </button>
          <button type="button" className="d left" aria-label="West" {...dir("KeyA")}>
            <span aria-hidden="true" />
          </button>
          <button type="button" className="d right" aria-label="East" {...dir("KeyD")}>
            <span aria-hidden="true" />
          </button>
          <button type="button" className="d down" aria-label="South" {...dir("KeyS")}>
            <span aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="touch-dialog-hint">
          A · {dialog?.primaryLabel}{dialog?.secondaryLabel ? ` · B · ${dialog.secondaryLabel}` : ""}
        </p>
      )}
      <div className="ab">
        {(!dialogActive || dialog?.secondaryLabel) ? (
          <button type="button" className="b-btn" aria-label={`B — ${dialog ? dialog.secondaryLabel : "Cancel"}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => game.activateDialogueAction(dialog?.revision ?? null, "cancel")}>
            B
          </button>
        ) : <span className="b-btn-placeholder" aria-hidden="true" />}
        <button type="button" className="a-btn" aria-label={`A — ${dialog?.primaryLabel ?? "Interact"}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => game.activateDialogueAction(dialog?.revision ?? null, "confirm")}>
          A
        </button>
      </div>
    </div>
  );
}

export function Toast({ text, className }: { text: string; className?: string }) {
  return <div role="status" className={className ? `toast ${className}` : "toast"}>{text}</div>;
}
