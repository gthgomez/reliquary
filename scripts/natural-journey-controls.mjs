import { pathFor } from "./natural-journey-path.mjs";

/** Read the settled player position without driving the game through a probe. */
async function settledPosition(page) {
  const observed = await page.waitForFunction(() => {
    const probe = window.__controlsTest;
    if (probe.getSpeed() !== 0) return false;
    return probe.getPos();
  }, null, { timeout: 5000 });
  try {
    return await observed.jsonValue();
  } finally {
    await observed.dispose();
  }
}

/** Walk using keyboard events, replanning after immediate warp tiles or input drift. */
export async function walkTo(page, map, target, starterChosen = false) {
  let position = await settledPosition(page);
  if (position.map !== map.id) throw new Error(`Expected ${map.id}, at ${position.map}`);
  let stalled = 0;
  for (let attempt = 0; attempt < 150; attempt++) {
    const [step] = pathFor(map, position, target, starterChosen);
    if (!step) return position;
    if (step.warp) {
      // A warp takes effect before a normal tile step completes. Release on
      // the map change so a long input doesn't also walk past the threshold.
      await page.keyboard.down(step.key);
      try {
        const firstArrival = await page.waitForFunction((mapId) => {
          const pos = window.__controlsTest.getPos();
          return pos.map !== mapId && pos;
        }, map.id, { timeout: 5000 });
        try {
          return await firstArrival.jsonValue();
        } finally {
          await firstArrival.dispose();
        }
      } finally {
        await page.keyboard.up(step.key);
      }
    }
    // Hold across several frames but release before a normal tile can repeat.
    // Observe where the player actually stops before planning the next key.
    await page.keyboard.press(step.key, { delay: 85 });
    const next = await settledPosition(page);
    if (next.mode === "battle") return next;
    if (next.map !== map.id) {
      throw new Error(`Unexpected exit from ${map.id} toward ${step.x},${step.y}: ${JSON.stringify(next)}`);
    }
    stalled = next.x === position.x && next.y === position.y ? stalled + 1 : 0;
    position = next;
    if (stalled >= 5) break;
  }
  throw new Error(`Could not walk to ${map.id} (${target.x}, ${target.y}) from ${JSON.stringify(position)}`);
}

export async function faceDirection(page, key, yaw) {
  await page.keyboard.down(key);
  try {
    await page.waitForFunction((expected) => window.__controlsTest.getYaw() === expected, yaw, { timeout: 5000 });
  } finally {
    await page.keyboard.up(key);
  }
}
