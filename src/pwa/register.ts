export type PwaStatus =
  | "unsupported"
  | "downloading"
  | "ready"
  | "updateWaiting"
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

const SW_READY_MS = 45_000;

export async function registerReliquaryServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    setStatus("unsupported");
    return;
  }
  try {
    setStatus("downloading");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("service worker ready timeout")), SW_READY_MS);
      }),
    ]);
    const shellOk = await verifyOfflineShell();
    if (!shellOk) {
      setStatus("failed");
      return;
    }
    if (reg.waiting) setStatus("updateWaiting");
    else setStatus("ready");
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && reg.waiting) setStatus("updateWaiting");
      });
    });
  } catch {
    setStatus("failed");
  }
}
