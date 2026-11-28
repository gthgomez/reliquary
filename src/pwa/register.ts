import { collectGameAssets } from "../game/assets.ts";
import { PORTRAITS } from "../game/portraits.ts";

export type PwaStatus =
  | "checking"
  | "unsupported"
  | "downloading"
  | "ready"
  | "updating"
  | "blocked"
  | "failed";

let status: PwaStatus = "checking";
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
  if (next === status) return;
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
  try {
    const scope = new URL("/", window.location.href);
    const precache = `workbox-precache-v2-${scope.href}`;
    if (!(await caches.has(precache))) return false;
    const cache = await caches.open(precache);
    // Workbox stores revisioned entries with a query string. Validate the
    // actual URLs needed for this running shell, not any precache from the origin.
    const cached = new Set((await cache.keys()).map((entry) => {
      const url = new URL(entry.url);
      return `${url.origin}${url.pathname}`;
    }));
    const modules = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))
      .map((script) => script.src).filter(isGameBundle);
    const styles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'))
      .map((link) => link.href).filter(isGameBundle);
    const required = [
      "/index.html",
      "/manifest.webmanifest",
      ...modules,
      ...styles,
      ...collectGameAssets().filter((entry) => entry.required).map((entry) => entry.url),
      ...Object.values(PORTRAITS).flatMap(({ src }) => src ? [src] : []),
    ];
    return modules.length > 0 && required.every((entry) => {
      const url = new URL(entry, scope);
      return cached.has(`${url.origin}${url.pathname}`);
    });
  } catch {
    return false;
  }

  function isGameBundle(href: string) {
    const url = new URL(href);
    return url.origin === window.location.origin && url.pathname.startsWith("/assets/");
  }
}

function waitForController(sw: ServiceWorkerContainer): Promise<void> {
  if (sw.controller) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onControl = () => {
      if (!sw.controller) return;
      clearTimeout(timeout);
      sw.removeEventListener("controllerchange", onControl);
      resolve();
    };
    const timeout = setTimeout(() => {
      sw.removeEventListener("controllerchange", onControl);
      reject(new Error("service worker control timed out"));
    }, SW_READY_MS);
    sw.addEventListener("controllerchange", onControl);
    onControl();
  });
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
  const script = new URL("/sw.js", window.location.href).href;
  const hasShellController = () => sw.controller?.scriptURL === script;
  const refreshOfflineStatus = async () => {
    if (updatePending) return;
    const controller = sw.controller;
    const shellOk = hasShellController() && await verifyOfflineShell();
    if (!updatePending && sw.controller === controller) setStatus(shellOk ? "ready" : "failed");
  };
  // Only a controller *change* (not the first install) means a new build took over.
  let hadController = Boolean(sw.controller);
  sw.addEventListener("controllerchange", () => {
    if (!sw.controller) return;
    if (hadController) onNewVersionActive();
    else void refreshOfflineStatus();
    hadController = true;
  });

  // Check the installed build before touching the network. An already-cached
  // page should not start a new installation announcement on every launch.
  const cachedAtLaunch = await verifyOfflineShell();
  if (!updatePending && status === "checking") {
    if (hasShellController() && cachedAtLaunch) setStatus("ready");
    else if (!sw.controller && !cachedAtLaunch) setStatus("downloading");
  }
  try {
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
    await waitForController(sw);
    check();
  } catch {
    // A cached launch can work normally while the registration call fails
    // offline. Control and verified files, not registration, decide readiness.
  }
  await refreshOfflineStatus();
}
