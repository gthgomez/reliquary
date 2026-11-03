import assert from "node:assert/strict";
import { test } from "node:test";
import { computeBattleLayout } from "./battle-scene.ts";

test("battle layout keeps sprites above the HUD reserve band", () => {
  for (const [cw, ch] of [
    [320, 512],
    [384, 288],
    [384, 512],
  ] as const) {
    const layout = computeBattleLayout(cw, ch);
    assert.ok(layout.uiReserveTop > ch * 0.4, `${cw}x${ch} reserve`);
    assert.ok(layout.foe.y + layout.foe.h < layout.uiReserveTop, `${cw}x${ch} foe clears HUD`);
    assert.ok(layout.player.cy + layout.player.size * layout.player.scale * 0.5 < layout.uiReserveTop, `${cw}x${ch} player clears HUD`);
    assert.ok(layout.foe.x + layout.foe.w <= cw, `${cw}x${ch} foe in bounds`);
    assert.ok(layout.player.cx > layout.player.size * 0.2, `${cw}x${ch} player left band`);
  }
});

test("battle layout scales foe footprint on narrow widths", () => {
  const narrow = computeBattleLayout(280, 448);
  const wide = computeBattleLayout(384, 288);
  assert.ok(narrow.foe.w <= wide.foe.w + 8);
  assert.ok(narrow.foe.x >= 8);
});
