import type { MapDef } from "../types.ts";

/** A production build must not construct the preview-only layout. */
export function makeElderhallCandidate(_base: MapDef): MapDef {
  throw new Error("The Elderhall candidate layout is unavailable in production");
}

/** Production maps keep their authored interior exit coordinates. */
export function makeElderhallCandidateInterior(_base: MapDef): MapDef {
  throw new Error("The Elderhall candidate layout is unavailable in production");
}
