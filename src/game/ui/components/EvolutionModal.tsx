import { useEffect, useRef } from "react";
import { SKILLS, SPECIES } from "../../content";
import type { EvolutionNotice, Stats } from "../../types";
import { useOverlayFocusTrap } from "../useOverlayFocusTrap";
import { ElementCrests, FiligreeSurface, PortraitCrest, ReliquaryBadge } from "./ReliquaryPrimitives";

const COMPARE_STATS: { key: keyof Stats; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "mp", label: "MP" },
  { key: "atk", label: "ATK" },
  { key: "def", label: "DEF" },
  { key: "mag", label: "MAG" },
  { key: "res", label: "RES" },
  { key: "spd", label: "SPD" },
  { key: "lck", label: "LCK" },
];

export function EvolutionModal({
  notice,
  onDismiss,
}: {
  notice: EvolutionNotice;
  onDismiss: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  useOverlayFocusTrap(modalRef, true);

  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
  }, [notice.uid, notice.toSpeciesId]);

  const fromSp = SPECIES[notice.fromSpeciesId];
  const toSp = SPECIES[notice.toSpeciesId];

  return (
    <div
      className="rq-evo-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rq-evo-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") {
          e.stopPropagation();
          e.preventDefault();
          onDismiss();
        }
      }}
    >
      <div className="rq-evo-dialog" ref={modalRef} tabIndex={-1}>
        <FiligreeSurface className="rq-evo-card" highlight>
          <p className="rq-evo-kicker">The Pact Deepens · Lv {notice.level}</p>
          <h2 id="rq-evo-title" className="rq-evo-title">
            {notice.nickname} evolved into {toSp?.name ?? notice.toSpeciesId}!
          </h2>

          <div className="rq-evo-stage">
            <div className="rq-evo-form is-from">
              <PortraitCrest speciesId={notice.fromSpeciesId} alt={fromSp?.name ?? notice.fromSpeciesId} size="md" />
              <span>{fromSp?.name ?? notice.fromSpeciesId}</span>
            </div>
            <span className="rq-evo-arrow" aria-hidden="true">→</span>
            <div className="rq-evo-form is-to">
              <PortraitCrest speciesId={notice.toSpeciesId} alt={toSp?.name ?? notice.toSpeciesId} size="lg" />
              <strong>{toSp?.name ?? notice.toSpeciesId}</strong>
              {toSp ? <ElementCrests elements={toSp.elements} /> : null}
            </div>
          </div>

          {notice.unlockedReliquary ? (
            <div className="rq-evo-badges">
              <ReliquaryBadge tone="gold">New Reliquary Record Unlocked</ReliquaryBadge>
            </div>
          ) : null}

          <div className="rq-evo-stats" aria-label="Attribute growth">
            {COMPARE_STATS.map(({ key, label }) => {
              const before = notice.beforeStats[key];
              const after = notice.afterStats[key];
              const delta = after - before;
              return (
                <div key={key} className="rq-evo-stat">
                  <span className="rq-stat-key">{label}</span>
                  <span>{after}</span>
                  <small className={delta > 0 ? "rq-delta-up" : "rq-muted-copy"}>
                    {delta >= 0 ? `+${delta}` : delta}
                  </small>
                </div>
              );
            })}
          </div>

          {notice.learnedSkills.length > 0 || notice.queuedSkills.length > 0 ? (
            <div className="rq-evo-skills">
              {notice.learnedSkills.map((id) => (
                <ReliquaryBadge key={id} tone="emerald">
                  Learned {SKILLS[id]?.name ?? id}
                </ReliquaryBadge>
              ))}
              {notice.queuedSkills.map((id) => (
                <ReliquaryBadge key={id} tone="bronze">
                  Queued {SKILLS[id]?.name ?? id}
                </ReliquaryBadge>
              ))}
            </div>
          ) : null}

          <button
            ref={continueRef}
            type="button"
            className="btn-primary rq-evo-continue"
            onClick={onDismiss}
          >
            Continue
          </button>
        </FiligreeSurface>
      </div>
    </div>
  );
}
