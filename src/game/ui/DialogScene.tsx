import { useEffect, useRef } from "react";
import type { DialogView } from "../types.ts";
import { PORTRAITS } from "../portraits.ts";
import "./dialogue.css";

/** One button owns advance. Native Enter/Space and the engine's Z/X/A/B
 * arbitration stay intact; no extra key handlers or delayed exit targets. */
export function DialogScene({ dialog, onAdvance }: { dialog: DialogView; onAdvance: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const portrait = dialog.portraitKey ? PORTRAITS[dialog.portraitKey] : null;
  useEffect(() => {
    button.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className={`dialog-scene${portrait ? " dialog-scene-npc" : ""}`}
      data-npc-id={dialog.npcId ?? undefined}
    >
      {portrait ? (
        <div className="dialog-portrait" aria-hidden="true">
          <img src={portrait.src} alt="" draggable={false} />
        </div>
      ) : null}
      <button
        ref={button}
        type="button"
        className={`dialog${portrait ? " dialog-panel" : ""}`}
        onClick={onAdvance}
        data-portrait={dialog.portraitKey ?? "none"}
      >
        <span className="dialog-nameplate">
          {portrait ? <span className="dialog-role">{portrait.role}</span> : null}
          {dialog.speaker ? <span className="dialog-name">{dialog.speaker}</span> : null}
        </span>
        <span className="dialog-text" aria-live="polite" aria-atomic="true">
          {dialog.text}
        </span>
        <span className="dialog-next">{dialog.last ? "Close" : "Next"}</span>
      </button>
    </div>
  );
}
