import assert from "node:assert/strict";
import { test } from "node:test";
import { ReliquaryGame, TILE, VIEW_H_PORT, VIEW_W_PORT } from "./engine.ts";
import { adjustCamYForHudInset } from "./render/world-camera-safe.ts";

function gameWithCanvas() {
  const game = new ReliquaryGame();
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  game.canvas = canvas;
  game.mode = "world";
  return { game, canvas };
}

test("portrait exploration uses phone width and respects the reserved control strip", () => {
  const { game, canvas } = gameWithCanvas();
  // The caller has already removed the control strip and safe-area padding.
  game.layout(390, 708, true);
  assert.deepEqual([canvas.width, canvas.height, game.cssW, game.cssH], [320, 576, 390, 702]);
  assert.equal(game.viewH, 18, "Elderhall must not expose area below the 18-tile map");

  game.layout(390, 548, true);
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 449);
  assert.equal(game.cssW, 390);
  assert.ok(game.cssH <= 548 && game.cssH >= 546);
  assert.ok(Math.abs(game.cssW / canvas.width - game.cssH / canvas.height) < 0.004, "art is uniformly scaled");
});

test("short maps, large maps, resizes and save state retain safe bounds", () => {
  const { game, canvas } = gameWithCanvas();
  const originalSave = game.currentSave();
  let notifications = 0;
  game.subscribe(() => { notifications += 1; });
  game.layout(390, 708, true);
  game.layout(390, 708, true);
  assert.equal(notifications, 1, "unchanged ResizeObserver measurements do not emit again");
  assert.deepEqual(game.currentSave(), originalSave, "camera dimensions do not alter save data");

  game.mapId = "home"; // 9 tiles high: do not make its existing empty area larger.
  game.layout(390, 708, true);
  assert.deepEqual([canvas.width, canvas.height, game.cssW, game.cssH], [320, 512, 390, 624]);
  game.layout(390, 548, true);
  assert.equal(canvas.height, 449, "short phones still use the available width in interiors");

  game.mapId = "briar_road"; // A taller map may use more of a very tall screen, with a cap.
  game.layout(390, 1100, true);
  assert.equal(canvas.height, 20 * TILE);
  assert.ok(game.cssH <= 1100);
});

test("title, battle, menu, dialogue and physical landscape retain their former canvas sizes", () => {
  const { game, canvas } = gameWithCanvas();
  const expectLegacy = (label: string) => {
    game.layout(390, 708, true);
    assert.deepEqual([canvas.width, canvas.height], [VIEW_W_PORT * TILE, VIEW_H_PORT * TILE], label);
  };
  game.mode = "title";
  expectLegacy("title");
  game.mode = "battle";
  expectLegacy("battle");
  game.mode = "world";
  game.menu = "root";
  expectLegacy("menu");
  game.menu = null;
  game.dialog = { speaker: "", pages: [""], index: 0, npcId: null, portraitKey: null };
  expectLegacy("dialogue");
  game.dialog = null;
  // Landscape can leave a tall content box after side-control padding; it must not use adaptive portrait mode.
  game.layout(304, 320, false);
  assert.deepEqual([canvas.width, canvas.height, game.cssW, game.cssH], [320, 512, 200, 320]);
  game.layout(844, 390, false);
  assert.deepEqual([canvas.width, canvas.height], [384, 288]);
});

test("the expanded Elderhall view still clears the HUD and contains the player at map edges", () => {
  const { game } = gameWithCanvas();
  game.layout(390, 708, true);
  const canvasHeight = game.ch();
  const hudInset = 123; // About 150 CSS px at this scale, including a visible toast.
  for (let tileY = 0; tileY < 18; tileY += 1) {
    const py = tileY * TILE;
    const camY = Math.max(0, Math.min(py - (game.viewH / 2 - 0.5) * TILE, 18 * TILE - canvasHeight));
    const headY = py - TILE * 0.5 - camY;
    const state = { relief: 0, contentPanY: 0 };
    let result = adjustCamYForHudInset(camY, headY, hudInset, state);
    for (let i = 0; i < 160; i += 1) result = adjustCamYForHudInset(camY, headY, hudInset, state);
    const feetY = py + TILE - result.camY + result.contentPanY;
    assert.ok(result.effectiveHeadCanvasY >= hudInset + 3, `row ${tileY} clears the HUD once the camera settles`);
    assert.ok(feetY <= canvasHeight + 0.1, `row ${tileY} stays above controls`);
  }
});
