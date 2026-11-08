/** Pointer ids are numeric; accessible clicks use unique string ids. */
export type HoldId = number | string;

/** Track active pointers independently, so one released finger cannot cancel another. */
export function updateTouchHold(
  held: Map<string, Set<HoldId>>,
  code: string,
  pointerId: HoldId,
  on: boolean,
): boolean | null {
  const pointers = held.get(code) ?? new Set<HoldId>();
  const wasHeld = pointers.size > 0;
  if (on) pointers.add(pointerId);
  else pointers.delete(pointerId);
  if (pointers.size) held.set(code, pointers);
  else held.delete(code);
  const isHeld = pointers.size > 0;
  return wasHeld === isHeld ? null : isHeld;
}

/** Return directions to release when the surface unmounts or changes mode. */
export function clearTouchHolds(held: Map<string, Set<HoldId>>): string[] {
  const codes = [...held.keys()];
  held.clear();
  return codes;
}

type StepSnapshot = { canMove: boolean; moving: boolean; map: string; x: number; y: number };
type StepScheduler = {
  frame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  timeout: (callback: () => void, milliseconds: number) => number;
  cancelTimeout: (handle: number) => void;
};

/**
 * Translate a keyboard/assistive button activation into one movement request.
 * Wait for an existing step to settle, then release as soon as the requested
 * step starts. A blocked direction, mode change, map transition, or timeout
 * releases the hold too. The engine, not this helper, decides movement.
 */
export function requestAccessibleStep(
  snapshot: () => StepSnapshot,
  hold: (on: boolean) => void,
  scheduler: StepScheduler,
  onDone: () => void = () => {},
): () => void {
  let state = snapshot();
  if (!state.canMove) {
    onDone();
    return () => {};
  }
  let waitingForPreviousStep = state.moving;
  let reference = { map: state.map, x: state.x, y: state.y };
  let idleFrames = 0;
  let active = true;
  const handles: { frame?: number; timeout?: number } = {};
  const finish = () => {
    if (!active) return;
    active = false;
    if (handles.frame !== undefined) scheduler.cancelFrame(handles.frame);
    if (handles.timeout !== undefined) scheduler.cancelTimeout(handles.timeout);
    hold(false);
    onDone();
  };
  const tick = () => {
    if (!active) return;
    state = snapshot();
    if (!state.canMove || state.map !== reference.map) return finish();
    if (waitingForPreviousStep) {
      if (!state.moving) {
        waitingForPreviousStep = false;
        reference = { map: state.map, x: state.x, y: state.y };
      }
    } else if (state.moving || state.x !== reference.x || state.y !== reference.y || ++idleFrames >= 2) {
      return finish();
    }
    handles.frame = scheduler.frame(tick);
  };
  hold(true);
  handles.frame = scheduler.frame(tick);
  handles.timeout = scheduler.timeout(finish, 1000);
  return finish;
}
