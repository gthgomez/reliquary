import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { MAPS } from "../maps.ts";
import { makeElderhallCandidate } from "../maps/elderhall-candidate.ts";
import { isOccupied } from "./movement.ts";
import { reachableTiles } from "./reachability.ts";

test("the candidate composes a green west of an accessible well without changing the base map", () => {
  const base = MAPS.elderhall;
  const before = JSON.stringify(base);
  const map = makeElderhallCandidate(base);
  assert.equal(JSON.stringify(base), before, "the normal world is unchanged");
  const tree = map.objects.find((obj) => obj.id === "green_tree")!;
  const bench = map.objects.find((obj) => obj.id === "green_bench_candidate")!;
  const well = map.objects.find((obj) => obj.id === "well")!;
  const maren = map.npcs.find((npc) => npc.id === "maren")!;
  assert.deepEqual([tree.x, tree.y, bench.x, bench.y], [8, 12, 8, 14]);
  assert.deepEqual([well.x, well.y, maren.x, maren.y], [14, 10, 13, 10]);
  assert.ok(tree.x < well.x, "the green sits west of the well");
  assert.equal(Math.abs(maren.x - well.x) + Math.abs(maren.y - well.y), 1);
  assert.equal(map.ground[tree.y]![tree.x], ".");
  assert.equal(map.ground[bench.y]![bench.x], ".");
  assert.equal(map.ground[well.y]![well.x], "c", "the well sits on a stone communal apron");
  assert.equal(map.ground[maren.y]![maren.x], "c");
  for (const item of [tree, bench, well]) assert.ok(isOccupied(map, {}, item.x, item.y));
  assert.deepEqual(map.warps, base.warps, "the two map exits retain their targets");
  assert.deepEqual(map.objects.filter((o) => !o.id.endsWith("_candidate")).map((o) => o.id).sort(),
    base.objects.filter((o) => !o.id.endsWith("_candidate")).map((o) => o.id).sort(), "existing objects keep their identities");
});

test("candidate crossroads, entrances, Maren and both exits stay reachable", () => {
  const map = makeElderhallCandidate(MAPS.elderhall);
  const reachable = reachableTiles(map, map.spawn, {});
  const road = new Set<string>();
  map.ground.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === "p" || tile === "c") road.add(`${x},${y}`); }));
  const joined = new Set(["10,0"]);
  const queue = ["10,0"];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!.split(",").map(Number) as [number, number];
    for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
      const key = `${nx},${ny}`;
      if (road.has(key) && !joined.has(key)) { joined.add(key); queue.push(key); }
    }
  }
  assert.equal(joined.size, road.size, "all dirt and cobble belong to one connected road network");
  for (const [label, x, y] of [["home", 4, 15], ["guild", 4, 9], ["inn", 16, 5], ["shop", 16, 9],
    ["Maren approach", 12, 10], ["well apron", 14, 9], ["north route", 10, 0], ["west route", 0, 10]] as const) {
    assert.ok(reachable.has(`${x},${y}`), `${label} must be reachable`);
  }
  const maren = map.npcs.find((npc) => npc.id === "maren")!;
  assert.deepEqual([maren.x, maren.y], [13, 10], "face east from (12,10) to talk to Maren");
  assert.equal(map.ground[10]![8], "p", "west approach joins the main road");
  for (const [x, y] of [[13, 9], [14, 9], [15, 9], [13, 10], [14, 10], [15, 10]]) {
    assert.equal(map.ground[y]![x], "c", `communal apron covers ${x},${y}`);
  }
  for (const [x, y] of [[13, 9], [14, 9], [15, 9], [15, 10]]) {
    assert.ok(reachable.has(`${x},${y}`), `open cobble at ${x},${y} remains reachable`);
  }
  for (const [label, x, y] of [["green", 9, 13], ["Maren and well", 12, 10], ["north gate", 11, 4], ["west approach", 1, 10]] as const) {
    assert.equal(isOccupied(map, {}, x, y), false, `${label} framing point is standable`);
    assert.ok(reachable.has(`${x},${y}`), `${label} framing point is reachable`);
  }
  for (const item of map.decorations?.filter((deco) => deco.sprite === "elderhall-flowers") ?? []) {
    assert.equal(map.ground[Math.floor(item.y)]![Math.floor(item.x)], ".", "candidate flowers remain on grass");
  }
});

test("older production and candidate saves on new collision migrate without losing progress", () => {
  const script = `
    import assert from "node:assert/strict";
    import { MAPS } from "./src/game/maps.ts";
    import { isOccupied } from "./src/game/world/movement.ts";
    import { SAVE_VERSION, WORLD_REVISION, parseSave } from "./src/game/save.ts";
    import { ReliquaryGame } from "./src/game/engine.ts";
    assert.equal(WORLD_REVISION, 4);
    for (const revision of [2,3]) for (const [x,y] of [[8,12],[8,14],[14,10],[13,10],[15,7],[19,11]]) {
      const old = {version:SAVE_VERSION,worldRevision:revision,playerName:"Rowan",mapId:"elderhall",x,y,dir:0,gold:321,playTime:17,
        party:[],box:[],inventory:{},flags:{met_maren:true},seen:{},caught:{}};
      assert.equal(isOccupied(MAPS.elderhall, old.flags, x, y), true);
      const restored = parseSave(JSON.stringify(old));
      assert.ok(restored, 'older candidate save must load');
      assert.equal(restored.worldRevision, 4);
      assert.notDeepEqual([restored.x, restored.y], [x,y]);
      assert.equal(isOccupied(MAPS.elderhall, restored.flags, restored.x, restored.y), false);
      assert.equal(restored.gold, 321); assert.equal(restored.flags.met_maren, true);
      assert.equal(parseSave(JSON.stringify({...old, worldRevision:4})), null, 'same-revision invalid position remains rejected');
    }
    const safe = {version:SAVE_VERSION,worldRevision:3,playerName:"Rowan",mapId:"elderhall",x:12,y:14,dir:0,gold:5,playTime:0,
      party:[],box:[],inventory:{},flags:{},seen:{},caught:{}};
    const restored = parseSave(JSON.stringify(safe));
    assert.deepEqual([restored.x,restored.y], [12,14], 'safe old positions are preserved');
    const game = new ReliquaryGame();
    game.mode = "world"; game.mapId = "elderhall"; game.tx = 12; game.ty = 10; game.dir = 2;
    game.confirm();
    assert.equal(game.dialog?.speaker, "Elder Maren", 'facing east from the tested approach starts Maren dialogue');
  `;
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: process.cwd(), env: { ...process.env, VITE_ELDERHALL_CANDIDATE: "1" }, stdio: "pipe" });
});
