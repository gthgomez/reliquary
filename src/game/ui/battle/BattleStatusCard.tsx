import { useState } from "react";
import { SPECIES } from "../../content.ts";
import type { Beast, Stats } from "../../types.ts";
import { STATUS_NAMES } from "../../systems/status.ts";
import { HeartIcon, ManaIcon } from "./BattleIcons.tsx";

export type BattleStatusCardProps = {
  side: "player" | "foe";
  beast: Beast;
  stats: Stats;
  /** Player status shows both resources; the foe card mirrors the reference's HP-only strip. */
  showMana?: boolean;
};

function PercentBar({
  kind,
  value,
  max,
  label,
}: {
  kind: "hp" | "mp";
  value: number;
  max: number;
  label: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const low = kind === "hp" && max > 0 && value / max <= 0.25;
  return (
    <div
      className={`battle-bar battle-bar-${kind}${low ? " is-low" : ""}`}
      role="meter"
      aria-label={`${label} ${value} of ${max}`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <span className="battle-bar-fill" style={{ width: `${pct}%` }} aria-hidden />
    </div>
  );
}

export function BattleStatusCard({ side, beast, stats, showMana = true }: BattleStatusCardProps) {
  const species = SPECIES[beast.speciesId];
  const displayName = side === "foe" ? species?.name ?? beast.nickname : beast.nickname;
  const [portraitBroken, setPortraitBroken] = useState(false);
  const status = beast.status ? STATUS_NAMES[beast.status] : null;
  const low = stats.hp > 0 && beast.hp / stats.hp <= 0.25;
  const label = [
    `${displayName}, level ${beast.level}`,
    `Health ${beast.hp} of ${stats.hp}`,
    showMana ? `Mana ${beast.mp} of ${stats.mp}` : null,
    status ? `Status ${status}` : null,
  ].filter(Boolean).join(". ");

  return (
    <article className={`battle-status-card battler ${side === "foe" ? "foe" : "me"}${low ? " is-low-health" : ""}`} aria-label={label}>
      <div className="battle-portrait" aria-hidden>
        {portraitBroken ? (
          <span className="battle-portrait-fallback">{(displayName[0] ?? "?").toUpperCase()}</span>
        ) : (
          <img
            src={`/game/sprites/${beast.speciesId}.png`}
            alt=""
            draggable={false}
            onError={() => {
              setPortraitBroken(true);
              console.warn(`[battle] missing portrait for species ${beast.speciesId}`);
            }}
          />
        )}
      </div>
      <div className="battle-status-body">
        <header className="battle-status-head">
          <h2 className="battle-status-name" title={displayName}>{displayName}</h2>
          <span className="battle-status-level">Lv {beast.level}</span>
        </header>
        <div className="battle-status-rows">
          <div className="battle-stat-row">
            <span className="battle-stat-icon hp" aria-hidden><HeartIcon size={17} /></span>
            <span className="battle-stat-label">HP</span>
            <PercentBar kind="hp" value={beast.hp} max={stats.hp} label="Health" />
            <span className="battle-stat-numbers">{beast.hp}<span aria-hidden> / </span>{stats.hp}</span>
          </div>
          {showMana ? (
            <div className="battle-stat-row">
              <span className="battle-stat-icon mp" aria-hidden><ManaIcon size={17} /></span>
              <span className="battle-stat-label">MP</span>
              <PercentBar kind="mp" value={beast.mp} max={stats.mp} label="Mana" />
              <span className="battle-stat-numbers">{beast.mp}<span aria-hidden> / </span>{stats.mp}</span>
            </div>
          ) : null}
        </div>
        {status ? <span className="battle-status-chip">{status}</span> : null}
      </div>
    </article>
  );
}
