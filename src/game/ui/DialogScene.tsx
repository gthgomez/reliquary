import { useEffect, useId, useRef } from "react";
import type { DialogView } from "../types.ts";
import { PORTRAITS } from "../portraits.ts";
import "./dialogue.css";

export function DialogScene({ dialog, onAdvance, onBack }: {
  dialog: DialogView;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const textId = useId();
  const primary = useRef<HTMLButtonElement>(null);
  const secondary = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const portrait = dialog.portraitKey ? PORTRAITS[dialog.portraitKey] : null;
  const duplicateNonCommittingClose = !dialog.commits
    && dialog.primaryLabel === "Close"
    && dialog.secondaryLabel === "Close";
  const secondaryLabel = duplicateNonCommittingClose ? null : dialog.secondaryLabel;
  useEffect(() => {
    const previousFocus = document.activeElement;
    primary.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && document.activeElement === document.body) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [dialog.text]);
  const back = () => {
    onBack();
    // After Back reaches a page where the secondary action is disabled,
    // the still-mounted primary action keeps keyboard users in the dialogue.
    if (secondary.current === document.activeElement) primary.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className={`dialog-scene${portrait ? " dialog-scene-npc" : ""}`}
      data-npc-id={dialog.npcId ?? undefined}
      role="dialog"
      aria-label={dialog.speaker || "Story"}
    >
      {portrait ? (
        <div className="dialog-portrait" aria-hidden="true">
          <img src={portrait.src} alt="" draggable={false} />
        </div>
      ) : null}
      <div className={`dialog${portrait ? " dialog-panel" : ""}`} data-portrait={dialog.portraitKey ?? "none"}>
        <div
          className="dialog-content"
          ref={content}
          tabIndex={0}
          onKeyDown={(event) => {
            if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) event.stopPropagation();
          }}
        >
          {dialog.speciesId ? <img className="dialog-species" src={`/game/sprites/${dialog.speciesId}.png`} alt="" draggable={false} /> : null}
          <div className="dialog-copy">
            {portrait || dialog.speaker ? (
              <div className="dialog-nameplate">
                {portrait ? <span className="dialog-role">{portrait.role}</span> : null}
                {dialog.speaker ? <span className="dialog-name">{dialog.speaker}</span> : null}
              </div>
            ) : null}
            <p className="dialog-text" id={textId} aria-live="polite" aria-atomic="true">{dialog.text}</p>
          </div>
        </div>
        <div className="dialog-actions">
          {secondaryLabel ? (
            <button type="button" className="dialog-back" ref={secondary} onClick={back}>
              {secondaryLabel}
            </button>
          ) : null}
          {dialog.pageCount > 1 ? (
            <span className="dialog-page-count" role="group" aria-label={`Page ${dialog.page} of ${dialog.pageCount}`}>
              {dialog.page} / {dialog.pageCount}
            </span>
          ) : null}
          <button type="button" className="dialog-next" aria-describedby={textId} ref={primary} onClick={onAdvance}>
            {dialog.primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
