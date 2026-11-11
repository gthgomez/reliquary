import { ITEMS, SKILLS, currentStats } from "../../content.ts";
import type { Beast, BattleState } from "../../types.ts";
import { skillMpAffordability, skillMpHint } from "../ui-chrome.ts";

export type BattleSubmenuProps = {
  phase: BattleState["phase"];
  menuIndex: number;
  party: Beast[];
  playerIndex: number;
  skillIds: string[];
  usableItemIds: string[];
  bindIds: string[];
  inventory: Record<string, number>;
  itemEligible: (id: string) => boolean;
  onPreview: (index: number) => void;
  onChoose: (index: number) => void;
};

export function BattleSubmenu({
  phase,
  menuIndex,
  party,
  playerIndex,
  skillIds,
  usableItemIds,
  bindIds,
  inventory,
  itemEligible,
  onPreview,
  onChoose,
}: BattleSubmenuProps) {
  const active = party[playerIndex];
  const rowProps = (index: number) => ({
    "data-battle-row": index,
    tabIndex: index === menuIndex ? 0 : -1,
    onPointerEnter: () => onPreview(index),
    onFocus: () => onPreview(index),
  });

  if (phase === "skills") {
    if (!skillIds.length || !active) {
      return <p className="battle-submenu-empty">No techniques have been learned yet.</p>;
    }
    return (
      <ul className="cmd cmd-scroll cmd-skills" aria-label="Techniques">
        {skillIds.map((skillId, index) => {
          const skill = SKILLS[skillId];
          const cost = skill?.mp ?? 0;
          const afford = skillMpAffordability(active.mp, cost);
          const unaffordable = afford === "unaffordable";
          return (
            <li key={skillId}>
              <button
                type="button"
                {...rowProps(index)}
                className={`${index === menuIndex ? "active" : ""} skill-${afford}`}
                aria-disabled={unaffordable}
                onClick={() => {
                  if (unaffordable) {
                    onPreview(index);
                    return;
                  }
                  onChoose(index);
                }}
              >
                <span className="cmd-skill-main">
                  <span className="cmd-skill-name">{skill?.name ?? skillId}</span>
                  <em>{skillMpHint(active.mp, cost)}</em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (phase === "items") {
    if (!usableItemIds.length) {
      return <p className="battle-submenu-empty">The pack holds nothing usable in battle.</p>;
    }
    return (
      <ul className="cmd cmd-scroll" aria-label="Battle items">
        {usableItemIds.map((id, index) => {
          const eligible = itemEligible(id);
          return (
            <li key={id}>
              <button
                type="button"
                {...rowProps(index)}
                className={`${index === menuIndex ? "active" : ""}${eligible ? "" : " is-inert"}`}
                aria-disabled={!eligible}
                onClick={() => {
                  if (!eligible) {
                    onPreview(index);
                    return;
                  }
                  onChoose(index);
                }}
              >
                <span>{ITEMS[id]?.name ?? id}</span>
                <em>×{inventory[id] ?? 0}</em>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (phase === "bind") {
    if (!bindIds.length) {
      return <p className="battle-submenu-empty">No binding sigils in the pack.</p>;
    }
    return (
      <ul className="cmd cmd-scroll" aria-label="Binding sigils">
        {bindIds.map((id, index) => (
          <li key={id}>
            <button
              type="button"
              {...rowProps(index)}
              className={index === menuIndex ? "active" : ""}
              onClick={() => onChoose(index)}
            >
              <span>{ITEMS[id]?.name ?? id}</span>
              <em>×{inventory[id] ?? 0}</em>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (phase === "party") {
    if (!party.length) {
      return <p className="battle-submenu-empty">No companions answer the call.</p>;
    }
    return (
      <ul className="cmd cmd-scroll cmd-party" aria-label="Companions">
        {party.map((beast, index) => {
          const stats = currentStats(beast);
          const fainted = beast.hp <= 0;
          const alreadyActive = index === playerIndex;
          const inert = fainted || alreadyActive;
          return (
            <li key={beast.uid}>
              <button
                type="button"
                {...rowProps(index)}
                className={`cmd-party-row${index === menuIndex ? " active" : ""}`}
                disabled={fainted}
                aria-disabled={inert}
                onClick={() => {
                  if (inert) {
                    onPreview(index);
                    return;
                  }
                  onChoose(index);
                }}
              >
                <span className="cmd-party-name">{beast.nickname}</span>
                <span className="cmd-party-meta">
                  <em>{fainted ? "Fainted" : alreadyActive ? "In battle" : `${beast.hp}/${stats.hp} hp`}</em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return null;
}
