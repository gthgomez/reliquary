// Data-driven NPC dialogue routing. The engine owns audio, state, and emit;
// this module only returns the speaker, pages, and an optional effect tag.

export type StoryEffect = "offerInn" | "startWarden" | "shop";

export type NpcDialogue = {
  speaker: string;
  pages: string[];
  effect?: StoryEffect;
};

export function npcDialogue(id: string, flags: Record<string, boolean>): NpcDialogue | null {
  if (id === "maren" || id === "maren_guild") {
    if (!flags.starter) {
      return {
        speaker: "Elder Maren",
        pages: [
          "The Crown cracked. We did not. That is the whole of our order.",
          "Walk west to the Binding Grove. Three beasts have waited the night. Speak a pact. Then the road is yours.",
        ],
      };
    }
    if (!flags.trial) {
      return {
        speaker: "Elder Maren",
        pages: [
          "Good. A pact is a name you intend to keep.",
          "Bind what you can on Briar Road. When you are ready, take the Wildwood north to Thornkeep. Warden Cael will test the compact.",
        ],
      };
    }
    return {
      speaker: "Elder Maren",
      pages: [
        "The Thorn Sigil sits well on you. The Hollow Crown is still a rumor with teeth — but that is a later road.",
        "Rest. Bind. Walk. That is the work.",
      ],
    };
  }
  if (id === "guard") {
    return {
      speaker: "Gateward",
      pages: [
        flags.starter
          ? "Road's open. If the grass sings, you already know what that means."
          : "Not without a pact-beast. Maren's in the Chapter, or the Grove west of town.",
      ],
    };
  }
  if (id === "lise") {
    return {
      speaker: "Aunt Lise",
      pages: [
        "Inns take crowns. Shrines take nothing but a moment. I know which I'd trust.",
        "If you see my cousin on the road, tell her the well's still sweet.",
      ],
    };
  }
  if (id === "innkeep") {
    // The innkeeper's display name differs by map ("Innmother Cald" /
    // "Innmother"); an empty speaker lets the engine fall back to the NPC name.
    return {
      speaker: "",
      pages: ["Fifteen crowns for a clean bed and a whole lantern. Rest?"],
      effect: "offerInn",
    };
  }
  if (id === "shopkeep") {
    return { speaker: "Chandler", pages: [], effect: "shop" };
  }
  if (id === "wayfarer") {
    return {
      speaker: "Wayfarer",
      pages: [
        "Tall grass means a fight. That's the old compact, gone feral.",
        "Sigil stones bind. Common ones break often. Thorn ones less. Don't throw them at a full-health wyrm.",
      ],
    };
  }
  if (id === "reedcutter") {
    return {
      speaker: "Reed-cutter",
      pages: ["Fenwitch walks the peat when the mist sits low. Pale eyes. Don't follow them off the bridge."],
    };
  }
  if (id === "cael" || id === "cael_trial") {
    if (flags.trial) {
      return { speaker: "Warden Cael", pages: ["You already keep the Thorn Mark. Don't make me bored."] };
    }
    if (!flags.starter) {
      return { speaker: "Warden Cael", pages: ["Come back with a pact, green lantern."] };
    }
    return {
      speaker: "Warden Cael",
      pages: [
        "Warden Cael. I keep Thornkeep's road.",
        "Show me the compact is not a hobby. Three of mine against yours. Bind or break.",
      ],
      effect: "startWarden",
    };
  }
  if (id === "keep_guard") {
    return {
      speaker: "Keep Guard",
      pages: ["Hall's through the east cottage. Cael doesn't like small talk."],
    };
  }
  return null;
}
