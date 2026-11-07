export type PwaStatus =
  | "unsupported"
  | "downloading"
  | "ready"
  | "updating"
  | "blocked"
  | "failed";

let status: PwaStatus = "unsupported";
const listeners = new Set<(value: PwaStatus) => void>();

export function getPwaStatus(): PwaStatus {
  return status;
}

export function subscribePwaStatus(listener: (value: PwaStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

function setStatus(next: PwaStatus): void {
  status = next;
  listeners.forEach((fn) => fn(next));
}

/**
 * The game tells us when a reload is safe (no battle, dialog or menu) and how
 * to flush the save first. Without a guard we treat every moment as safe.
 */
export interface UpdateGuard {
  /** Calm moment: no battle, dialog, shop or menu. */
  canReloadNow(): boolean;
  /** Acceptable when the update is overdue or the app is hidden (e.g. anything but a battle). */
  canForceReload(): boolean;
  /**
   * Flush the save before the page goes away. The result is the reload veto
   * contract: "clean" — no save required; "flushed" — durable before reload;
   * "failed" (or a throw) — the update must NOT reload, and the live session
   * stays open until a later attempt flushes successfully.
   */
  beforeReload(): "clean" | "flushed" | "failed";
}

let guard: UpdateGuard | null = null;

export function setUpdateGuard(next: UpdateGuard | null): void {
  guard = next;
  if (updatePending) tryApplyUpdate();
}

const SW_READY_MS = 45_000;
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const SAFE_POLL_MS = 2_000;
/** After this long, apply the update at the next non-battle moment even if a menu/dialog is open. */
const MAX_DEFER_MS = 10 * 60 * 1000;
const RELOAD_GUARD_KEY = "reliquary.sw-reload-at";
const RELOAD_GUARD_MS = 30_000;

let updatePending = false;
let pendingSince = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function recentlyReloaded(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    return Number.isFinite(at) && Date.now() - at < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

function markReload(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* storage blocked: the controllerchange-only trigger still prevents loops */
  }
}

function tryApplyUpdate(): boolean {
  if (!updatePending) return false;
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  const overdue = Date.now() - pendingSince > MAX_DEFER_MS;
  // No guard means no flush callback exists (post-unmount) — deferring is
  // always safer than reloading without one.
  const safe = guard ? (guard.canReloadNow() || ((hidden || overdue) && guard.canForceReload())) : false;
  if (!safe || recentlyReloaded()) return false;
  let flush: "clean" | "flushed" | "failed";
  try {
    flush = guard?.beforeReload() ?? "clean";
  } catch {
    // A throwing required flush is a failed flush: the session must survive.
    flush = "failed";
  }
  if (flush === "failed") {
    // Veto: keep the live session and this tab on the old build. The poll
    // keeps retrying; the persistent status tells the player why the update
    // is paused and that their progress is safe.
    setStatus("blocked");
    return false;
  }
  markReload();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  window.location.reload();
  return true;
}

function onNewVersionActive(): void {
  if (updatePending) return;
  updatePending = true;
  pendingSince = Date.now();
  setStatus("updating");
  if (tryApplyUpdate()) return;
  pollTimer = setInterval(tryApplyUpdate, SAFE_POLL_MS);
}

async function verifyOfflineShell(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const names = await caches.keys();
  const precache = names.find((name) => name.startsWith("workbox-precache"));
  if (!precache) return false;
  const cache = await caches.open(precache);
  const index = await cache.match("/index.html", { ignoreSearch: true });
  const manifest = await cache.match("/manifest.webmanifest", { ignoreSearch: true });
  return Boolean(index && manifest);
}

function activateWaiting(reg: ServiceWorkerRegistration): void {
  // Workers built before auto-update shipped wait for this message.
  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export async function registerReliquaryServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    setStatus("unsupported");
    return;
  }
  const sw = navigator.serviceWorker;
  // Only a controller *change* (not the first install) means a new build took over.
  let hadController = Boolean(sw.controller);
  sw.addEventListener("controllerchange", () => {
    if (hadController) onNewVersionActive();
    hadController = true;
  });
  try {
    setStatus("downloading");
    const reg = await sw.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const watchInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && sw.controller) activateWaiting(reg);
      });
    };
    reg.addEventListener("updatefound", () => watchInstalling(reg.installing));
    watchInstalling(reg.installing);
    activateWaiting(reg);
    const check = () => {
      reg.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
      tryApplyUpdate();
    });
    setInterval(check, UPDATE_CHECK_MS);
    await Promise.race([
      sw.ready,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("service worker ready timeout")), SW_READY_MS);
      }),
    ]);
    if (sw.controller) check();
    const shellOk = await verifyOfflineShell();
    if (updatePending) return;
    setStatus(shellOk ? "ready" : "failed");
  } catch {
    if (!updatePending) setStatus("failed");
  }
}
