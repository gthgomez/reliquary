import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ReliquaryGame } from "../engine.ts";
import { createBattlePreview, loadPreviewAsset, type PreviewAsset } from "./battle-preview.ts";
import { PreviewPackageError } from "./runtime-package.ts";

type Slot = "creature" | "effect";

export default function AgesPreviewPanel({
  game,
  inBattle,
}: {
  game: ReliquaryGame;
  inBattle: boolean;
}) {
  const assets = useRef<Record<Slot, PreviewAsset | null>>({ creature: null, effect: null });
  const readout = useRef<HTMLDetailsElement>(null);
  const revision = useRef(0);
  const [labels, setLabels] = useState<Record<Slot, string>>({ creature: "", effect: "" });
  const [status, setStatus] = useState({
    code: "EMPTY",
    message: "Select a creature package to start.",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const slots = assets.current;
    return () => {
      revision.current += 1;
      game.battlePreview = null;
      for (const slot of ["creature", "effect"] as const) {
        slots[slot]?.image.close();
        slots[slot] = null;
      }
    };
  }, [game]);

  const resetReadout = () => {
    const element = readout.current;
    if (!element) return;
    for (const key of Object.keys(element.dataset)) {
      if (key.startsWith("agesPlayback")) delete element.dataset[key];
    }
  };

  const attach = () => {
    resetReadout();
    const { creature, effect } = assets.current;
    game.battlePreview = creature
      ? createBattlePreview(creature, effect, (data) => {
          const element = readout.current;
          if (!element) return;
          for (const [key, value] of Object.entries(data)) {
            const name = "agesPlayback" + key[0]!.toUpperCase() + key.slice(1);
            if (element.dataset[name] !== value) element.dataset[name] = value;
          }
        })
      : null;
  };

  const clear = (slot: Slot) => {
    assets.current[slot]?.image.close();
    assets.current[slot] = null;
    setLabels((previous) => ({ ...previous, [slot]: "" }));
    attach();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const slot = form.get("slot") === "effect" ? "effect" : "creature";
    const token = ++revision.current;
    setLoading(true);
    clear(slot);
    setStatus({ code: "LOADING", message: "Checking the selected package…" });
    try {
      const asset = await loadPreviewAsset(
        form.getAll("files") as File[],
        String(form.get("digest")),
      );
      if (revision.current !== token) {
        asset.image.close();
        return;
      }
      if (slot === "effect" && !asset.manifest.animations.impact) {
        asset.image.close();
        throw new PreviewPackageError(
          "INVALID_SCHEMA",
          "An effect package must contain an impact state.",
        );
      }
      if (
        slot === "creature" &&
        !asset.manifest.animations.idle &&
        !asset.manifest.animations.attack
      ) {
        asset.image.close();
        throw new PreviewPackageError(
          "INVALID_SCHEMA",
          "A creature package must contain idle or attack.",
        );
      }
      assets.current[slot] = asset;
      setLabels((previous) => ({
        ...previous,
        [slot]: `${asset.manifest.subject_id} · ${asset.candidateId} · ${asset.digest}`,
      }));
      attach();
      setStatus({
        code: "LOADED",
        message: "Preview loaded. Enter a battle with the selected species.",
      });
    } catch (error) {
      if (revision.current !== token) return;
      setStatus({
        code: error instanceof PreviewPackageError ? error.code : "LOAD_ERROR",
        message: error instanceof Error ? error.message : "Could not load the preview.",
      });
    } finally {
      if (revision.current === token) setLoading(false);
    }
  };

  return (
    <details
      ref={readout}
      id="ages-candidate-preview"
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        display: inBattle ? "none" : undefined,
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 100,
        maxWidth: "min(24rem, calc(100vw - 16px))",
        maxHeight: "75dvh",
        overflow: "auto",
        padding: 8,
        color: "#fff",
        background: "#202420",
        border: "1px solid #b7c09f",
        borderRadius: 6,
        font: "14px system-ui",
      }}
    >
      <summary style={{ cursor: "pointer", padding: 4 }}>AGES preview</summary>
      <p>Preview only · no approval or save writes</p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={loading} style={{ display: "grid", gap: 8, border: 0, padding: 4 }}>
          <label>
            Package role{" "}
            <select name="slot">
              <option value="creature">Creature</option>
              <option value="effect">Impact effect</option>
            </select>
          </label>
          <label>
            Trusted package SHA-256
            <input
              name="digest"
              type="text"
              required
              spellCheck={false}
              autoComplete="off"
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Four AGES runtime files
            <input
              name="files"
              type="file"
              multiple
              accept=".png,.json"
              required
              style={{ width: "100%" }}
            />
          </label>
          <button type="submit">Load preview</button>
          <button
            type="button"
            onClick={() => {
              clear("creature");
              clear("effect");
              setStatus({ code: "EMPTY", message: "Preview cleared." });
            }}
          >
            Clear previews
          </button>
        </fieldset>
      </form>
      <p role="status" data-ages-preview-status={status.code}>
        {status.message}
      </p>
      <dl style={{ overflowWrap: "anywhere" }}>
        <dt>Creature candidate</dt>
        <dd data-ages-preview-creature>{labels.creature || "None"}</dd>
        <dt>Effect candidate</dt>
        <dd data-ages-preview-effect>{labels.effect || "None"}</dd>
      </dl>
    </details>
  );
}
