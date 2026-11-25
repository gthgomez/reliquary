export type WorldCameraSnapState = { camera?: number; desired?: number; player?: number };

/** Snap the shared world camera without reversing either the scenery or player. */
export function snapWorldCameraForPlayer(
  playerWorldPosition: number, cameraPosition: number, state?: WorldCameraSnapState,
): number {
  let camera = Math.round(cameraPosition);
  if (state?.camera !== undefined && state.desired !== undefined && state.player !== undefined) {
    if (cameraPosition > state.desired) camera = Math.max(camera, state.camera);
    else if (cameraPosition < state.desired) camera = Math.min(camera, state.camera);
    else camera = state.camera;
    const playerPixels = Math.round(playerWorldPosition) - Math.round(state.player);
    if (playerWorldPosition > state.player) camera = Math.min(camera, state.camera + playerPixels);
    else if (playerWorldPosition < state.player) camera = Math.max(camera, state.camera + playerPixels);
  }
  if (state) {
    state.camera = camera;
    state.desired = cameraPosition;
    state.player = playerWorldPosition;
  }
  return camera;
}
