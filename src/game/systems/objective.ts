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

export function objectivePreview(flags: ObjectiveFlags, mapId: string): string | null {
  if (!flags.starter) {
    if (mapId === "home") return "Leave the cottage";
    if (mapId === "elderhall") return "Find the Binding Grove";
    if (mapId === "grove") return "Make a pact";
    return "Find the Binding Grove";
  }
  if (!flags.trial) {
    if (mapId === "grove") return "Return to Elderhall";
    if (mapId === "thornkeep" || mapId === "warden_hall") return "Find Warden Cael";
    if (mapId === "briar_road" || mapId === "wildwood") return "Continue north to Thornkeep";
    return "Travel north to Thornkeep";
  }
  return "Rest or travel beyond the ash";
}

export function marenLandmark(candidate: boolean): string {
  return candidate ? "beside the village well" : "near the Chapter House";
}

/** Optional directions for the player's current surroundings, not saved state. */
export function objectiveHint(flags: ObjectiveFlags, place: string): string | null {
  if (!flags.starter) {
    if (place === "Rowan's Cottage") return "Leave through the doorway at the bottom of the cottage, then follow the village path west.";
    if (place === "Elderhall") return "The Binding Grove is west. Follow the village path through the opening beside the grove sign; Elder Maren nearby can offer optional guidance.";
    if (place === "Binding Grove") return "Stand beside a creature and face it, then press Z or Enter, or tap A, to inspect it. You can inspect all three before making a pact.";
    return "Return to Elderhall and follow its western path to the grove.";
  }
  if (!flags.trial) {
    if (place === "Binding Grove") return "Return east to Elderhall. The northern road leads onward.";
    if (place === "Elderhall") return "Follow the road north out of the village to Briar Road. Open Party in the Lantern to see your companion.";
    if (place === "Briar Road") return "Follow the road north toward the Wildwood. Be ready for wild encounters along the way.";
    if (place === "Wildwood") return "Continue north through the Wildwood to Thornkeep.";
    if (place === "Thornkeep") return "Find Warden Cael in the keep or the Warden's Hall.";
    return null;
  }
  return null;
}
