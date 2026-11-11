import type { ActionDetails } from "./battle-action-details.ts";

export function BattleActionDetails({ details }: { details: ActionDetails }) {
  return (
    <article className="battle-details" aria-live="polite" aria-atomic="true">
      <header className="battle-details-head">
        <h2 className="battle-details-title">{details.title}</h2>
        <span className="battle-details-rule" aria-hidden>
          <span className="battle-details-gem" />
        </span>
      </header>
      <p className="battle-details-copy">{details.description}</p>
      {details.note ? (
        <p className={`battle-details-note is-${details.availability}`}>{details.note}</p>
      ) : null}
      {details.meta.length ? (
        <dl className="battle-details-meta">
          {details.meta.map((entry) => (
            <div key={`${entry.label}-${entry.value}`} className="battle-details-meta-row">
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
