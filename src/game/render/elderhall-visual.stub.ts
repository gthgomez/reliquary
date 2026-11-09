import type { MapObj } from "../types.ts";

/** Production build stub; candidate art and its runtime stay in preview builds. */
export function elderhallCandidateObject(_mapId: string, obj: MapObj, _enabled: boolean): MapObj { return obj; }
export function elderhallTerrainAtlas(_mapId: string, _tileName: string, _enabled: boolean): string | null { return null; }
export function elderhallCandidateGate(): MapObj { throw new Error("Candidate gate is not available in production"); }
export function elderhallCandidateBench(): MapObj { throw new Error("Candidate bench is not available in production"); }
export function paintCandidateGateFallback(): void {}
export function paintCandidateBenchFallback(): void {}
export function paintElderhallRoadJunctions(): void {}
