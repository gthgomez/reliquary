import type { DialogView } from "../types.ts";
import { PORTRAIT_GLOW } from "../portraits.ts";
import { NpcPortrait } from "./NpcPortrait";

/**
 * Cinematic NPC focus scene layered over the world canvas: a scrim that
 * de-emphasizes the room, a framed portrait with a name plaque, and the
 * readable dialogue bar. The portrait is decorative — identity and text are
 * carried by real DOM text, and the whole scene stays a plain button flow so
 * keyboard, touch A/B and `.dialog` taps all keep working.
 */
export function NpcDialogScene({
  dialog,
  onAdvance,
}: {
  dialog: DialogView;
  onAdvance: () => void;
}) {
  const glow = dialog.portraitKey ? PORTRAIT_GLOW[dialog.portraitKey] : undefined;
  return (
    <div className="npc-scene" role="dialog" aria-label={dialog.speaker || "Dialogue"}>
      <div className="npc-scrim" aria-hidden="true" />
      <div className="npc-scene-portrait" aria-hidden="true">
        <div className="npc-portrait-frame" style={glow ? { ["--portrait-glow" as string]: glow } : undefined}>
          {dialog.portraitKey ? <NpcPortrait portrait={dialog.portraitKey} label={dialog.speaker} /> : null}
        </div>
        <div className="npc-plaque">
          <span className="npc-plaque-name">{dialog.speaker}</span>
        </div>
      </div>
      <button type="button" className="dialog npc-scene-dialog" onClick={onAdvance}>
        <p className="dialog-text dialog-text-npc" aria-live="polite">
          {dialog.text}
        </p>
        <span className="dialog-next">{dialog.last ? "Close" : "Next"}</span>
      </button>
    </div>
  );
}
