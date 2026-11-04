/** Browser-test client builds (`build:web:test`) — not production `build:web`. */
export function isReliquaryBrowserTestBuild(): boolean {
  try {
    if (import.meta.env.VITE_RELIQUARY_BROWSER_TEST === "1") return true;
  } catch {
    /* node unit tests without import.meta.env */
  }
  return typeof process !== "undefined" && process.env.VITE_RELIQUARY_BROWSER_TEST === "1";
}

/** Browser-test builds only — no production `window` geometry mutation. */
export function shouldPublishRenderGeometryReports(): boolean {
  return isReliquaryBrowserTestBuild();
}

/** Same gate as geometry reports — production must not expose QA control surface on `window`. */
export function shouldExposeControlsTestOnWindow(): boolean {
  return isReliquaryBrowserTestBuild();
}
