import type { PointerEvent, ReactNode, RefObject } from "react";
import { useEffect, useState } from "react";
import { portraitSrc } from "../dialog-portraits.ts";
import {
  currentStats,
  expToNext,
  ELEMENTS,
  ITEMS,
  SKILLS,
  SPECIES,
  TEMPERAMENTS,
} from "../content";
import { battleCommands } from "../world/encounters.ts";
import type { ReliquaryGame } from "../engine";
import { ROOT_MENU } from "../engine";
import type { Beast, Snapshot } from "../types";
import { OverlayPanel } from "./OverlayPanel";
import {
  leadActionHint,
  practiceActionHint,
  practiceEnabledHint,
} from "./party-actions.ts";
import { shopBuyAffordability } from "./ui-chrome.ts";

export function TitleScreen({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  return (
    <div className="title-screen">
      <img src="/game/bg/title.jpg" alt="" className="title-bg" />
      <div className="title-veil" />
      <div className="title-copy">
        <div className="title-plaque">
          <p className="title-kicker">A beastbinding chronicle</p>
          <h1 className="title-word">Reliquary</h1>
          <p className="title-tag">Bind the wild. Keep the old roads.</p>
          <div className="title-actions">
            <button type="button" className="btn-primary" onClick={() => game.startNew()}>
              Start
            </button>
            {snap.hasSave ? (
              <button type="button" className="btn-ghost" onClick={() => game.continueGame()}>
                Continue
              </button>
            ) : null}
          </div>
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
            onClick={() => {
              game.mode = "world";
              game.emitPublic();
            }}
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
  const [objectiveOpen, setObjectiveOpen] = useState(false);
  return (
    <div className={`hud${dormant ? " hud-dormant" : ""}`} aria-hidden={dormant}>
      <div className="hud-chip hud-chip-grow">
        <span className="hud-place">{snap.mapName}</span>
        <span className="hud-muted">{snap.region}</span>
        {snap.objective ? (
          <div className="hud-objective-wrap">
            <button
              type="button"
              className="hud-objective-btn"
              aria-expanded={objectiveOpen}
              onClick={() => setObjectiveOpen((open) => !open)}
            >
              <span className="hud-objective-label">Objective</span>
              <span className="hud-objective-preview">{snap.objective}</span>
              <span className="hud-objective-chevron">{objectiveOpen ? "▾" : "▸"}</span>
            </button>
            {objectiveOpen ? <p className="hud-objective-full">{snap.objective}</p> : null}
            <button type="button" className="hud-objective-lantern" onClick={onMenu}>
              Open in Lantern menu
            </button>
          </div>
        ) : null}
      </div>
      <div className="hud-chip">
        <span className="hud-gold">{snap.gold} cr</span>
        {lead && st ? (
          <span className="hud-muted">
            {lead.nickname} {lead.hp}/{st.hp}
          </span>
        ) : (
          <span className="hud-muted">No pact yet</span>
        )}
      </div>
      <button type="button" className="hud-menu" ref={menuButtonRef} onClick={onMenu}>
        Menu
      </button>
    </div>
  );
}

export function DialogBox({ snap, onAdvance }: { snap: Snapshot; onAdvance: () => void }) {
  if (!snap.dialog) return null;
  const dialog = snap.dialog;
  const portrait = portraitSrc(dialog.portrait);
  return (
    <button type="button" className={`dialog${portrait ? " dialog-npc" : ""}`} onClick={onAdvance}>
      {portrait ? (
        <span className="dialog-portrait" aria-hidden="true">
          <img src={portrait} alt="" draggable={false} />
        </span>
      ) : null}
      <span className="dialog-body">
        {dialog.speaker ? <span className="dialog-name">{dialog.speaker}</span> : null}
        <p className="dialog-text">{dialog.text}</p>
      </span>
      <span className="dialog-next">{dialog.last ? "Close" : "Next"}</span>
    </button>
  );
}

export function MenuPanel({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  if (!snap.menu) return null;
  const actionLabels: Record<string, (nickname: string) => string> = {
    lead: (n) => `Make ${n} lead`,
    practice: () => "Practice · 45 cr",
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
                onClick={() => {
                  game.menuIndex = i;
                  game.menuConfirm();
                }}
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
        onClose={() => game.cancel()}
        closeLabel="Close"
      >
        <ul className="menu-list">
          {ROOT_MENU.map((it, i) => (
            <li key={it}>
              <button
                type="button"
                className={i === snap.menuIndex ? "active" : ""}
                onClick={() => {
                  game.menuIndex = i;
                  game.menuConfirm();
                }}
              >
                {it}
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
                onClick={() => {
                  game.menuIndex = i;
                  game.menuConfirm();
                }}
              >
                Replace {SKILLS[existingId]?.name ?? existingId}
              </button>
            </li>
          ))}
          <li key="decline">
            <button
              type="button"
              className={(beast?.skills.length ?? 0) === snap.menuIndex ? "active" : ""}
              onClick={() => {
                game.menuIndex = beast?.skills.length ?? 0;
                game.menuConfirm();
              }}
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
        subtitle="Lead walks first in battle. Practice costs 45 cr and grants 80 lore (XP)."
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
                  disabled={b.hp <= 0 || b.level >= 40 || snap.gold < 45}
                  onClick={() => game.trainCreature(b.uid)}
                  aria-label={`Practice with ${b.nickname} for 45 crowns`}
                  aria-describedby={`practice-hint-${b.uid}`}
                >
                  Practice · 45 cr
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
        <div className="reliq-grid">
          {ids.map((id) => {
            const sp = SPECIES[id]!;
            const caught = Boolean(snap.caught[id]);
            const seen = Boolean(snap.seen[id]);
            const known = seen || caught;
            return (
              <div
                key={id}
                className={`reliq-cell ${caught ? "have" : ""}${seen && !caught ? " seen" : ""}`}
                title={
                  caught
                    ? `${sp.name} — bound to your compact`
                    : seen
                      ? `${sp.name} — seen in the wild, not yet bound`
                      : "Unheard of — bind one to learn its name"
                }
              >
                {known ? (
                  <img src={`/game/sprites/${id}.png`} alt={caught || seen ? sp.name : "Unknown creature"} />
                ) : (
                  <span className="unknown" aria-label="Unheard of">
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
                onClick={() => {
                  game.menuIndex = i;
                  game.menuConfirm();
                }}
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
                onClick={() => {
                  game.menuIndex = i;
                  game.menuConfirm();
                }}
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
    if (game.selectedUid === beast.uid) {
      setName(beast.nickname);
      setEditing(true);
      game.selectedUid = null;
      game.emitPublic();
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
        {beast.level < 40 ? (
          <Meter label="Lore" value={beast.exp} max={expToNext(beast.level)} kind="mp" />
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
}: {
  label: string;
  value: number;
  max: number;
  kind: "hp" | "mp";
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <span>
        {label} {value}/{max}
      </span>
      <div className="meter-track">
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
  return (
    <div className="battle-ui">
      {foe && foS ? (
        <div className="battler foe">
          <strong>{SPECIES[foe.speciesId]?.name}</strong>
          <span>Lv {foe.level}</span>
          <Meter label="HP" value={foe.hp} max={foS.hp} kind="hp" />
        </div>
      ) : null}
      <div className="battle-controls">
        {me && meS ? (
          <div className="battler me">
            <strong>{me.nickname}</strong>
            <span>Lv {me.level}</span>
            <Meter label="HP" value={me.hp} max={meS.hp} kind="hp" />
            <Meter label="MP" value={me.mp} max={meS.mp} kind="mp" />
          </div>
        ) : null}
        <div className="battle-log">{b.log[b.log.length - 1]}</div>
        {b.phase === "command" ? (
          <ul className="cmd">
            {cmds.map((c, i) => (
              <li key={c}>
                <button
                  type="button"
                  className={i === b.menuIndex ? "active" : ""}
                  onClick={() => {
                    game.menuIndex = i;
                    if (game.battle) game.battle.menuIndex = i;
                    game.confirm();
                  }}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {b.phase === "skills" && me ? (
          <ul className="cmd">
            {me.skills.map((sid, i) => {
              const sk = SKILLS[sid];
              return (
                <li key={sid}>
                  <button
                    type="button"
                    className={i === b.menuIndex ? "active" : ""}
                    onClick={() => {
                      game.menuIndex = i;
                      if (game.battle) game.battle.menuIndex = i;
                      game.confirm();
                    }}
                  >
                    {sk?.name} <em>{sk?.mp} mp</em>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {b.phase === "items" ? (
          <ul className="cmd">
            {game.usableItems().map((id, i) => (
              <li key={id}>
                <button
                  type="button"
                  className={i === b.menuIndex ? "active" : ""}
                  onClick={() => {
                    game.menuIndex = i;
                    if (game.battle) game.battle.menuIndex = i;
                    game.confirm();
                  }}
                >
                  {ITEMS[id]?.name} <em>×{snap.inventory[id]}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {b.phase === "bind" ? (
          <ul className="cmd">
            {["common_sigil", "thorn_sigil", "relic_sigil"]
              .filter((s) => (snap.inventory[s] ?? 0) > 0)
              .map((id, i) => (
                <li key={id}>
                  <button
                    type="button"
                    className={i === b.menuIndex ? "active" : ""}
                    onClick={() => {
                      game.menuIndex = i;
                      if (game.battle) game.battle.menuIndex = i;
                      game.confirm();
                    }}
                  >
                    {ITEMS[id]?.name} <em>×{snap.inventory[id]}</em>
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
        {b.phase === "party" ? (
          <ul className="cmd">
            {snap.party.map((p, i) => (
              <li key={p.uid}>
                <button
                  type="button"
                  className={i === b.menuIndex ? "active" : ""}
                  disabled={p.hp <= 0}
                  onClick={() => {
                    game.menuIndex = i;
                    if (game.battle) game.battle.menuIndex = i;
                    game.confirm();
                  }}
                >
                  {p.nickname} <em>{p.hp} hp</em>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {b.phase === "win" || b.phase === "lose" ? (
          <button type="button" className="btn-primary" onClick={() => game.confirm()}>
            {b.phase === "win" ? "Continue" : "Wake"}
          </button>
        ) : null}
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
          onClick={() => {
            game.shopMode = "buy";
            game.shopIndex = 0;
            game.emitPublic();
          }}
        >
          Buy
        </button>
        <button
          type="button"
          className={snap.shopMode === "sell" ? "active" : ""}
          onClick={() => {
            game.shopMode = "sell";
            game.shopIndex = 0;
            game.emitPublic();
          }}
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
                onClick={() => {
                  game.shopIndex = i;
                  game.emitPublic();
                }}
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

export function TouchPad({ game, variant = "full" }: { game: ReliquaryGame; variant?: "full" | "dialog" }) {
  const hold = (code: string, on: boolean) => {
    if (on) game.keys.add(code);
    else game.keys.delete(code);
  };
  const dir = (code: string) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
      hold(code, true);
    },
    onPointerUp: () => hold(code, false),
    onPointerCancel: () => hold(code, false),
    onLostPointerCapture: () => hold(code, false),
  });
  return (
    <div className={`touch touch-${variant}`} aria-label={variant === "dialog" ? "Dialog controls" : "Movement controls"}>
      {variant === "full" ? (
        <div className="dpad">
          <button type="button" className="d up" aria-label="North" {...dir("KeyW")}>
            <span>N</span>
          </button>
          <button type="button" className="d left" aria-label="West" {...dir("KeyA")}>
            <span>W</span>
          </button>
          <button type="button" className="d right" aria-label="East" {...dir("KeyD")}>
            <span>E</span>
          </button>
          <button type="button" className="d down" aria-label="South" {...dir("KeyS")}>
            <span>S</span>
          </button>
        </div>
      ) : (
        <p className="touch-dialog-hint">A · Next · B · Back</p>
      )}
      <div className="ab">
        <button type="button" className="b-btn" onClick={() => game.cancel()}>
          B
        </button>
        <button type="button" className="a-btn" onClick={() => game.confirm()}>
          A
        </button>
      </div>
    </div>
  );
}

export function Toast({ text, className }: { text: string; className?: string }) {
  return <div className={className ? `toast ${className}` : "toast"}>{text}</div>;
}
