const LOCK_NAME = "reliquary-save-writer";

export type SaveSessionResult = "granted" | "denied" | "unsupported";

export interface SaveSession {
  release: () => void;
}

/**
 * One active writer per origin when Web Locks are available.
 */
export async function acquireSaveSession(): Promise<{ result: SaveSessionResult; session: SaveSession | null }> {
  const locks = navigator.locks;
  if (!locks?.request) {
    return { result: "unsupported", session: { release: () => {} } };
  }
  let releaseLock: (() => void) | null = null;
  const held = new Promise<boolean>((resolve) => {
    void locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        resolve(false);
        return;
      }
      await new Promise<void>((done) => {
        releaseLock = done;
      });
    });
  });
  const granted = await Promise.race([
    held,
    new Promise<boolean>((r) => setTimeout(() => r(true), 0)),
  ]);
  if (!granted) return { result: "denied", session: null };
  return {
    result: "granted",
    session: {
      release: () => {
        releaseLock?.();
      },
    },
  };
}
