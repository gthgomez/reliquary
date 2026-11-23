import assert from "node:assert/strict";
import { startStaticServer, withBrowser, waitForGameBoot } from "./helpers.mjs";

const { server, baseUrl } = await startStaticServer(0);

async function installControls(page) {
  await page.addInitScript(() => {
    const services = navigator.serviceWorker;
    const register = services.register.bind(services);
    const update = ServiceWorkerRegistration.prototype.update;
    const gate = new Promise((resolve) => { window.releaseOfflineInstall = resolve; });
    services.register = async (...args) => {
      if (sessionStorage.getItem("qa-reject-sw-register")) throw new Error("registration unavailable");
      if (!services.controller) await gate;
      return register(...args);
    };
    ServiceWorkerRegistration.prototype.update = function () {
      if (sessionStorage.getItem("qa-reject-sw-update")) {
        window.rejectedOfflineUpdate = true;
        return Promise.reject(new Error("update unavailable"));
      }
      return update.call(this);
    };
    window.offlineStatusHistory = [];
    new MutationObserver(() => {
      const text = document.querySelector(".app-status")?.textContent?.trim();
      if (text && text !== window.offlineStatusHistory.at(-1)) window.offlineStatusHistory.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

async function verifyCachedBoot(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForGameBoot(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  assert.match(await page.locator(".title-word").first().textContent(), /Reliquary/);
  const status = page.locator(".app-status");
  assert.equal(await status.count(), 0, "already-installed shell does not show install progress or a success toast");
  assert.deepEqual(await page.evaluate(() => window.offlineStatusHistory), [],
    "already-installed shell has no transient install or failure announcement");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menuStatus = page.locator(".offline-menu-status").filter({ hasText: "Available offline" });
  await menuStatus.waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
}

try {
  await withBrowser(async (page, context) => {
    await installControls(page);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await waitForGameBoot(page);
    const status = page.locator(".app-status");
    await status.filter({ hasText: /Caching for offline/ }).waitFor();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 3; i += 1) await page.locator(".dialog-next").click();

    await page.evaluate(() => window.releaseOfflineInstall());
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const offlineNotice = status.filter({ hasText: "Available offline" });
    await offlineNotice.waitFor({ timeout: 30_000 });
    assert.equal(await offlineNotice.getAttribute("role"), "status");
    await page.waitForTimeout(2_800);
    assert.equal(await offlineNotice.isVisible(), true, "verified installation has a readable four-second announcement");
    await offlineNotice.waitFor({ state: "detached", timeout: 2_000 });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    assert.equal((await page.locator(".offline-menu-status").innerText()).trim(), "Available offline");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Keep the real controller/cache and fail only the page-side update call.
    await page.evaluate(() => sessionStorage.setItem("qa-reject-sw-update", "1"));
    await context.setOffline(true);
    await verifyCachedBoot(page);
    await page.waitForFunction(() => window.rejectedOfflineUpdate === true);
    assert.deepEqual(await page.evaluate(() => window.offlineStatusHistory), []);

    // Offline cold boot may fail to register again. The cached controller,
    // revisioned shell, and boot assets still establish readiness.
    await page.evaluate(() => sessionStorage.setItem("qa-reject-sw-register", "1"));
    await verifyCachedBoot(page);

    // Corrupt only the cache used by this isolated browser. With the page
    // registration still rejected, a controller alone must not claim ready.
    const removed = await page.evaluate(async () => {
      const name = (await caches.keys()).find((key) => key.startsWith("workbox-precache"));
      const cache = await caches.open(name);
      return cache.delete("/manifest.webmanifest", { ignoreSearch: true });
    });
    assert.equal(removed, true, "negative control actually deletes a required precache entry");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForGameBoot(page);
    const warning = status.filter({ hasText: /Offline play not verified/ });
    await warning.waitFor();
    assert.equal(await warning.getAttribute("role"), "status");
    await page.waitForTimeout(4_200);
    assert.equal(await warning.isVisible(), true, "incomplete cache warning persists");
  }, { context: { serviceWorkers: "allow" } });
} finally {
  server.close();
}

// Hold one real precache response until the page times out waiting for its
// controller. The late first controller must clear the obsolete failure.
let releaseManifest;
const manifestGate = new Promise((resolve) => { releaseManifest = resolve; });
const slow = await startStaticServer(0, {
  beforeResponse: (path) => path === "/manifest.webmanifest" ? manifestGate : undefined,
});
try {
  await withBrowser(async (page) => {
    await page.addInitScript(() => {
      const schedule = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => schedule(fn, ms === 45_000 ? 150 : ms, ...args);
    });
    await page.goto(slow.baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".app-status").filter({ hasText: /Offline play not verified/ }).waitFor();
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null);
    releaseManifest();
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    for (let i = 0; i < 3; i += 1) await page.locator(".dialog-next").click();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.locator(".offline-menu-status").filter({ hasText: "Available offline" }).waitFor();
    assert.deepEqual(await page.locator(".app-status").count(), 0);
  }, { context: { serviceWorkers: "allow" } });
} finally {
  releaseManifest();
  slow.server.close();
}

console.log("[pwa] verified install notice, offline boot, incomplete cache, and late controller recovery");
