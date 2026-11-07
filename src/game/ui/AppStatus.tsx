import { useSyncExternalStore } from "react";
import { getPwaStatus, subscribePwaStatus } from "../../pwa/register.ts";

export function AppStatus() {
  const status = useSyncExternalStore(subscribePwaStatus, getPwaStatus, () => "unsupported" as const);
  if (status === "unsupported") return null;
  const label =
    status === "ready" ? "Available offline"
    : status === "downloading" ? "Caching for offline…"
    : status === "updating" ? "Updating…"
    : status === "blocked"
      ? "Update paused — the save could not be written. This session is kept; make storage available and it will retry."
    : status === "failed" ? "Offline cache incomplete"
    : "";
  if (!label) return null;
  return <p className="app-status" role="status">{label}</p>;
}
