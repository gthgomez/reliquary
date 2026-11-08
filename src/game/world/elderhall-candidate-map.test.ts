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
  for (const [label, x, y] of [["green", 9, 13], ["Maren and well", 12, 10], ["north gate", 11, 8], ["north gate close", 11, 4], ["guard approach", 12, 7], ["west approach", 1, 10]] as const) {
    assert.equal(isOccupied(map, {}, x, y), false, `${label} framing point is standable`);
    assert.ok(reachable.has(`${x},${y}`), `${label} framing point is reachable`);
  }
  for (const item of map.decorations?.filter((deco) => deco.sprite === "elderhall-flowers") ?? []) {
    assert.equal(map.ground[Math.floor(item.y)]![Math.floor(item.x)], ".", "candidate flowers remain on grass");
  }
});

test("candidate gate, guard and sign sit lower while both northern lanes remain open", () => {
  const map = makeElderhallCandidate(MAPS.elderhall);
  const gate = map.objects.find((obj) => obj.id === "north_gate_candidate")!;
  const sign = map.objects.find((obj) => obj.id === "lantern1")!;
  const guard = map.npcs.find((npc) => npc.id === "guard")!;
  assert.deepEqual([gate.x, gate.y], [9, 3]);
  assert.deepEqual([guard.x, guard.y, guard.talk], [13, 7, "guard"]);
  assert.deepEqual([sign.x, sign.y], [14, 4]);
  assert.equal(isOccupied(map, {}, 9, 6), true);
  assert.equal(isOccupied(map, {}, 12, 6), true);
  assert.equal(isOccupied(map, {}, 10, 6), false);
  assert.equal(isOccupied(map, {}, 11, 6), false);
  const reachable = reachableTiles(map, map.spawn, {});
  for (const [x, y] of [[10, 0], [11, 0], [10, 6], [11, 6], [12, 7], [11, 8]]) {
    assert.ok(reachable.has(`${x},${y}`), `gate approach or exit ${x},${y} remains reachable`);
  }
});

test("older production and candidate saves on new collision migrate without losing progress", () => {
  const script = `
    import assert from "node:assert/strict";
    import { MAPS } from "./src/game/maps.ts";
    import { isOccupied } from "./src/game/world/movement.ts";
    import { SAVE_VERSION, WORLD_REVISION, parseSave } from "./src/game/save.ts";
    import { ReliquaryGame } from "./src/game/engine.ts";
    assert.equal(WORLD_REVISION, 5);
    const revision4 = { ...MAPS.elderhall,
      objects: MAPS.elderhall.objects.map(o => o.id === "north_gate_candidate" ? {...o,y:0}
        : o.id === "lantern1" ? {...o,x:12,y:3} : o),
      npcs: MAPS.elderhall.npcs.map(n => n.id === "guard" ? {...n,x:11,y:2} : n) };
    for (const [x,y] of [[9,6],[12,6],[13,7],[14,4]]) {
      assert.equal(isOccupied(revision4, {}, x, y), false, 'new collision must have been walkable in revision 4');
      assert.equal(isOccupied(MAPS.elderhall, {}, x, y), true, 'new collision is solid in revision 5');
    }
    for (const revision of [2,3,4]) for (const [x,y] of [[8,12],[8,14],[14,10],[13,10],[15,7],[19,11],[9,6],[12,6],[13,7],[14,4]]) {
      const old = {version:SAVE_VERSION,worldRevision:revision,playerName:"Rowan",mapId:"elderhall",x,y,dir:0,gold:321,playTime:17,
        party:[],box:[],inventory:{},flags:{met_maren:true},seen:{},caught:{}};
      assert.equal(isOccupied(MAPS.elderhall, old.flags, x, y), true);
      const restored = parseSave(JSON.stringify(old));
      assert.ok(restored, 'older candidate save must load');
      assert.equal(restored.worldRevision, 5);
      assert.notDeepEqual([restored.x, restored.y], [x,y]);
      assert.equal(isOccupied(MAPS.elderhall, restored.flags, restored.x, restored.y), false);
      assert.equal(restored.gold, 321); assert.equal(restored.flags.met_maren, true);
      assert.equal(parseSave(JSON.stringify({...old, worldRevision:5})), null, 'same-revision invalid position remains rejected');
    }
    const safe = {version:SAVE_VERSION,worldRevision:4,playerName:"Rowan",mapId:"elderhall",x:12,y:14,dir:0,gold:5,playTime:0,
      party:[],box:[],inventory:{},flags:{},seen:{},caught:{}};
    const restored = parseSave(JSON.stringify(safe));
    assert.deepEqual([restored.x,restored.y], [12,14], 'safe old positions are preserved');
    const game = new ReliquaryGame();
    game.mode = "world"; game.mapId = "elderhall"; game.tx = 12; game.ty = 10; game.dir = 2;
    game.confirm();
    assert.equal(game.dialog?.speaker, "Elder Maren", 'facing east from the tested approach starts Maren dialogue');
    game.dialog = null; game.tx = 12; game.ty = 7; game.dir = 2;
    game.confirm();
    assert.equal(game.dialog?.npcId, "guard", 'facing east from the tested gate approach still speaks to the guard');
  `;
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: process.cwd(), env: { ...process.env, VITE_ELDERHALL_CANDIDATE: "1" }, stdio: "pipe" });
});

test("candidate gate changes do not alter the production revision or guard", () => {
  const script = `
    import assert from "node:assert/strict";
    import { MAPS } from "./src/game/maps.ts";
    import { WORLD_REVISION } from "./src/game/save.ts";
    assert.equal(WORLD_REVISION, 2);
    assert.equal(MAPS.elderhall.objects.some(o => o.id === "north_gate_candidate"), false);
    const guard = MAPS.elderhall.npcs.find(n => n.id === "guard");
    const sign = MAPS.elderhall.objects.find(o => o.id === "lantern1");
    assert.deepEqual([guard.x,guard.y], [11,2]);
    assert.deepEqual([sign.x,sign.y], [12,3]);
  `;
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: process.cwd(), env: { ...process.env, VITE_ELDERHALL_CANDIDATE: "0" }, stdio: "pipe" });
});
