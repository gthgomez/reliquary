/** Advance through the Binding Grove starter offer until the HUD shows the pact. */
export async function finishStarterPact(page) {
  await page.waitForFunction(() => {
    const name = document.querySelector(".hud-companion-name");
    const hp = document.querySelector(".hud-companion-hp");
    return name?.textContent?.includes("Emberkit") && /\d+\/\d+/.test(hp?.textContent ?? "");
  }, null, { timeout: 45_000 }).catch(async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const done = await page.evaluate(() => {
        const hp = document.querySelector(".hud-companion-hp")?.textContent ?? "";
        return document.querySelector(".hud-companion-name")?.textContent === "Emberkit" && /\d+\/\d+/.test(hp);
      });
      if (done) return;
      const pact = page.getByRole("button", { name: "Speak the pact", exact: true });
      if (await pact.count()) {
        await pact.click();
        continue;
      }
      const dialog = page.locator("button.dialog");
      if (await dialog.count()) {
        await dialog.click();
        continue;
      }
      await page.keyboard.press("KeyA");
      await page.waitForTimeout(120);
    }
    throw new Error("Starter pact did not appear in the HUD");
  });
  for (let i = 0; i < 6 && (await page.locator("button.dialog").count()); i++) {
    await page.locator("button.dialog").click();
  }
  await page.waitForSelector("button.dialog", { state: "detached", timeout: 5000 }).catch(() => {});
}
