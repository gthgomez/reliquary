import type { ReactNode } from "react";
import type { ElementId } from "../../types";
import { ELEMENTS } from "../../content";

export function FiligreeSurface({
  className = "",
  selected = false,
  highlight = false,
  children,
}: {
  className?: string;
  selected?: boolean;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rq-frame${selected ? " is-selected" : ""}${highlight ? " is-highlight" : ""}${className ? ` ${className}` : ""}`}
    >
      <span className="rq-filigree rq-filigree-tl" aria-hidden="true" />
      <span className="rq-filigree rq-filigree-br" aria-hidden="true" />
      {children}
    </div>
  );
}

export function ElementCrests({
  elements,
  className = "",
}: {
  elements: readonly ElementId[];
  className?: string;
}) {
  return (
    <div className={`rq-crests${className ? ` ${className}` : ""}`}>
      {elements.map((el) => {
        const def = ELEMENTS[el];
        return (
          <span
            key={el}
            className="rq-crest"
            style={{ ["--crest-tone" as string]: def?.color ?? "#a98a55" }}
          >
            {def?.name ?? el}
          </span>
        );
      })}
    </div>
  );
}

export function ReliquaryBadge({
  tone = "bronze",
  children,
}: {
  tone?: "gold" | "bronze" | "rare" | "emerald" | "warning";
  children: ReactNode;
}) {
  return <span className={`rq-badge rq-badge-${tone}`}>{children}</span>;
}

export function PortraitCrest({
  speciesId,
  alt,
  silhouette = false,
  size = "md",
}: {
  speciesId: string;
  alt: string;
  silhouette?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={`rq-portrait rq-portrait-${size}${silhouette ? " is-silhouette" : ""}`}>
      <img
        src={`/game/sprites/${speciesId}.png`}
        alt={alt}
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

export function ResourceMeter({
  label,
  title,
  value,
  max,
  tone,
}: {
  label: string;
  title?: string;
  value: number;
  max: number;
  tone: "hp" | "mp" | "exp" | "stat";
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="meter rq-meter">
      <div className="meter-head">
        <span className="meter-abbr" title={title}>{label}</span>
        <span className="meter-frac">{value}/{max}</span>
      </div>
      <div className="meter-track rq-meter-track">
        <div className={`meter-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StatChartBar({
  label,
  value,
  max = 120,
  deltaPct = 0,
  compareValue,
}: {
  label: string;
  value: number;
  max?: number;
  deltaPct?: number;
  compareValue?: number;
}) {
  const pct = Math.max(6, Math.min(100, (value / max) * 100));
  const diff = compareValue !== undefined ? value - compareValue : null;
  return (
    <div className="rq-stat-row">
      <span className="rq-stat-key">{label}</span>
      <div className="rq-stat-track" aria-hidden="true">
        <div className="rq-stat-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="rq-stat-val">
        {value}
        {deltaPct !== 0 ? (
          <small className={deltaPct > 0 ? "rq-delta-up" : "rq-delta-down"}>
            {deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}
          </small>
        ) : null}
        {diff !== null && diff !== 0 ? (
          <small className={diff > 0 ? "rq-delta-up" : "rq-delta-down"}>
            {diff > 0 ? ` (+${diff})` : ` (${diff})`}
          </small>
        ) : null}
      </span>
    </div>
  );
}
