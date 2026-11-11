/**
 * Advance through the Binding Grove starter flow using an explicit state machine.
 *
 * Sequence:
 * 1. Starter inspect description.
 * 2. Starter pact offer ("Speak the pact").
 * 3. Starter confirmation ("Bind <Species>").
 * 4. Naming prompt (nickname input or "Keep <Species>").
 * 5. Elder Maren conclusion dialogue.
 * 6. HUD companion and objective update.
 */
export async function finishStarterPact(page, options = {}) {
  const timeout = options.timeout ?? 10_000;
  const start = Date.now();
  const expectedSpecies = options.species ?? "Emberkit";
  const nickname = options.nickname ?? null;

  for (let step = 0; step < 20; step++) {
    if (Date.now() - start > timeout) {
      throw new Error(`finishStarterPact timed out after ${timeout}ms at step ${step}`);
    }

    // 1. Check if name prompt is open
    const namePrompt = page.locator(".name-prompt");
    if (await namePrompt.isVisible()) {
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

    // 2. Check if a confirmation button like "Bind Emberkit" is visible
    const bindBtn = page.getByRole("button", { name: /Bind / });
    if (await bindBtn.isVisible()) {
      await bindBtn.click();
      await page.waitForTimeout(100);
      continue;
    }

    // 3. Check if "Speak the pact" is visible
    const pactBtn = page.getByRole("button", { name: "Speak the pact", exact: true });
    if (await pactBtn.isVisible()) {
      await pactBtn.click();
      await page.waitForTimeout(100);
      continue;
    }

    // 4. Check if standard dialogue is visible
    const dialog = page.locator("button.dialog");
    if (await dialog.isVisible()) {
      await dialog.click();
      await page.waitForTimeout(100);
      continue;
    }

    // 5. If neither dialog nor name prompt is visible, check if starter pact is settled
    const companion = page.locator(".hud-companion-name");
    if (await companion.isVisible()) {
      const text = await companion.textContent();
      const expected = nickname ?? expectedSpecies;
      if (text && text.includes(expected)) {
        await page.waitForSelector(".hud-companion-hp", { timeout: 3000 });
        return;
      }
    }

    await page.waitForTimeout(100);
  }

  const diag = await page.evaluate(() => ({
    dialog: document.querySelector(".dialog")?.textContent ?? null,
    namePrompt: document.querySelector(".name-prompt")?.textContent ?? null,
    companion: document.querySelector(".hud-companion")?.textContent ?? null,
    buttons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()),
  }));
  throw new Error(`Starter pact failed to complete within 20 steps: ${JSON.stringify(diag)}`);
}
