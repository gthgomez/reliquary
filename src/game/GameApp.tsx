import { useEffect, useRef, useSyncExternalStore } from "react";
import { ReliquaryGame, TILE } from "./engine";
import {
  BattleHud,
  DialogBox,
  Hud,
  LoadingScreen,
  MenuPanel,
  ShopPanel,
  TitleScreen,
  Toast,
  TouchPad,
  VictoryScreen,
} from "./ui/Overlays";
import { AppStatus } from "./ui/AppStatus";
import { battleSubmenuRootClass } from "./ui/battle-chrome.ts";
import { formatUiSafeTopPx } from "./ui/ui-geometry.ts";
import { isClassicTouchEnabled, isUiModalOpen, shouldShowDialogTouch, shouldShowExplorationTouch } from "./ui/ui-chrome.ts";
import { registerReliquaryServiceWorker, setUpdateGuard } from "../pwa/register.ts";
import { acquireSaveSession } from "./save-session.ts";
import { attachEconomyProbes } from "reliquary-economy-probes";
import { attachBattleUiBrowserHooks } from "reliquary-battle-browser-probes";

declare const __RELIQUARY_BROWSER_TEST__: boolean;

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const topStackRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const askedImport = useRef(0);
  const gameRef = useRef<ReliquaryGame | null>(null);
  const g = gameRef.current ?? (gameRef.current = new ReliquaryGame());
  const snap = useSyncExternalStore(g.subscribe, g.getSnapshot, g.getSnapshot);

  useEffect(() => {
    if (snap.importTicket > askedImport.current) {
      askedImport.current = snap.importTicket;
      fileRef.current?.click();
    }
  }, [snap.importTicket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas) return;
    // Hand the player their save as a file, so a cleared browser or a new
    // device is not the end of the story.
    g.exportFile = (name, text) => {
      let url: string | null = null;
      try {
        url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return true;
      } catch {
        return false;
      } finally {
        if (url) {
          const revoke = url;
          setTimeout(() => URL.revokeObjectURL(revoke), 10_000);
        }
      }
    };
    void g.boot(canvas);
    let saveSession: { release: () => void } | null = null;
    void acquireSaveSession().then(({ result, session }) => {
      saveSession = session;
      if (result === "denied") {
        g.setSaveWriteAllowed(false, "Another Reliquary window holds the save lock. This tab is read-only.");
      }
    });
    // A new build applies itself by reloading, but only at a calm moment and
    // after flushing the save, so an update never interrupts a battle or dialog.
    setUpdateGuard({
      canReloadNow: () => {
        const s = g.getSnapshot();
        return (s.mode === "title" || s.mode === "world" || s.mode === "victory") && !s.dialog && !s.menu && !isUiModalOpen(s);
      },
      canForceReload: () => g.getSnapshot().mode !== "battle",
      beforeReload: () => {
        const mode = g.getSnapshot().mode;
        if (mode !== "title" && mode !== "boot" && mode !== "battle" && g.canWriteSave) g.persist();
      },
    });
    void registerReliquaryServiceWorker();
    const reliquaryHandle = {
      confirm: g.confirm,
      cancel: g.cancel,
      startNew: () => g.startNew(),
      openMenu: () => g.toggleMenu(),
    };
    attachEconomyProbes(reliquaryHandle, g);
    attachBattleUiBrowserHooks(reliquaryHandle, g, __RELIQUARY_BROWSER_TEST__);
    window.__reliquary = reliquaryHandle;
    const apply = () => {
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      const cs = getComputedStyle(stage);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      g.layout(Math.max(0, r.width - padX), Math.max(0, r.height - padY));
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (stage) ro.observe(stage);
    return () => {
      ro.disconnect();
      saveSession?.release();
      setUpdateGuard(null);
      g.exportFile = null;
      g.destroy();
      if (window.__reliquary?.confirm === g.confirm) delete window.__reliquary;
    };
    // boot once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playing =
    snap.mode === "world" ||
    snap.mode === "shop" ||
    snap.mode === "battle" ||
    !!snap.dialog ||
    !!snap.menu;
  const uiModal = isUiModalOpen(snap);
  const classicTouch = isClassicTouchEnabled();
  const showHudBar = playing && snap.mode !== "battle";
  const showExplorationTouch = shouldShowExplorationTouch(snap, classicTouch);
  const showDialogTouch = shouldShowDialogTouch(snap, classicTouch);
  const showTouch = showExplorationTouch || showDialogTouch;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasUiModal = useRef(false);

  useEffect(() => {
    if (uiModal) {
      wasUiModal.current = true;
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".overlay-panel-close")?.focus({ preventScroll: true });
      });
      return;
    }
    if (!wasUiModal.current) return;
    wasUiModal.current = false;
    requestAnimationFrame(() => {
      menuButtonRef.current?.focus({ preventScroll: true });
    });
  }, [uiModal, snap.menu, snap.mode]);

  useEffect(() => {
    const stage = stageRef.current;
    const stack = topStackRef.current;
    if (!stage || !stack) return;
    const viewport = stage.querySelector<HTMLElement>(".viewport");
    if (!viewport) return;
    const applySafeTop = () => {
      const vr = viewport.getBoundingClientRect();
      const sr = stack.getBoundingClientRect();
      if (sr.height <= 0) {
        viewport.style.removeProperty("--ui-safe-top-px");
        return;
      }
      viewport.style.setProperty("--ui-safe-top-px", formatUiSafeTopPx(sr.bottom - vr.top));
    };
    applySafeTop();
    const ro = new ResizeObserver(applySafeTop);
    ro.observe(stack);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [showHudBar, snap.toast, uiModal, snap.objective, snap.mode]);

  return (
    <div
      className={`game-root${showTouch ? " has-touch" : ""}${showExplorationTouch ? " has-explore-touch" : ""}${showDialogTouch ? " has-dialog-touch" : ""}${classicTouch ? " classic-touch" : ""}${uiModal ? " is-ui-modal" : ""}${snap.dialog ? " is-dialog" : ""}${snap.mode === "battle" ? " is-battle" : ""}${battleSubmenuRootClass(snap.battle?.phase)}`}
    >
      <div className="stage" ref={stageRef}>
        <div
          className="viewport"
          style={{
            width: snap.cssW || snap.viewW * TILE,
            height: snap.cssH || snap.viewH * TILE,
            ["--ar" as string]: String(snap.viewW / snap.viewH),
            ["--ui-safe-top-px" as string]: "0",
          }}
        >
          <canvas
            ref={canvasRef}
            className={`game-canvas ${snap.mode === "title" || snap.mode === "boot" || snap.mode === "victory" ? "is-hidden" : ""}`}
            width={snap.viewW * TILE}
            height={snap.viewH * TILE}
          />
          {uiModal ? (
            <div
              className="ui-scrim"
              aria-hidden
              onClick={() => g.cancel()}
              onPointerDown={(event) => event.preventDefault()}
            />
          ) : null}
          {/* HUD and toast share one top column so the toast always lands below the HUD. */}
          <div className={`top-stack${uiModal ? " top-stack-dormant" : ""}`} ref={topStackRef}>
            {showHudBar ? (
              <Hud
                snap={snap}
                menuButtonRef={menuButtonRef}
                dormant={uiModal}
                onMenu={() => g.toggleMenu()}
              />
            ) : null}
            {snap.toast && !uiModal ? <Toast text={snap.toast} /> : null}
          </div>
          {snap.mode === "battle" ? <BattleHud game={g} snap={snap} /> : null}
          {snap.dialog ? <DialogBox snap={snap} onAdvance={() => g.confirm()} /> : null}
          {snap.menu ? <MenuPanel game={g} snap={snap} /> : null}
          {snap.mode === "shop" ? <ShopPanel game={g} snap={snap} /> : null}
          {uiModal && snap.toast ? <Toast text={snap.toast} className="toast-modal" /> : null}
        </div>
        {snap.mode === "boot" ? <LoadingScreen progress={snap.loadProgress} /> : null}
        {snap.mode === "title" ? <TitleScreen game={g} snap={snap} /> : null}
        <AppStatus />
        {snap.mode === "victory" ? <VictoryScreen game={g} /> : null}
        <input
          ref={fileRef}
          className="save-file-input"
          type="file"
          accept="application/json,.json"
          aria-label="Import a Reliquary save file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const MAX_IMPORT_BYTES = 512 * 1024;
            if (file.size > MAX_IMPORT_BYTES) {
              g.toastMsg("Save file is too large to import.");
              return;
            }
            void file
              .text()
              .catch(() => {
                g.toastMsg("Could not read that save file.");
                return null;
              })
              .then((text) => {
                if (text != null) g.importGame(text);
              });
          }}
        />
      </div>
      {showTouch ? <TouchPad game={g} variant={showDialogTouch && !showExplorationTouch ? "dialog" : "full"} /> : null}
    </div>
  );
}
