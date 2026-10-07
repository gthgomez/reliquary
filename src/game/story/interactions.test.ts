import assert from "node:assert/strict";
import { test } from "node:test";
import { npcDialogue } from "./interactions.ts";

test("Maren asks for a starter before anything else", () => {
  const r = npcDialogue("maren", {});
  assert.equal(r?.speaker, "Elder Maren");
  assert.match(r!.pages[0]!, /Crown cracked/);
  assert.equal(r?.effect, undefined);
});

test("Cael offers the trial only when a starter exists", () => {
  assert.equal(npcDialogue("cael", { starter: true })?.effect, "startWarden");
  assert.match(npcDialogue("cael", {})!.pages[0]!, /green lantern/);
});

test("shopkeep routes to the shop effect", () => {
  assert.equal(npcDialogue("shopkeep", {})?.effect, "shop");
});

test("Maren's pages are copied verbatim across all three states", () => {
  assert.deepEqual(npcDialogue("maren", {})?.pages, [
    "The Crown cracked. We did not. That is the whole of our order.",
    "Walk west to the Binding Grove. Three beasts have waited the night. Speak a pact. Then the road is yours.",
  ]);
  assert.deepEqual(npcDialogue("maren", { starter: true })?.pages, [
    "Good. A pact is a name you intend to keep.",
    "Bind what you can on Briar Road. When you are ready, take the Wildwood north to Thornkeep. Warden Cael will test the compact.",
  ]);
  assert.deepEqual(npcDialogue("maren", { starter: true, trial: true })?.pages, [
    "The Thorn Sigil sits well on you. The Hollow Crown is still a rumor with teeth — but that is a later road.",
    "Rest. Bind. Walk. That is the work.",
  ]);
});

test("maren_guild shares Maren's routing", () => {
  assert.deepEqual(npcDialogue("maren_guild", {}), npcDialogue("maren", {}));
  assert.deepEqual(npcDialogue("maren_guild", { starter: true }), npcDialogue("maren", { starter: true }));
  assert.deepEqual(npcDialogue("maren_guild", { starter: true, trial: true }), npcDialogue("maren", { starter: true, trial: true }));
});

test("guard switches on the starter flag", () => {
  assert.deepEqual(npcDialogue("guard", {})?.pages, [
    "Not without a pact-beast. Maren's in the Chapter, or the Grove west of town.",
  ]);
  assert.deepEqual(npcDialogue("guard", { starter: true })?.pages, [
    "Road's open. If the grass sings, you already know what that means.",
  ]);
});

test("lise, wayfarer, and reedcutter pages are verbatim", () => {
  assert.deepEqual(npcDialogue("lise", {})?.pages, [
    "Inns take crowns. Shrines take nothing but a moment. I know which I'd trust.",
    "If you see my cousin on the road, tell her the well's still sweet.",
  ]);
  assert.deepEqual(npcDialogue("wayfarer", {})?.pages, [
    "Tall grass means a fight. That's the old compact, gone feral.",
    "Sigil stones bind. Common ones break often. Thorn ones less. Don't throw them at a full-health wyrm.",
  ]);
  assert.deepEqual(npcDialogue("reedcutter", {})?.pages, [
    "Fenwitch walks the peat when the mist sits low. Pale eyes. Don't follow them off the bridge.",
  ]);
});

test("innkeep routes to the inn effect and leaves the speaker to the NPC name", () => {
  const r = npcDialogue("innkeep", {});
  assert.equal(r?.speaker, "");
  assert.deepEqual(r?.pages, ["Fifteen crowns for a clean bed and a whole lantern. Rest?"]);
  assert.equal(r?.effect, "offerInn");
});

test("shopkeep carries the shop effect", () => {
  const r = npcDialogue("shopkeep", {});
  assert.deepEqual(r?.pages, []);
  assert.equal(r?.effect, "shop");
});

test("Cael's pages are copied verbatim across all three states", () => {
  assert.deepEqual(npcDialogue("cael", {})?.pages, ["Come back with a pact, green lantern."]);
  assert.deepEqual(npcDialogue("cael", { starter: true })?.pages, [
    "Warden Cael. I keep Thornkeep's road.",
    "Show me the compact is not a hobby. Three of mine against yours. Bind or break.",
  ]);
  assert.deepEqual(npcDialogue("cael", { trial: true })?.pages, [
    "You already keep the Thorn Mark. Don't make me bored.",
  ]);
});

test("cael_trial shares Cael's routing", () => {
  assert.deepEqual(npcDialogue("cael_trial", {}), npcDialogue("cael", {}));
  assert.deepEqual(npcDialogue("cael_trial", { starter: true }), npcDialogue("cael", { starter: true }));
  assert.deepEqual(npcDialogue("cael_trial", { trial: true }), npcDialogue("cael", { trial: true }));
});

test("keep_guard page is verbatim", () => {
  assert.deepEqual(npcDialogue("keep_guard", {})?.pages, [
    "Hall's through the east cottage. Cael doesn't like small talk.",
  ]);
});

test("an unknown talk id routes nowhere", () => {
  assert.equal(npcDialogue("nobody", {}), null);
});
