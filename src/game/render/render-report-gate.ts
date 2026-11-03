/** Browser-test builds only — no production `window` geometry mutation. */
export function shouldPublishRenderGeometryReports(): boolean {
  try {
    return import.meta.env.VITE_RELIQUARY_BROWSER_TEST === "1";
  } catch {
    return false;
  }
}
