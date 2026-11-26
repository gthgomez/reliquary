import { useEffect, useId, useRef, useState } from "react";
import type { DialogView } from "../types.ts";
import { isElderhallCandidateBuild } from "../build-flags.ts";
import { PORTRAITS, portraitSource } from "../portraits.ts";
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
  const [failedPortrait, setFailedPortrait] = useState<string | null>(null);
  const candidatePortrait = isElderhallCandidateBuild() && dialog.portraitKey
    ? portraitSource(dialog.portraitKey, true) : null;
  const pixelPortrait = candidatePortrait && candidatePortrait !== failedPortrait ? candidatePortrait : null;
  const duplicateNonCommittingClose = !dialog.commits
    && dialog.primaryLabel === "Close"
    && dialog.secondaryLabel === "Close";
  const secondaryLabel = duplicateNonCommittingClose ? null : dialog.secondaryLabel;
  const starterInspection = Boolean(dialog.speciesId && dialog.commits);
  const speciesArt = dialog.speciesId
    ? <img className="dialog-species" src={`/game/sprites/${dialog.speciesId}.png`} alt="" draggable={false} />
    : null;
  const nameplate = portrait || dialog.speaker ? (
    <div className="dialog-nameplate">
      {portrait ? <span className="dialog-role">{portrait.role}</span> : null}
      {dialog.speaker ? <span className="dialog-name">{dialog.speaker}</span> : null}
    </div>
  ) : null;
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
      className={`dialog-scene${portrait ? " dialog-scene-npc" : ""}${pixelPortrait ? " dialog-scene-pixel" : ""}${starterInspection ? " dialog-scene-starter" : ""}`}
      data-npc-id={dialog.npcId ?? undefined}
      role="dialog"
      aria-label={dialog.speaker || "Story"}
    >
      {portrait ? (
        <div className="dialog-portrait" aria-hidden="true">
          <img src={pixelPortrait ?? portrait.src} alt="" draggable={false}
            onError={pixelPortrait ? () => setFailedPortrait(pixelPortrait) : undefined} />
        </div>
      ) : null}
      <div className={`dialog${portrait ? " dialog-panel" : ""}`} data-portrait={dialog.portraitKey ?? "none"}>
        {starterInspection ? <div className="dialog-starter-heading">{speciesArt}{nameplate}</div> : null}
        <div
          className="dialog-content"
          ref={content}
          tabIndex={0}
          onKeyDown={(event) => {
            if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) event.stopPropagation();
          }}
        >
          {starterInspection ? null : speciesArt}
          <div className="dialog-copy">
            {starterInspection ? null : nameplate}
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
