import type { PointerEvent } from "react";
import { currentStats, ELEMENTS, ITEMS, SKILLS, SPECIES, TEMPERAMENTS } from "../content";
import type { ReliquaryGame } from "../engine";
import type { Beast, Snapshot } from "../types";

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
          <p className="title-hint">Arrows or WASD to walk · Z / Enter to speak · X / Esc back · M menu</p>
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
            Warden Cael has tested the compact and found it held. The Hollow Crown still waits west of the ash — a later road.
          </p>
          <button type="button" className="btn-primary" onClick={() => { game.mode = "world"; game.emitPublic(); }}>
            Walk on
          </button>
        </div>
      </div>
    </div>
  );
}

export function Hud({ snap, onMenu }: { snap: Snapshot; onMenu: () => void }) {
  const lead = snap.party[0];
  const st = lead ? currentStats(lead) : null;
  return (
    <div className="hud">
      <div className="hud-chip">
        <span className="hud-place">{snap.mapName}</span>
        <span className="hud-muted">{snap.region}</span>
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
      <button type="button" className="hud-menu" onClick={onMenu}>
        Menu
      </button>
    </div>
  );
}

export function DialogBox({ snap, onAdvance }: { snap: Snapshot; onAdvance: () => void }) {
  if (!snap.dialog) return null;
  return (
    <button type="button" className="dialog" onClick={onAdvance}>
      {snap.dialog.speaker ? <span className="dialog-name">{snap.dialog.speaker}</span> : null}
      <p className="dialog-text">{snap.dialog.text}</p>
      <span className="dialog-next">{snap.dialog.last ? "Close" : "Next"}</span>
    </button>
  );
}

export function MenuPanel({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  if (!snap.menu) return null;
  if (snap.menu === "root") {
    const items = ["Party", "Reliquary", "Pack", "Save", "Close"];
    return (
      <div className="sheet">
        <h2>Lantern</h2>
        <ul className="menu-list">
          {items.map((it, i) => (
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
      </div>
    );
  }
  if (snap.menu === "party") {
    return (
      <div className="sheet sheet-wide">
        <h2>Party</h2>
        <div className="party-grid">
          {snap.party.map((b) => (
            <BeastCard key={b.uid} beast={b} />
          ))}
          {snap.party.length === 0 ? <p className="empty">No pact spoken yet.</p> : null}
        </div>
        <button type="button" className="btn-ghost" onClick={() => game.cancel()}>
          Back
        </button>
      </div>
    );
  }
  if (snap.menu === "reliquary") {
    const ids = Object.keys(SPECIES);
    return (
      <div className="sheet sheet-wide">
        <h2>Reliquary</h2>
        <p className="sheet-sub">
          Bound {Object.keys(snap.caught).length} · Seen {Object.keys(snap.seen).length} of {ids.length}
        </p>
        <div className="reliq-grid">
          {ids.map((id) => {
            const sp = SPECIES[id]!;
            const known = snap.seen[id] || snap.caught[id];
            return (
              <div key={id} className={`reliq-cell ${snap.caught[id] ? "have" : ""}`}>
                {known ? (
                  <img src={`/game/sprites/${id}.png`} alt={sp.name} />
                ) : (
                  <span className="unknown">?</span>
                )}
                <span>{known ? sp.name : "——"}</span>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-ghost" onClick={() => game.cancel()}>
          Back
        </button>
      </div>
    );
  }
  if (snap.menu === "items") {
    const ids = Object.keys(snap.inventory).filter((id) => (snap.inventory[id] ?? 0) > 0);
    return (
      <div className="sheet">
        <h2>Pack</h2>
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
          {ids.length === 0 ? <li className="empty">The pack is empty.</li> : null}
        </ul>
        <button type="button" className="btn-ghost" onClick={() => game.cancel()}>
          Back
        </button>
      </div>
    );
  }
  return null;
}

function BeastCard({ beast }: { beast: Beast }) {
  const sp = SPECIES[beast.speciesId]!;
  const st = currentStats(beast);
  const t = TEMPERAMENTS[beast.temperament];
  return (
    <article className="beast-card">
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
        <p className="muted">
          {t.name} · {sp.epithet}
        </p>
        <p className="skills">
          {beast.skills.map((s) => SKILLS[s]?.name ?? s).join(" · ")}
        </p>
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
  const cmds = b.canFlee
    ? ["Strike", "Skill", "Item", "Bind", "Party", "Flee"]
    : ["Strike", "Skill", "Item", "Party"];
  return (
    <div className="battle-ui">
      {foe && foS ? (
        <div className="battler foe">
          <strong>{SPECIES[foe.speciesId]?.name}</strong>
          <span>Lv {foe.level}</span>
          <Meter label="HP" value={foe.hp} max={foS.hp} kind="hp" />
        </div>
      ) : null}
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
      {b.phase === "item-target" ? (
        <ul className="cmd">
          {snap.party.map((p, i) => (
            <li key={p.uid}>
              <button
                type="button"
                className={i === b.menuIndex ? "active" : ""}
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
  );
}

export function ShopPanel({ game, snap }: { game: ReliquaryGame; snap: Snapshot }) {
  const list =
    snap.shopMode === "buy"
      ? snap.shopStock
      : Object.keys(snap.inventory).filter((id) => (snap.inventory[id] ?? 0) > 0 && ITEMS[id]);
  return (
    <div className="sheet">
      <h2>Chandler</h2>
      <p className="sheet-sub">{snap.gold} crowns</p>
      <div className="shop-tabs">
        <button type="button" className={snap.shopMode === "buy" ? "active" : ""} onClick={() => { game.shopMode = "buy"; game.shopIndex = 0; game.emitPublic(); }}>
          Buy
        </button>
        <button type="button" className={snap.shopMode === "sell" ? "active" : ""} onClick={() => { game.shopMode = "sell"; game.shopIndex = 0; game.emitPublic(); }}>
          Sell
        </button>
      </div>
      <ul className="menu-list">
        {list.map((id, i) => {
          const it = ITEMS[id]!;
          const price = snap.shopMode === "buy" ? it.price : Math.floor(it.price / 2);
          return (
            <li key={id}>
              <button
                type="button"
                className={i === snap.shopIndex ? "active" : ""}
                onClick={() => {
                  game.shopIndex = i;
                  game.shopConfirm();
                }}
              >
                {it.name}
                <em>
                  {price} cr{snap.shopMode === "sell" ? ` · ×${snap.inventory[id]}` : ""}
                </em>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-ghost" onClick={() => game.cancel()}>
        Leave
      </button>
    </div>
  );
}

export function TouchPad({ game }: { game: ReliquaryGame }) {
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
    <div className="touch">
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

export function Toast({ text }: { text: string }) {
  return <div className="toast">{text}</div>;
}
