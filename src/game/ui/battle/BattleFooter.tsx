import { InfoIcon } from "./BattleIcons.tsx";

export type BattleFooterProps = {
  message: string;
  recapOpen: boolean;
  hasRecap: boolean;
  onToggleRecap: () => void;
};

export function BattleFooter({ message, recapOpen, hasRecap, onToggleRecap }: BattleFooterProps) {
  return (
    <footer className="battle-footer">
      <span className="battle-footer-icon" aria-hidden><InfoIcon size={18} /></span>
      <p className="battle-footer-message" aria-live="polite" aria-atomic="true">
        <span className="battle-log-text">{message}</span>
      </p>
      <div className="battle-footer-hints">
        <span className="battle-key-hints" aria-hidden>
          <kbd>Enter</kbd> Confirm <kbd>Esc</kbd> Back <kbd>H</kbd> Details
        </span>
        <span className="battle-touch-hint">Tap to act</span>
        <button
          type="button"
          className={`battle-details-toggle${recapOpen ? " is-open" : ""}`}
          aria-expanded={recapOpen}
          aria-controls="battle-recap-panel"
          onClick={onToggleRecap}
          disabled={!hasRecap}
        >
          Details
        </button>
      </div>
    </footer>
  );
}
