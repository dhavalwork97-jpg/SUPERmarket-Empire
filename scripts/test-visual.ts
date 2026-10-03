/** Visual-rule tests (pure functions in lib/visual.ts). Run with: npm test. */
import assert from "node:assert/strict";
import { pickQuality, aisleLook, endCapSides, doorPose, storeLook, cartPlan, texDir } from "../lib/visual";
import { AISLE_ORDER } from "../lib/constants";
let n = 0; const t = (name: string, f: () => void) => { f(); n++; console.log("ok -", name); };

t("quality: override beats saved beats detection", () => {
  assert.equal(pickQuality({ override: "low", saved: "high", deviceMemory: 8 }), "low");
  assert.equal(pickQuality({ saved: "low", deviceMemory: 8 }), "low");
  assert.equal(pickQuality({ override: "bogus", deviceMemory: 2 }), "low");
  assert.equal(pickQuality({ deviceMemory: 8 }), "high");
  assert.equal(pickQuality({ deviceMemory: 4 }), "low");
});
t("quality: touch devices without deviceMemory (iOS) default to low unless they have many cores; desktop is high", () => {
  assert.equal(pickQuality({ coarse: true, cores: 6 }), "low");
  assert.equal(pickQuality({ coarse: true, cores: 8 }), "high");
  assert.equal(pickQuality({ coarse: false, cores: 4 }), "high");
  assert.equal(pickQuality({}), "high");
});
t("every department has a distinct look at high quality; produce/bakery/electronics are no longer the same fixture", () => {
  const fx = AISLE_ORDER.map((a) => aisleLook(a, 1, "high").fixture);
  assert.equal(new Set(fx).size, AISLE_ORDER.length);
  assert.notEqual(aisleLook("bakery", 1, "high").fixture, aisleLook("electronics", 1, "high").fixture);
  assert.notEqual(aisleLook("freezer", 1, "high").fixture, aisleLook("deli", 1, "high").fixture);
});
t("low quality uses the baked fridge and the basket chest; no doors, no end caps, no guard", () => {
  for (const a of AISLE_ORDER) { const l = aisleLook(a, 10, "low"); assert.ok(!l.doors && !l.endcaps && !l.guard, a); }
  assert.equal(aisleLook("refrigerated", 1, "low").fixture, "fridge_bay");
  assert.equal(aisleLook("deli", 1, "low").fixture, "freezer_chest");
});
t("level unlocks: accent strip L3, header L6, gold posts L10; end caps from L3 on electronics only", () => {
  const a = (l: number) => aisleLook("electronics", l, "high");
  assert.deepEqual([a(2).accentStrip, a(3).accentStrip, a(5).header, a(6).header, a(9).goldPosts, a(10).goldPosts], [false, true, false, true, false, true]);
  assert.ok(!a(2).endcaps && a(3).endcaps && !aisleLook("bakery", 10, "high").endcaps);
});
t("end caps only on ends that face an empty in-bounds tile", () => {
  const occ = new Set(["3,2", "1,2"]);
  assert.deepEqual(endCapSides(2, 2, occ, 8, 6, true), []);
  assert.deepEqual(endCapSides(2, 2, new Set(["1,2"]), 8, 6, true), ["R"]);
  assert.deepEqual(endCapSides(0, 2, new Set(), 8, 6, true), ["R"]);
  assert.deepEqual(endCapSides(7, 2, new Set(), 8, 6, true), ["L"]);
  assert.deepEqual(endCapSides(4, 2, new Set(), 8, 6, false), []);
  assert.deepEqual(endCapSides(4, 5, new Set(), 8, 6, true), [], "bottom row is the entrance row");
});
t("door pose: closed with nobody, opens the door in front of the shopper, never two shoppers fighting over one door", () => {
  assert.equal(doorPose(0, []), 0);
  const s = [{ off: -1, seed: 3 }];
  assert.ok(doorPose(0, s) > 0 && doorPose(1, s) === 0 && doorPose(2, s) === 0);
  const two = [{ off: 0, seed: 5 }, { off: 0, seed: 7 }]; const p = doorPose(1, two); assert.ok(p === 1 || p === 2);
  assert.ok(doorPose(2, [{ off: 5, seed: 1 }]) > 0, "far-right shopper clamps to the last door");
});
t("store tier architecture: tier 0 unchanged, tier 1 lit ceiling, tier 2 pillars + window frames; low quality drops the heavy bits", () => {
  assert.deepEqual(storeLook(0, "high"), { ceiling: "bars", pillars: false, windowFrames: false, trim: true });
  assert.equal(storeLook(1, "high").ceiling, "housings");
  assert.ok(storeLook(2, "high").pillars && storeLook(2, "high").windowFrames);
  assert.ok(!storeLook(2, "low").pillars && storeLook(2, "low").ceiling === "none");
});
t("cart + texture budgets by quality", () => {
  assert.deepEqual(cartPlan("low"), { node: "cart_lite", cap: 24 }); assert.equal(cartPlan("high").cap, 64);
  assert.ok(texDir("low").endsWith("/lite/") && !texDir("high").includes("lite"));
});
console.log(`\n${n} visual tests passed`);
