import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const { server, baseUrl } = await startStaticServer(0);

try {
  await withBrowser(async (page, context) => {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await waitForGameBoot(page);
    const reg = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { ok: false, reason: "unsupported" };
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const precache = keys.find((k) => k.startsWith("workbox-precache"));
      if (!precache) return { ok: false, reason: "no precache" };
      const cache = await caches.open(precache);
      const index = await cache.match("/index.html");
      const manifest = await cache.match("/manifest.webmanifest");
      return { ok: Boolean(index && manifest), reason: index && manifest ? "ready" : "missing shell" };
    });
    assert.equal(reg.ok, true, reg.reason);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForGameBoot(page);
    const title = await page.locator(".title-word").first().textContent();
    assert.match(title ?? "", /Reliquary/);
  });
} finally {
  server.close();
}

console.log("[pwa] offline reload smoke passed");
