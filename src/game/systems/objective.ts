/**
 * One shared rule for the current story objective. Pure so it is testable and
 * revivable from any engine state without touching content or save layout.
 */
export type ObjectiveFlags = {
  starter?: boolean;
  trial?: boolean;
};

export function currentObjective(flags: ObjectiveFlags): string | null {
  if (!flags.starter) {
    return "Speak a pact at the Binding Grove, west of Elderhall.";
  }
  if (!flags.trial) {
    return "Bind companions as you travel, then take the Wildwood north to Warden Cael in Thornkeep.";
  }
  return "Rest. Bind who you wish. The Hollow Crown waits beyond the ash.";
}
