/** Candidate art and its collision changes exist only in explicit preview builds. */
export function isElderhallCandidateBuild(): boolean {
  try { return import.meta.env.VITE_ELDERHALL_CANDIDATE === "1"; }
  catch { return typeof process !== "undefined" && process.env.VITE_ELDERHALL_CANDIDATE === "1"; }
}
