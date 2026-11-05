import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

async function bootWorld(page) {
  await page.click("text=Start");
  for (let i = 0; i < 16; i += 1) {
    if ((await page.locator(".dialog").count()) === 0) break;
    await page.locator(".dialog").click({ timeout: 2000 }).catch(() => page.keyboard.press("Enter"));
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(".hud-menu", { timeout: 15_000 });
}

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    await waitForGameBoot(page);
    await bootWorld(page);

    await page.evaluate(() => {
      window.__reliquary?.setGold?.(35);
      window.__reliquary?.openShop?.();
    });
    await page.waitForSelector(".shop-list");
    await page.waitForSelector(".shop-buy-btn");

    const start = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    assert.ok(start);
    assert.equal(start.gold, 35);

    await page.locator(".shop-row.unaffordable").first().click();
    const afterSelect = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    assert.deepEqual(afterSelect, start, "selecting unaffordable row does not spend crowns");

    const buyDisabled = await page.locator(".shop-buy-btn").isDisabled();
    assert.equal(buyDisabled, true, "Buy disabled when unaffordable");
    await page.locator(".shop-buy-btn").click({ force: true });
    const afterBadBuy = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    assert.deepEqual(afterBadBuy, start, "forced Buy on disabled button does not deduct");

    await page.locator(".shop-row.affordable").first().click();
    await page.locator(".shop-buy-btn").click();
    const afterOne = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    assert.equal(afterOne.gold, 15, "exactly one affordable purchase deducts item price");
    assert.equal(afterOne.inventory.tonic, (start.inventory.tonic ?? 0) + 1, "inventory gains one tonic");

    assert.equal(await page.locator(".shop-buy-btn").isDisabled(), true, "second Buy blocked at 15 cr");
    await page.locator(".shop-buy-btn").click({ force: true });
    const afterBlocked = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    assert.deepEqual(afterBlocked, afterOne, "no second deduction when unaffordable");

    // S04: the Sell tab exposes a real commit action; a row click only selects.
    await page.locator(".shop-tabs button", { hasText: "Sell" }).click();
    await page.waitForFunction(() =>
      document.querySelector(".shop-buy-btn")?.textContent?.includes("Sell for"),
    );
    await page.locator(".shop-row").first().click();
    const beforeSell = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    const sellLabel = await page.locator(".shop-buy-btn").innerText();
    assert.match(sellLabel, /^Sell for \d+ cr$/, `explicit sell action with the defined price, got: ${sellLabel}`);
    assert.deepEqual(
      await page.evaluate(() => window.__reliquary?.getEconomy?.()),
      beforeSell,
      "row activation selects, it never sells",
    );
    // Cancel/leave from the selection: still no sale.
    await page.evaluate(() => window.__reliquary?.cancel?.());
    await page.waitForFunction(() => document.querySelector(".shop-list") == null);
    await page.evaluate(() => window.__reliquary?.openShop?.());
    await page.waitForSelector(".shop-list");
    await page.locator(".shop-tabs button", { hasText: "Sell" }).click();
    await page.waitForFunction(() =>
      document.querySelector(".shop-buy-btn")?.textContent?.includes("Sell for"),
    );
    await page.locator(".shop-row").first().click();
    const beforeSecond = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    await page.locator(".shop-buy-btn").click();
    const afterSell = await page.evaluate(() => window.__reliquary?.getEconomy?.());
    const price = Number(/Sell for (\d+) cr/.exec(sellLabel)[1]);
    assert.equal(afterSell.gold, beforeSecond.gold + price, "exactly one accepted sale adds the half price once");
    const changedKeys = Object.keys(afterSell.inventory).filter(
      (k) => (afterSell.inventory[k] ?? 0) !== (beforeSecond.inventory[k] ?? 0),
    );
    assert.equal(changedKeys.length, 1, "exactly one inventory line changed");
    assert.equal(afterSell.inventory[changedKeys[0]], (beforeSecond.inventory[changedKeys[0]] ?? 0) - 1, "one item removed");
    // S30: the sale checkpointed through the normal writer path.
    const durable = await page.evaluate(() => JSON.parse(localStorage.getItem("reliquary.save.v3")));
    assert.equal(durable.gold, afterSell.gold, "the sale is durable immediately");
    assert.equal(durable.inventory[changedKeys[0]], afterSell.inventory[changedKeys[0]]);

    await page.evaluate(() => window.__reliquary?.cancel?.());
    await page.waitForFunction(() => document.querySelector(".shop-list") == null);
    await page.waitForSelector(".hud-menu");
  });
  console.log("[shop-flow] select, Buy, Sell, unaffordable, cancel ok");
} finally {
  server.close();
}
