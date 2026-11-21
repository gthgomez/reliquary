/**
 * Advance through the Binding Grove starter flow using an explicit state machine.
 *
 * Sequence:
 * 1. Starter inspect description.
 * 2. Starter element and skills.
 * 3. Starter confirmation ("Bind <Species>").
 * 4. Naming prompt (nickname input or "Keep <Species>").
 * 5. Elder Maren conclusion dialogue.
 * 6. HUD companion and objective update.
 */
export async function finishStarterPact(page, options = {}) {
  const timeout = options.timeout ?? 15_000;
  const start = Date.now();
  const expectedSpecies = options.species ?? "Emberkit";
  const nickname = options.nickname ?? null;

  while (Date.now() - start < timeout) {
    const dialog = page.locator(".dialog");
    const namePrompt = page.locator(".name-prompt");

    // 1. If neither dialog nor name prompt is visible, check if starter pact is settled
    if (!(await dialog.isVisible()) && !(await namePrompt.isVisible())) {
      const companion = page.locator(".hud-companion-name");
      if (await companion.isVisible()) {
        const text = await companion.textContent();
        const expected = nickname ?? expectedSpecies;
        if (text && text.includes(expected)) {
          await page.waitForSelector(".hud-companion-hp", { timeout: 3000 });
          return;
        }
      }
    }

    // 2. Check if name prompt is open
    if (await namePrompt.isVisible()) {
      if (options.onNamePrompt) {
        await options.onNamePrompt(page);
      }
      if (nickname) {
        const input = page.locator(".name-prompt input");
        await input.fill(nickname);
        await page.getByRole("button", { name: "Call them this" }).click();
      } else {
        const keepBtn = page.locator(".name-prompt button").filter({ hasText: /Keep/ });
        await keepBtn.click();
      }
      await page.waitForTimeout(100);
      continue;
    }

    // 3. Check for the explicit pact commitment.
    const bindBtn = dialog.getByRole("button", { name: `Bind ${expectedSpecies}`, exact: true });
    if (await bindBtn.isVisible()) {
      await bindBtn.click();
      await page.waitForTimeout(100);
      continue;
    }

    // 4. Check if another inspection or conclusion page is visible
    if (await dialog.isVisible()) {
      await dialog.locator(".dialog-next").click();
      await page.waitForTimeout(100);
      continue;
    }

    await page.waitForTimeout(100);
  }

  const diag = await page.evaluate(() => ({
    dialog: document.querySelector(".dialog")?.textContent ?? null,
    namePrompt: document.querySelector(".name-prompt")?.textContent ?? null,
    companion: document.querySelector(".hud-companion")?.textContent ?? null,
    buttons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()),
  }));
  throw new Error(`Starter pact failed to complete within ${timeout}ms: ${JSON.stringify(diag)}`);
}
