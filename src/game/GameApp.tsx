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

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
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
    window.__reliquary = { confirm: g.confirm, cancel: g.cancel, startNew: () => g.startNew() };
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
      g.exportFile = null;
      g.destroy();
      if (window.__reliquary?.confirm === g.confirm) delete window.__reliquary;
    };
    // boot once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playing = snap.mode === "world" || snap.mode === "shop" || snap.mode === "battle" || !!snap.dialog || !!snap.menu;
  const showTouch = snap.mode !== "boot" && snap.mode !== "title" && snap.mode !== "victory";

  return (
    <div className={`game-root${showTouch ? " has-touch" : ""}`}>
      <div className="stage" ref={stageRef}>
        <div
          className="viewport"
          style={{
            width: snap.cssW || snap.viewW * TILE,
            height: snap.cssH || snap.viewH * TILE,
            ["--ar" as string]: String(snap.viewW / snap.viewH),
          }}
        >
          <canvas
            ref={canvasRef}
            className={`game-canvas ${snap.mode === "title" || snap.mode === "boot" || snap.mode === "victory" ? "is-hidden" : ""}`}
            width={snap.viewW * TILE}
            height={snap.viewH * TILE}
          />
          {playing && snap.mode !== "battle" ? <Hud snap={snap} onMenu={() => g.toggleMenu()} /> : null}
          {snap.mode === "battle" ? <BattleHud game={g} snap={snap} /> : null}
          {snap.dialog ? <DialogBox snap={snap} onAdvance={() => g.confirm()} /> : null}
          {snap.menu ? <MenuPanel game={g} snap={snap} /> : null}
          {snap.mode === "shop" ? <ShopPanel game={g} snap={snap} /> : null}
          {snap.toast ? <Toast text={snap.toast} /> : null}
        </div>
        {snap.mode === "boot" ? <LoadingScreen progress={snap.loadProgress} /> : null}
        {snap.mode === "title" ? <TitleScreen game={g} snap={snap} /> : null}
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
            void file.text().then((text) => {
              g.importGame(text);
            });
          }}
        />
      </div>
      {showTouch ? <TouchPad game={g} /> : null}
    </div>
  );
}
