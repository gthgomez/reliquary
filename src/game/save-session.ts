const LOCK_NAME = "reliquary-save-writer";

export type SaveSessionResult = "granted" | "denied" | "unsupported";

export interface SaveSession {
  release: () => void;
}

/**
 * One active writer per origin when Web Locks are available.
 * Resolves only after the lock is held; release() ends the session.
 */
export async function acquireSaveSession(): Promise<{ result: SaveSessionResult; session: SaveSession | null }> {
  const locks = navigator.locks;
  if (!locks?.request) {
    return { result: "unsupported", session: { release: () => {} } };
  }
  return new Promise((resolve) => {
    void locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve({ result: "denied", session: null });
        return;
      }
      let releaseLock: (() => void) | undefined;
      resolve({
        result: "granted",
        session: {
          release: () => {
            releaseLock?.();
          },
        },
      });
      return new Promise<void>((done) => {
        releaseLock = done;
      });
    });
  });
}
