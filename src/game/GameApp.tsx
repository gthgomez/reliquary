import { lazy, Suspense, useEffect, useRef, useSyncExternalStore } from "react";
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
import { isClassicTouchEnabled, isSoundMutedStored, isUiModalOpen, shouldShowDialogTouch, shouldShowExplorationTouch } from "./ui/ui-chrome.ts";
import { registerReliquaryServiceWorker, setUpdateGuard } from "../pwa/register.ts";
import { setMuted } from "./audio.ts";
import { acquireSaveSession } from "./save-session.ts";
import { attachEconomyProbes } from "reliquary-economy-probes";
import { attachBattleUiBrowserHooks } from "reliquary-battle-browser-probes";

declare const __RELIQUARY_BROWSER_TEST__: boolean;
declare const __RELIQUARY_AGES_PREVIEW__: boolean;

const AgesPreviewPanel = __RELIQUARY_AGES_PREVIEW__
  ? lazy(() => import("./preview/AgesPreviewPanel.tsx"))
  : null;

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const topStackRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const askedImport = useRef(0);
  const gameRef = useRef<ReliquaryGame | null>(null);
  const agesPreviewEnabled =
    AgesPreviewPanel !== null &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("ages-preview") === "1";
  const g =
    gameRef.current ??
    (gameRef.current = new ReliquaryGame(
      agesPreviewEnabled
        ? { readOnlySaveSource: { getItem: (key) => localStorage.getItem(`ages-preview:${key}`) } }
        : undefined,
    ));
  const snap = useSyncExternalStore(g.subscribe, g.getSnapshot, g.getSnapshot);

  useEffect(() => {
    if (snap.importTicket > askedImport.current) {
      askedImport.current = snap.importTicket;
      fileRef.current?.click();
    }
  }, [snap.importTicket]);
  // Called synchronously from the Import menu item's own click handler: a
  // programmatic click must run inside the user gesture or Safari drops it.
  const openImportPicker = () => {
    // Consume the upcoming ticket so the effect above does not click again.
    askedImport.current = snap.importTicket + 1;
    fileRef.current?.click();
  };

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
    // Restore the persisted sound preference before any gesture can unlock
    // audio, so a muted session stays muted from the first sound (S16).
    setMuted(isSoundMutedStored());
    let saveSession: { release: () => void } | null = null;
    let disposed = false;
    if (!agesPreviewEnabled) {
      // Web-Locks browsers start write-blocked: an acquisition that is still
      // pending must never authorize durable writes. The documented fallback
      // for browsers without Web Locks keeps writes allowed (no cross-tab
      // safety is claimed for that path).
      g.setSaveWriteAllowed(false);
      void acquireSaveSession().then(({ result, session }) => {
        if (disposed) {
          // Unmounted before the lock resolved: release it immediately so a
          // later tab is not locked out by a document that is already gone.
          session?.release();
          return;
        }
        saveSession = session;
        if (result === "denied") {
          g.setSaveWriteAllowed(false, "Another Reliquary window holds the save lock. This tab is read-only.");
        } else {
          g.setSaveWriteAllowed(true);
        }
      });
    }
    // A new build applies itself by reloading, but only at a calm moment and
    // only after a successful flush: a failed or throwing required save vetoes
    // the reload (see register.ts) so unflushed live changes are never lost.
    setUpdateGuard({
      canReloadNow: () => {
        const s = g.getSnapshot();
        return (s.mode === "title" || s.mode === "world" || s.mode === "victory") && !s.dialog && !s.menu && !isUiModalOpen(s);
      },
      canForceReload: () => {
        const s = g.getSnapshot();
        // Consequential context (a dialog whose final action commits a choice)
        // outlives the overdue/hidden path: a reload here would drop the offer
        // without its outcome. Pure-text pages may still force.
        if (s.mode === "battle" || s.dialog?.commits) return false;
        return true;
      },
      beforeReload: () => {
        const mode = g.getSnapshot().mode;
        if (mode === "title" || mode === "boot" || mode === "battle") return "clean";
        // A denied writer cannot make the required save durable: report the
        // failure (no toast — the blocked status is the persistent surface).
        if (!g.canWriteSave) return "failed";
        return g.persist() ? "flushed" : "failed";
      },
    });
    if (!agesPreviewEnabled) void registerReliquaryServiceWorker();
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
      disposed = true;
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
        // S09: actual focus starts on the engine's visible selection, so
        // Enter/Space act on the highlighted row. Listless panels fall back
        // to the close button.
        const activeRow = document.querySelector<HTMLButtonElement>(
          ".overlay-panel .menu-list button.active, .overlay-panel .shop-list button.active",
        );
        if (activeRow && !activeRow.disabled) {
          // The shared panel reveals focused rows within its scrolling body.
          activeRow.focus({ preventScroll: true });
          return;
        }
        document.querySelector<HTMLElement>(".overlay-panel-close")?.focus({ preventScroll: true });
      });
      return;
    }
    if (!wasUiModal.current) return;
    wasUiModal.current = false;
    requestAnimationFrame(() => {
      menuButtonRef.current?.focus({ preventScroll: true });
    });
  // cardMenu?.uid: a nested sheet swaps panels without changing menu/mode,
  // so focus would fall to <body> between the unmount and the next Tab.
  }, [uiModal, snap.menu, snap.mode, snap.cardMenu?.uid]);

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
      className={`game-root${showTouch ? " has-touch" : ""}${showExplorationTouch ? " has-explore-touch" : ""}${showDialogTouch ? " has-dialog-touch" : ""}${classicTouch ? " classic-touch" : ""}${uiModal ? " is-ui-modal" : ""}${snap.dialog ? " is-dialog" : ""}${snap.dialog?.portraitKey ? " is-dialog-portrait" : ""}${snap.mode === "battle" ? " is-battle" : ""}${battleSubmenuRootClass(snap.battle?.phase)}`}
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
          {/* The HUD makes its own dormant subtree inert. Keep the adjacent
              live-status toast outside that subtree during portrait dialogue. */}
          <div className={`top-stack${uiModal ? " top-stack-dormant" : ""}`} ref={topStackRef} inert={uiModal}>
            {showHudBar ? (
              <Hud
                snap={snap}
                menuButtonRef={menuButtonRef}
                dormant={uiModal || !!snap.dialog?.portraitKey}
                onMenu={() => g.toggleMenu()}
              />
            ) : null}
            {snap.toast && !uiModal ? <Toast text={snap.toast} /> : null}
          </div>
          {snap.mode === "battle" ? <BattleHud game={g} snap={snap} /> : null}
          {snap.dialog ? <DialogBox snap={snap} onAdvance={() => g.confirm()} /> : null}
          {snap.menu ? <MenuPanel game={g} snap={snap} onImportActivate={openImportPicker} /> : null}
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
          tabIndex={-1}
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
      {agesPreviewEnabled && AgesPreviewPanel ? (
        <Suspense fallback={null}>
          <AgesPreviewPanel game={g} inBattle={snap.mode === "battle"} />
        </Suspense>
      ) : null}
      {showTouch ? <TouchPad game={g} variant={showDialogTouch && !showExplorationTouch ? "dialog" : "full"} /> : null}
    </div>
  );
}
