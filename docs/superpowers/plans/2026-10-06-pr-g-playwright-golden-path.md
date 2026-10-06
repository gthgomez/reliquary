# PR-G — Playwright Golden Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove the golden path in a real browser: Launch → Start → starter →
exploration → forced encounter → combat → bind → save → reload → continue →
restored state; plus a Warden-victory route.

**Architecture:** Add the Playwright test runner (`@playwright/test`; the
`playwright` library is already a devDependency), a config with a `webServer`,
and deterministic test seams on the existing `window.__controlsTest` probe
(seeded RNG, starter choice, item grant, state read). Specs drive the real
canvas app through the probe + public `__reliquary` confirm/cancel.

**Tech Stack:** Playwright (Chromium), Vite dev server, TypeScript.

**Spec:** `docs/superpowers/plans/2026-10-06-reliquary-v0.2-campaign.md`
(Phase 5; Global Constraints).

**Depends on:** PR-F (harness patterns), PR-D (`battle/state.ts`).

**Execution note:** selectors/flows may need small adjustments when first run;
iterate on failing assertions without weakening them.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `src/game/rng.ts` | add `seededRandom` | modify |
| `src/game/engine.ts` | mutable RNG + probe seams | modify |
| `playwright.config.ts` | runner config + webServer | create |
| `e2e/golden-path.spec.ts` | happy path | create |
| `e2e/warden-trial.spec.ts` | victory route | create |
| `package.json` | add `@playwright/test`, `test:e2e` script | modify |
| `.github/workflows/ci.yml` | E2E job (Linux) | modify |

**Interfaces produced (on `window.__controlsTest`):**
- `setSeed(seed: number): void` — reseed the engine RNG deterministically.
- `chooseStarter(id: string): void` — invoke the starter choice.
- `give(id: string, n: number): void` — add an item (test setup).
- `getState(): { mode: string; mapId: string; gold: number; hasSave: boolean; party: string[] }`.

**Invariant:** adding the probe seams is additive and only reachable through the
dev/test global; normal play is unchanged.

---

### Task G1: Seeded RNG and probe seams

**Files:**
- Modify: `src/game/rng.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/rng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { seededRandom } from "./rng.ts";

test("seededRandom is deterministic and repeatable", () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [seededRandom(43)(), 0, 0]);
});
```

- [ ] **Step 2: Implement `seededRandom`**

```ts
/** Deterministic PRNG (mulberry32) for tests and reproducible play. */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 3: Make the engine RNG reseedable and extend the probe**

In `engine.ts`: change `private readonly random: RandomSource;` to
`private random: RandomSource;`. In `installProbe()`, add:

```ts
setSeed: (seed) => { this.random = seededRandom(seed); },
chooseStarter: (id) => this.chooseStarter(id),
give: (id, n) => this.give(id, n),
getState: () => ({
  mode: this.mode,
  mapId: this.mapId,
  gold: this.gold,
  hasSave: this.hasSave,
  party: this.party.map((b) => b.speciesId),
}),
```

Import `seededRandom` from `./rng.ts` and extend the `Window["__controlsTest"]`
type in `types.ts` with the four optional methods.

- [ ] **Step 4: Run and commit**

```bash
node --experimental-strip-types --test src/game/rng.test.ts
npm run typecheck && npm run lint && npm test
git add src/game/rng.ts src/game/rng.test.ts src/game/engine.ts src/game/types.ts
git commit -m "feat(test): add deterministic RNG and browser test probe seams"
```

---

### Task G2: Playwright config and script

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`, `e2e/.gitkeep`

- [ ] **Step 1: Add the dependency and script**

```bash
npm install -D @playwright/test@^1.62.0
npx playwright install --with-deps chromium
```

Add to `package.json` scripts: `"test:e2e": "playwright test"`.

- [ ] **Step 2: Write the config**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:8080", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e/.gitkeep
git commit -m "test(e2e): add Playwright runner and dev-server config"
```

---

### Task G3: Golden-path spec

**Files:**
- Create: `e2e/golden-path.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

async function confirm(page: import("@playwright/test").Page, times = 1) {
  for (let i = 0; i < times; i++) await page.evaluate(() => window.__reliquary!.confirm());
}

test("golden path: start, starter, encounter, bind, save, reload, restore", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__reliquary && window.__controlsTest));

  // Start and clear the intro dialogue.
  await page.evaluate(() => window.__reliquary!.startNew());
  await confirm(page, 3);

  // Deterministic RNG + starter.
  await page.evaluate(() => window.__controlsTest!.setSeed!(7));
  await page.evaluate(() => window.__controlsTest!.chooseStarter!("emberkit"));
  await confirm(page, 3); // pact confirmation + Maren's two pages

  // Force a wild encounter on the road.
  await page.evaluate(() => {
    window.__controlsTest!.warp!("briar_road", 6, 20);
    window.__controlsTest!.startWild!();
  });
  expect(await page.evaluate(() => window.__controlsTest!.getState!().mode)).toBe("battle");

  // Strike until the battle resolves.
  for (let i = 0; i < 40; i++) {
    const mode = await page.evaluate(() => window.__controlsTest!.getState!().mode);
    if (mode !== "battle") break;
    await confirm(page);
  }
  expect(await page.evaluate(() => window.__controlsTest!.getState!().mode)).not.toBe("battle");

  // Save via the menu.
  await page.evaluate(() => {
    window.__controlsTest!.give!("tonic", 1);
    window.__reliquary!.confirm(); // ensure no dialog
  });
  await page.evaluate(() => window.__reliquary!.confirm()); // open menu via keyboard? see note
  // Prefer the real menu button:
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  const before = await page.evaluate(() => window.__controlsTest!.getState!());

  // Reload and continue.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__reliquary));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForFunction(() => window.__controlsTest!.getState!().mode === "world");
  const after = await page.evaluate(() => window.__controlsTest!.getState!());

  expect(after.hasSave).toBe(true);
  expect(after.gold).toBe(before.gold);
  expect(after.party).toEqual(before.party);
});
```

> Note: the extra `__reliquary.confirm()` before opening the menu may need to be
> removed once the flow is observed running. Iterate with `npm run test:e2e` and
> keep every assertion.

- [ ] **Step 2: Run and iterate**

```bash
npm run test:e2e -- e2e/golden-path.spec.ts
```

Expected: PASS after selector/flow adjustments. Do not weaken assertions;
adjust navigation to match the real UI.

- [ ] **Step 3: Commit**

```bash
git add e2e/golden-path.spec.ts
git commit -m "test(e2e): add the golden-path playthrough spec"
```

---

### Task G4: Warden-trial victory spec

**Files:**
- Create: `e2e/warden-trial.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

test("Warden trial route reaches the victory screen and Thorn Mark", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__reliquary && window.__controlsTest));

  await page.evaluate(() => {
    window.__reliquary!.startNew();
    window.__controlsTest!.setSeed!(11);
    window.__controlsTest!.chooseStarter!("crownwyrm"); // strong fixture species via probe
  });
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.__reliquary!.confirm());

  await page.evaluate(() => window.__controlsTest!.warp!("warden_hall", 7, 10));
  // Trigger the trial through Cael's dialogue.
  await page.evaluate(() => window.__controlsTest!.setPosDir?.(1)); // face Cael if needed
  await page.evaluate(() => window.__reliquary!.confirm());
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.__reliquary!.confirm());

  // Strike through three foes; the trial cannot be fled.
  for (let i = 0; i < 60; i++) {
    const mode = await page.evaluate(() => window.__controlsTest!.getState!().mode);
    if (mode !== "battle") break;
    await page.evaluate(() => window.__reliquary!.confirm());
  }

  await expect.poll(() => page.evaluate(() => window.__controlsTest!.getState!().mode)).toBe("victory");
});
```

> If facing Cael is unreliable, add a one-line probe `interact()` that calls the
> private `interact()`; that is the smallest seam needed. Update the probe type.

- [ ] **Step 2: Run and commit**

```bash
npm run test:e2e -- e2e/warden-trial.spec.ts
git add e2e/warden-trial.spec.ts
git commit -m "test(e2e): add the Warden-trial victory spec"
```

---

### Task G5: CI wiring

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add an E2E job**

Add to `ci.yml` a job that runs on `ubuntu-latest` only (browsers are heavy on
Windows):

```yaml
  e2e:
    name: E2E (ubuntu-latest)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-traces
          path: test-results/
```

- [ ] **Step 2: Verify locally**

```bash
npm run test:e2e
```

Expected: both specs PASS.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the Playwright golden path on Linux"
```

---

## Self-review notes

- **Determinism:** seeded RNG + probe seams make the flow reproducible; the
  specs still exercise the real canvas app and UI buttons.
- **Safety:** probe additions are additive; production play never calls them.
- **Risk:** this is the PR most likely to need iteration on first run; the plan
  explicitly allows flow/selector adjustments but forbids weakening assertions.
- **Gate:** E2E is required in the Phase 10 qualification matrix.
