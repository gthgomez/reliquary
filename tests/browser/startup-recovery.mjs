import assert from "node:assert/strict";
import { startStaticServer, withBrowser } from "./helpers.mjs";

const imagePath = "/game/props/bed.png";
const essential = (url) => url.pathname === imagePath;

const startButton = (page) => page.getByRole("button", { name: "Start", exact: true });
const retryButton = (page) => page.getByRole("button", { name: "Retry world art", exact: true });

async function start(page) {
  await startButton(page).click();
  await page.getByText(/A lantern ticks on the sill/).waitFor();
}

for (const status of [503, 200]) {
  let requests = 0;
  const { server, baseUrl } = await startStaticServer(0, {
    beforeResponse: (path, response) => {
      if (path !== imagePath || ++requests !== 1) return;
      // A real cacheable response is needed; Playwright routing disables the
      // HTTP cache and would hide the corrupt-image retry regression.
      response.writeHead(status, { "Content-Type": "image/png", "Cache-Control": "public, max-age=600" });
      response.end("not an image");
    },
  });
  try {
    await withBrowser(async (page) => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByText(/Some world art could not be loaded/).waitFor();
      assert.equal(await startButton(page).isEnabled(), false);
      await retryButton(page).click();
      await start(page);
      assert.equal(requests, 2, "retry requests and decodes the missing image again");
    });
  } finally {
    server.close();
  }
}

const { server, baseUrl } = await startStaticServer();
try {
  await withBrowser(async (page, context) => {
    let requests = 0;
    const paused = [];
    await context.route(essential, (route) => {
      requests++;
      if (requests < 3) paused.push(route);
      else return route.continue();
    });
    try {
      const pending = page.waitForRequest((request) => essential(new URL(request.url())));
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await pending;
      assert.equal(await startButton(page).isEnabled(), false);

      // Close the page with its original image still in flight, then exercise
      // the same stall in the replacement page. Neither may create a save.
      await page.close();
      const reopened = await context.newPage();
      await reopened.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await reopened.getByText(/World art is taking longer than expected/).waitFor();
      assert.equal(await reopened.evaluate(() => localStorage.getItem("reliquary.save.v3")), null);
      await retryButton(reopened).click();
      await start(reopened);
      assert.equal(requests, 3, "retry does not depend on the abandoned request completing");
    } finally {
      await Promise.allSettled(paused.map((route) => route.abort()));
    }
  }, { context: { viewport: { width: 320, height: 568 } } });
  console.log("[startup-recovery] HTTP failure, cached decode error, stalled/interrupted loads and title retry passed");
} finally {
  server.close();
}
