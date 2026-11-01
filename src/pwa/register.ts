import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

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

export async function registerReliquaryServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    setStatus("unsupported");
    return;
  }
  try {
    setStatus("downloading");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
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
