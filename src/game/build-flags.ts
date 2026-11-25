declare const __PUBLIC_ELDERHALL_WORLD_REVISION__: 2 | 5 | undefined;

/** The static shell sets one compile-time revision for art, maps, and saves. */
export function isElderhallCandidateBuild(): boolean {
  if (typeof __PUBLIC_ELDERHALL_WORLD_REVISION__ !== "undefined") {
    return __PUBLIC_ELDERHALL_WORLD_REVISION__ === 5;
  }
  try { return import.meta.env.VITE_ELDERHALL_CANDIDATE === "1"; }
  catch { return typeof process !== "undefined" && process.env.VITE_ELDERHALL_CANDIDATE === "1"; }
}

export const ELDERHALL_WORLD_REVISION =
  typeof __PUBLIC_ELDERHALL_WORLD_REVISION__ === "undefined"
    ? isElderhallCandidateBuild() ? 5 : 2
    : __PUBLIC_ELDERHALL_WORLD_REVISION__;
