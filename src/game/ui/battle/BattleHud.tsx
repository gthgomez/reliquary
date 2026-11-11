import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { currentStats } from "../../content.ts";
import type { ReliquaryGame } from "../../engine.ts";
import type { BattleState, Snapshot } from "../../types.ts";
import { BATTLE_SIGILS } from "../../world/encounters.ts";
import type { BattleCommand } from "../../world/encounters.ts";
import { BattleActionDetails } from "./BattleActionDetails.tsx";
import { BattleActionGrid } from "./BattleActionGrid.tsx";
import { BattleFooter } from "./BattleFooter.tsx";
import { BattleStatusCard } from "./BattleStatusCard.tsx";
import { BattleSubmenu } from "./BattleSubmenu.tsx";
import {
  battleCommandSlots,
  commandForEngineIndex,
  firstAvailableCommand,
  nextBattleCommand,
} from "./battle-commands.ts";
import { resolveBattleActionDetails, type ActionDetails } from "./battle-action-details.ts";
import { battlePanelHeading } from "../battle-chrome.ts";
import "./battle.css";

const SUBMENU_PHASES = new Set<BattleState["phase"]>(["skills", "items", "party", "bind"]);
const INERT_PHASES = new Set<BattleState["phase"]>(["anim", "catch", "intro"]);

function outcomeDetails(phase: BattleState["phase"], message: string): ActionDetails {
  const title = phase === "win" ? "Victory" : "Defeat";
  return {
    title,
    description: message,
    meta: [],
    chips: [],
    availability: "ready",
    note: phase === "lose" ? "You wake in Elderhall; the road keeps its price." : "Continue to return to the road.",
    ariaLabel: `${title}. ${message}`,
  };
}

export function BattleHud({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  const b = snap.battle;
  const slots = useMemo(
    () => (b ? battleCommandSlots(b) : []),
    // Commands only change when encounter permissions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b?.canBind, b?.canFlee],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusCommand, setFocusCommand] = useState<BattleCommand>(
    () => firstAvailableCommand(slots) ?? "Strike",
  );
  const [recapOpen, setRecapOpen] = useState(false);
  const [touchInput, setTouchInput] = useState(false);

  useEffect(() => {
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    setTouchInput(coarse || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0));
  }, []);

  const phase = b?.phase ?? "command";
  const submenu = SUBMENU_PHASES.has(phase);
  const commandPhase = phase === "command";
  const inert = INERT_PHASES.has(phase);

  // Keep the local highlight honest when the engine moves its own selection
  // (submenu back, forced switch, new turn).
  useEffect(() => {
    if (!b || b.phase !== "command") return;
    const mapped = commandForEngineIndex(slots, b.menuIndex);
    if (mapped) setFocusCommand(mapped);
    // slots are derived from canBind/canFlee; menuIndex is the authority.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.phase, b?.menuIndex, b?.canBind, b?.canFlee]);

  // Focus follows the visible selection so keyboard play never requires a
  // mouse. Pointer-only sessions still get a focus ring inside the dock.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const active = document.activeElement;
    const ownsFocus = !active || active === document.body || root.contains(active);
    if (!ownsFocus) return;
    const selector = b && b.phase === "command"
      ? `[data-command="${focusCommand}"]`
      : b && SUBMENU_PHASES.has(b.phase)
        ? `[data-battle-row="${b.menuIndex}"]`
        : b && (b.phase === "win" || b.phase === "lose")
          ? ".battle-continue"
          : null;
    if (!selector) return;
    const target = root.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.focus({ preventScroll: true });
  }, [b?.phase, b?.menuIndex, focusCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectCommand = useCallback((command: BattleCommand, sound: boolean) => {
    const slot = slots.find((entry) => entry.id === command);
    setFocusCommand(command);
    if (slot?.available) game.previewBattleCommand(command);
    if (sound) game.playMenuCue();
    requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLElement>(`[data-command="${command}"]`)?.focus({ preventScroll: true });
    });
    // slots are cheap and derived from the live battle flags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, b?.canBind, b?.canFlee]);

  const moveList = useCallback((delta: number) => {
    if (!b) return;
    const count = b.phase === "skills"
      ? snap.party[b.playerIndex]?.skills.length ?? 0
      : b.phase === "items"
        ? game.usableItems().length
        : b.phase === "bind"
          ? BATTLE_SIGILS.filter((id) => (snap.inventory[id] ?? 0) > 0).length
          : b.phase === "party"
            ? snap.party.length
            : 0;
    if (count <= 1) return;
    const enabled = (index: number): boolean => {
      if (b.phase === "party") {
        const beast = snap.party[index];
        return !!beast && beast.hp > 0 && index !== b.playerIndex;
      }
      return index >= 0 && index < count;
    };
    let next = b.menuIndex;
    for (let step = 0; step < count; step += 1) {
      next = (next + delta + count) % count;
      if (enabled(next)) break;
    }
    if (next === b.menuIndex) return;
    game.previewBattle(next);
    game.playMenuCue();
  }, [b, game, snap]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!b) return;
    const key = event.key.toLowerCase();
    const arrows: Record<string, "up" | "down" | "left" | "right"> = {
      arrowup: "up",
      w: "up",
      arrowdown: "down",
      s: "down",
      arrowleft: "left",
      a: "left",
      arrowright: "right",
      d: "right",
    };
    if (key === "h") {
      event.preventDefault();
      event.stopPropagation();
      if (b.recap.length) setRecapOpen((open) => !open);
      return;
    }
    if (arrows[key]) {
      event.preventDefault();
      event.stopPropagation();
      if (b.phase === "command") {
        const next = nextBattleCommand(slots, focusCommand, arrows[key]);
        if (next) selectCommand(next, true);
        return;
      }
      if (SUBMENU_PHASES.has(b.phase)) {
        moveList(arrows[key] === "up" || arrows[key] === "left" ? -1 : 1);
      }
      return;
    }
    if (key === "escape" && recapOpen) {
      // Let the engine keep ownership of Back; only close the reading panel.
      event.preventDefault();
      event.stopPropagation();
      setRecapOpen(false);
    }
  }, [b, focusCommand, moveList, recapOpen, selectCommand, slots]);

  if (!b) return null;

  const me = snap.party[b.playerIndex] ?? null;
  const foe = b.foes[b.foeIndex] ?? null;
  const meStats = me ? currentStats(me) : null;
  const foeStats = foe ? currentStats(foe) : null;
  const message = b.log[b.log.length - 1] ?? "Choose an action.";
  const hasRecap = b.recap.length > 0;

  const skillIds = me?.skills ?? [];
  const usableItemIds = game.usableItems();
  const bindIds = BATTLE_SIGILS.filter((id) => (snap.inventory[id] ?? 0) > 0);
  const details = phase === "win" || phase === "lose"
    ? outcomeDetails(phase, message)
    : resolveBattleActionDetails({
        phase,
        command: focusCommand,
        canBind: b.canBind,
        canFlee: b.canFlee,
        playerIndex: b.playerIndex,
        party: snap.party,
        inventory: snap.inventory,
        skillIds,
        usableItemIds,
        bindIds,
        menuIndex: b.menuIndex,
        itemEligible: (id) => game.battleItemHasEffect(id),
      });

  const showBack = submenu;
  const showContinue = phase === "win" || phase === "lose";
  const panelHeading = submenu ? battlePanelHeading(phase) : null;
  const recapVisibleInBody = showContinue && hasRecap;

  return (
    <div className={`battle-ui battle-hud${touchInput ? " is-touch" : ""}`} ref={rootRef} onKeyDown={onKeyDown}>
      <div className="battle-status-zone">
        {me && meStats ? <BattleStatusCard side="player" beast={me} stats={meStats} /> : null}
        {foe && foeStats ? <BattleStatusCard side="foe" beast={foe} stats={foeStats} showMana={false} /> : null}
      </div>

      <div className="battle-controls" data-battle-phase={b.phase}>
        <div className="battle-dock-main">
          <section className="battle-command-panel" aria-label="Battle actions">
            <div className="battle-controls-body">
              {panelHeading ? <p className="battle-panel-title">{panelHeading}</p> : null}
              {commandPhase ? (
                <BattleActionGrid
                  slots={slots}
                  selected={focusCommand}
                  onFocusCommand={(command) => selectCommand(command, false)}
                  onActivateCommand={(command) => game.chooseBattleCommand(command)}
                />
              ) : null}
              {inert ? (
                <BattleActionGrid
                  slots={slots}
                  selected={focusCommand}
                  locked
                  onFocusCommand={() => {}}
                  onActivateCommand={() => {}}
                />
              ) : null}
              {submenu ? (
                <BattleSubmenu
                  phase={phase}
                  menuIndex={b.menuIndex}
                  party={snap.party}
                  playerIndex={b.playerIndex}
                  skillIds={skillIds}
                  usableItemIds={usableItemIds}
                  bindIds={bindIds}
                  inventory={snap.inventory}
                  itemEligible={(id) => game.battleItemHasEffect(id)}
                  onPreview={(index) => game.previewBattle(index)}
                  onChoose={(index) => game.chooseBattle(index)}
                />
              ) : null}
              {recapVisibleInBody ? (
                <div className="battle-recap-wrap">
                  <p className="battle-panel-title">How it ended</p>
                  <ol className="battle-recap" aria-label="How the battle ended">
                    {b.recap.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            <div className="battle-controls-actions">
              {showBack && phase !== "win" && phase !== "lose" ? (
                <button type="button" className="btn-ghost battle-back" onClick={() => game.cancel()}>
                  Back
                </button>
              ) : null}
              {showContinue ? (
                <button type="button" className="btn-primary battle-continue" onClick={() => game.confirm()}>
                  {phase === "win" ? (b.escaped ? "Leave" : "Continue") : "Wake"}
                </button>
              ) : null}
            </div>
          </section>

          <section className="battle-details-panel" aria-label="Action details">
            <BattleActionDetails details={details} />
          </section>
        </div>

        <BattleFooter
          message={message}
          recapOpen={recapOpen}
          hasRecap={hasRecap}
          onToggleRecap={() => setRecapOpen((open) => !open)}
        />
      </div>

      {recapOpen ? (
        <section
          id="battle-recap-panel"
          className="battle-recap-panel"
          role="dialog"
          aria-label="Battle log"
        >
          <header className="battle-recap-head">
            <h2>This battle</h2>
            <button type="button" className="battle-recap-close" onClick={() => setRecapOpen(false)}>
              Close
            </button>
          </header>
          {hasRecap ? (
            <ol className="battle-recap" aria-label="This battle so far">
              {b.recap.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ol>
          ) : (
            <p className="battle-submenu-empty">Nothing has happened yet.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
