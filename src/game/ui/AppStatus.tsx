import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getPwaStatus, subscribePwaStatus, type PwaStatus } from "../../pwa/register.ts";
import "./app-status.css";

const labels: Record<PwaStatus, string> = {
  checking: "Checking offline availability…",
  unsupported: "Offline play unavailable in this browser.",
  downloading: "Caching for offline…",
  ready: "Available offline",
  updating: "Updating…",
  blocked: "Update paused — the save could not be written. This session is kept; make storage available and it will retry.",
  failed: "Offline play not verified. Save your progress, reconnect, then reopen to check again.",
};

const READY_NOTICE_MS = 4_000;

function usePwaStatus() {
  return useSyncExternalStore(subscribePwaStatus, getPwaStatus, () => "checking" as const);
}

export function AppStatus({ showReadyToast = true }: { showReadyToast?: boolean } = {}) {
  const status = usePwaStatus();
  const previous = useRef(status);
  const [showNotice, setShowNotice] = useState(false);
  useEffect(() => {
    const justInstalled = previous.current === "downloading" && status === "ready";
    previous.current = status;
    if (status !== "ready" || !showReadyToast) {
      setShowNotice(false);
      return;
    }
    if (!justInstalled) return;
    setShowNotice(true);
    const timeout = window.setTimeout(() => setShowNotice(false), READY_NOTICE_MS);
    return () => window.clearTimeout(timeout);
  }, [status, showReadyToast]);

  if (status === "checking" || status === "unsupported" ||
    (status === "ready" && !(showReadyToast && showNotice))) return null;
  return <p className="app-status app-status-backed" role="status">{labels[status]}</p>;
}

export function OfflineMenuStatus() {
  const status = usePwaStatus();
  return <p className="offline-menu-status">{labels[status]}</p>;
}
