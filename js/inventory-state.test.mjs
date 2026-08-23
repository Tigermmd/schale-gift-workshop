import assert from "node:assert/strict";
import {
  calculateInventorySummary,
  confirmGiftReservations,
  createInventoryState,
  mapPaidPackageContentsToInventory,
  mapPeriodicResource,
  migrateLegacyAutoPostedPackageContents,
  postPeriodicResource,
  releaseGiftReservations,
  removePostedPackageContents,
  restorePostedPackageContents,
  reserveGiftAllocation,
  setEquivalentGiftPoolCount,
  setStockResourceCount,
  synthesizeGoldGift,
  syncPurchasedPackagesToInventory,
  undoPeriodicResource,
} from "./inventory-state.js";
import { createEmptyPlannerState, setInventoryCount, setResourceAmount } from "./planner-state.js";

const empty = createInventoryState();
assert.deepEqual(empty.stockResources, {
  manufacturing_stone: 0,
  synthesis_stone_gold: 0,
});
assert.deepEqual(empty.incomingResources.stockResources, {
  manufacturing_stone: 0,
  synthesis_stone_gold: 0,
});
assert.deepEqual(createInventoryState({ stockResources: { gold_manufacturing_stone: 99 } }).stockResources, {
  manufacturing_stone: 0,
  synthesis_stone_gold: 0,
}, "Unused gold manufacturing stones must be discarded from inventory state");
assert.deepEqual(createInventoryState({ incomingResources: { stockResources: { gold_manufacturing_stone: 99 } } }).incomingResources.stockResources, {
  manufacturing_stone: 0,
  synthesis_stone_gold: 0,
}, "Unused gold manufacturing stones must not enter periodic inventory");
assert.deepEqual(empty.giftReservations, {});
assert.deepEqual(empty.resourcePostingHistory, []);

const legacy = createInventoryState({ inventory: { "5100": 2 }, giftBoxes: { "100008": 1 } });
assert.equal(legacy.inventory["5100"], 2);
assert.equal(legacy.giftBoxes["100008"], 1);
assert.ok(legacy.equivalentGiftPools["random-gold"] === 0);

let state = setStockResourceCount(empty, "synthesis_stone_gold", 1);
state = setStockResourceCount(state, "manufacturing_stone", 2);
state = setEquivalentGiftPoolCount(state, "random-gold", 4);
state = setInventoryCount(state, "5000", 3);
state = setInventoryCount(state, "5001", 1);

const posted = postPeriodicResource(state, "weekly-manufacturing-stones", { periodDays: 30, timestamp: "2026-08-10T00:00:00Z" });
assert.equal(posted.incomingResources.stockResources.manufacturing_stone, 17 * 30 / 7);
assert.equal(posted.resourcePostingHistory.length, 1);
assert.equal(postPeriodicResource(posted, "weekly-manufacturing-stones", { periodDays: 30, timestamp: "2026-08-11T00:00:00Z" }).resourcePostingHistory.length, 1);

const postedGiftBoxes = postPeriodicResource(posted, "monthly-total-assault-gift-boxes", { periodDays: 30 });
assert.equal(postedGiftBoxes.incomingResources.giftBoxes["100008"], 3);
const postedGrandGold = postPeriodicResource(postedGiftBoxes, "monthly-grand-assault-gold-gift-boxes", { periodDays: 30 });
const postedGrandPurple = postPeriodicResource(postedGrandGold, "monthly-grand-assault-purple-gift-boxes", { periodDays: 30 });
assert.equal(postedGrandPurple.incomingResources.giftBoxes["100008"], 7.5);
assert.equal(postedGrandPurple.incomingResources.giftBoxes["100009"], 1.5);
assert.equal(postedGrandPurple.resourcePostingHistory.length, 4);
const postedAt30 = postPeriodicResource(empty, "monthly-total-assault-gift-boxes", { periodDays: 30 });
const postedAt60 = postPeriodicResource(postedAt30, "monthly-total-assault-gift-boxes", { periodDays: 60 });
assert.equal(postedAt60.incomingResources.giftBoxes["100008"], 6, "switching to a 60-day period must replace, not add to, the 30-day posting");
assert.equal(postedAt60.resourcePostingHistory.filter((item) => item.resourceId === "monthly-total-assault-gift-boxes" && item.active !== false).length, 1);
const zeroDayPost = postPeriodicResource(createInventoryState({ periodDays: 0 }), "monthly-total-assault-gift-boxes", { periodDays: 0 });
assert.equal(zeroDayPost.resourcePostingHistory.length, 0, "a zero-day current-only window must not post a periodic resource");
const rewardSnapshot = JSON.parse((await import("node:fs")).readFileSync(new URL("../relationship_data/unlimited_assault_rewards_cn.json", import.meta.url), "utf8"));
const towerMapping = mapPeriodicResource({ id: "monthly-unlimited-assault-gift-boxes", cadence: "monthly", amount: 60, input_kind: "floor", unit: "gift_box" }, { periodDays: 30, rewardSnapshot });
assert.equal(towerMapping.stockResources.synthesis_stone_gold, 20, "tower synthesis stones must enter the synthesis-stone bucket");
const managedSynthesisResources = [
  { id: "monthly-synthesis-stones", cadence: "monthly", amount: 70, value_source: "default", unit: "synthesis_stone_gold" },
  { id: "monthly-unlimited-assault-gift-boxes", cadence: "monthly", amount: 99, input_kind: "floor", unit: "gift_box" },
];
const managedMonthlyMapping = mapPeriodicResource(managedSynthesisResources[0], { periodDays: 30, rewardSnapshot, resources: managedSynthesisResources });
const managedTowerMapping = mapPeriodicResource(managedSynthesisResources[1], { periodDays: 30, rewardSnapshot, resources: managedSynthesisResources });
assert.equal(managedMonthlyMapping.stockResources.synthesis_stone_gold, 50, "the default monthly row must post only the shop component once a tower floor is configured");
assert.equal(managedTowerMapping.stockResources.synthesis_stone_gold, 20, "the tower row must post only its own 20-stone component");
const managedPosted = postPeriodicResource(
  createInventoryState({ resources: managedSynthesisResources, periodDays: 30 }),
  "monthly-synthesis-stones",
  { periodDays: 30, rewardSnapshot },
);
const managedPostedBoth = postPeriodicResource(managedPosted, "monthly-unlimited-assault-gift-boxes", { periodDays: 30, rewardSnapshot });
assert.equal(managedPostedBoth.incomingResources.stockResources.synthesis_stone_gold, 70, "posting both sources must total 50 shop + 20 tower, not 90");
const combinedMonthlyPosting = postPeriodicResource(
  createInventoryState({
    resources: [
      managedSynthesisResources[0],
      { ...managedSynthesisResources[1], amount: null },
    ],
    periodDays: 60,
  }),
  "monthly-synthesis-stones",
  { periodDays: 60, rewardSnapshot },
);
assert.equal(combinedMonthlyPosting.incomingResources.stockResources.synthesis_stone_gold, 140, "before a tower floor is configured, the monthly row posts the combined 70/month baseline");
const configuredAfterPosting = setResourceAmount(combinedMonthlyPosting, "monthly-unlimited-assault-gift-boxes", 99);
const postedTowerAfterCombinedMonthly = postPeriodicResource(
  configuredAfterPosting,
  "monthly-unlimited-assault-gift-boxes",
  { periodDays: 60, rewardSnapshot },
);
assert.equal(postedTowerAfterCombinedMonthly.incomingResources.stockResources.synthesis_stone_gold, 140, "configuring and posting the tower later must not add its stones twice");
assert.equal(
  postedTowerAfterCombinedMonthly.resourcePostingHistory.find((item) => item.resourceId === "monthly-synthesis-stones" && item.active !== false).mapped.stockResources.synthesis_stone_gold,
  100,
  "posting the tower later must recalculate the existing monthly posting as the shop-only contribution",
);
assert.equal(
  postedTowerAfterCombinedMonthly.resourcePostingHistory.find((item) => item.resourceId === "monthly-unlimited-assault-gift-boxes" && item.active !== false).mapped.stockResources.synthesis_stone_gold,
  40,
  "the tower posting must retain only its own contribution",
);
const undone = undoPeriodicResource(postedGrandPurple, postedGrandPurple.resourcePostingHistory[0].id);
assert.equal(undone.incomingResources.stockResources.manufacturing_stone, 0);
assert.equal(undone.resourcePostingHistory.find((item) => item.resourceId === "weekly-manufacturing-stones").active, false);

const summaryBefore = calculateInventorySummary(postedGiftBoxes);
assert.deepEqual(summaryBefore.gifts["5000"], { current: 3, incoming: 0, reserved: 0, remaining: 3 });
assert.deepEqual(summaryBefore.stocks.synthesis_stone_gold, { current: 1, incoming: 0, reserved: 0, remaining: 1 });
assert.deepEqual(summaryBefore.equivalentGiftPools["random-gold"], { current: 4, incoming: 0, reserved: 0, remaining: 4 });

const reserved = reserveGiftAllocation(postedGiftBoxes, [
  { giftId: "5000", quantity: 2 },
  { giftId: "5001", quantity: 1 },
]);
assert.deepEqual(calculateInventorySummary(reserved).gifts["5000"], { current: 3, incoming: 0, reserved: 2, remaining: 1 });
assert.deepEqual(calculateInventorySummary(reserved).gifts["5001"], { current: 1, incoming: 0, reserved: 1, remaining: 0 });
const released = releaseGiftReservations(reserved);
assert.deepEqual(released.giftReservations, {});
const confirmed = confirmGiftReservations(reserved);
assert.equal(confirmed.inventory["5000"], 1);
assert.equal(confirmed.inventory["5001"], 0);
assert.deepEqual(confirmed.giftReservations, {});

const reservedSynthesisPlan = reserveGiftAllocation(
  setStockResourceCount(setInventoryCount(setInventoryCount(empty, "5000", 1), "5001", 1), "synthesis_stone_gold", 1),
  [],
  { synthesisGiftIds: ["5000", "5001"] },
);
assert.deepEqual(reservedSynthesisPlan.synthesisReservations, [["5000", "5001"]]);
const confirmedSynthesisPlan = confirmGiftReservations(reservedSynthesisPlan);
assert.equal(confirmedSynthesisPlan.inventory["5000"], 0, "confirming a synthesis reservation consumes the first gold gift");
assert.equal(confirmedSynthesisPlan.inventory["5001"], 0, "confirming a synthesis reservation consumes the second gold gift");
assert.equal(confirmedSynthesisPlan.stockResources.synthesis_stone_gold, 0, "confirming a synthesis reservation consumes one synthesis stone");
assert.equal(confirmedSynthesisPlan.giftBoxes["100008"], 1, "confirming a synthesis reservation creates one gold choice box");
assert.deepEqual(confirmedSynthesisPlan.synthesisReservations, []);

const synthesized = synthesizeGoldGift(
  setStockResourceCount(setInventoryCount(setInventoryCount(empty, "5000", 1), "5001", 1), "synthesis_stone_gold", 1),
  "5000",
  "5001",
);
assert.equal(synthesized.ok, true);
assert.equal(synthesized.state.inventory["5000"], 0);
assert.equal(synthesized.state.inventory["5001"], 0);
assert.equal(synthesized.state.stockResources.synthesis_stone_gold, 0);
assert.equal(synthesized.state.giftBoxes["100008"], 1);

const reservedMaterials = reserveGiftAllocation(
  setStockResourceCount(setInventoryCount(setInventoryCount(empty, "5000", 1), "5001", 1), "synthesis_stone_gold", 1),
  [{ giftId: "5000", quantity: 1 }, { giftId: "5001", quantity: 1 }],
);
const reservedSynthesis = synthesizeGoldGift(reservedMaterials, "5000", "5001");
assert.equal(reservedSynthesis.ok, false, "synthesis must not consume gifts already reserved by the planner");
assert.equal(reservedSynthesis.reason, "insufficient_materials");

const insufficient = synthesizeGoldGift(empty, "5100", "5101");
assert.equal(insufficient.ok, false);
assert.equal(insufficient.reason, "insufficient_materials");

const sameGiftNeedsTwo = synthesizeGoldGift(
  setStockResourceCount(setInventoryCount(empty, "5000", 1), "synthesis_stone_gold", 1),
  "5000",
  "5000",
);
assert.equal(sameGiftNeedsTwo.ok, false);
assert.equal(sameGiftNeedsTwo.reason, "insufficient_materials");

const purpleCannotSynthesize = synthesizeGoldGift(
  setStockResourceCount(setInventoryCount(setInventoryCount(empty, "5100", 1), "5001", 1), "synthesis_stone_gold", 1),
  "5100",
  "5001",
  new Map([
    ["5000", { id: 5000, rarity: "SR" }],
    ["5001", { id: 5001, rarity: "SR" }],
    ["5100", { id: 5100, rarity: "SSR" }],
  ]),
);
assert.equal(purpleCannotSynthesize.ok, false);
assert.equal(purpleCannotSynthesize.reason, "gold_gifts_only");

const giftPackage = {
  id: "gifts",
  purchase_limit: 3,
  contents: [
    { kind: "item", item_id: 100008, quantity: 5 },
    { kind: "item", item_id: 5997, quantity: 5 },
  ],
};
const manufacturingPackage = {
  id: "manufacturing",
  purchase_limit: 2,
  contents: [
    { kind: "item", item_id: 3, quantity: 20 },
    { kind: "item", item_id: 82, quantity: 25 },
  ],
};

const legacyDoublePosted = createInventoryState({
  inventory: { "5997": 37, "100008": 1480 },
  giftBoxes: { "100008": 1480 },
  stockResources: { manufacturing_stone: 70, synthesis_stone_gold: 125 },
  packagePlans: {
    gifts: { purchased: 1, inInventory: 1 },
    manufacturing: { purchased: 1, inInventory: 1 },
  },
  packageInventoryPostings: { gifts: 1, manufacturing: 1 },
});
const migrated = migrateLegacyAutoPostedPackageContents(legacyDoublePosted, [giftPackage, manufacturingPackage]);
assert.equal(migrated.inventory["5997"], 32);
assert.equal(migrated.giftBoxes["100008"], 1475);
assert.equal(migrated.stockResources.manufacturing_stone, 50);
assert.equal(migrated.stockResources.synthesis_stone_gold, 100);
assert.deepEqual(migrated.packageInventoryPostings, {});
assert.equal(migrated.packagePlans.gifts.inInventory, 1);
assert.equal(migrated.packagePlans.manufacturing.inInventory, 1);
assert.equal(migrateLegacyAutoPostedPackageContents(migrated, [giftPackage, manufacturingPackage]).inventory["5997"], 32);
assert.deepEqual(mapPaidPackageContentsToInventory(giftPackage, 1), {
  inventory: { "5997": 5 },
  giftBoxes: { "100008": 5 },
  stockResources: {},
  equivalentGiftPools: {},
});
let packageState = createInventoryState({
  packagePlans: {
    gifts: { purchased: 1 },
    manufacturing: { purchased: 1 },
  },
});
packageState = syncPurchasedPackagesToInventory(packageState, [giftPackage, manufacturingPackage]);
assert.equal(packageState.giftBoxes["100008"], undefined);
assert.equal(packageState.inventory["5997"], undefined);
assert.equal(packageState.stockResources.manufacturing_stone, 0);
assert.equal(packageState.stockResources.synthesis_stone_gold, 0);
assert.equal(packageState.packagePlans.gifts.inInventory, 1);
assert.equal(packageState.packagePlans.manufacturing.inInventory, 1);
const packageStateAgain = syncPurchasedPackagesToInventory(packageState, [giftPackage, manufacturingPackage]);
assert.equal(packageStateAgain.giftBoxes["100008"], undefined);
assert.equal(packageStateAgain.inventory["5997"], undefined);
assert.equal(packageStateAgain.stockResources.manufacturing_stone, 0);
assert.equal(packageStateAgain.stockResources.synthesis_stone_gold, 0);
packageState = syncPurchasedPackagesToInventory({ ...packageState, packagePlans: { ...packageState.packagePlans, gifts: { purchased: 2, inInventory: 1 } } }, [giftPackage, manufacturingPackage]);
assert.equal(packageState.giftBoxes["100008"], undefined);
assert.equal(packageState.inventory["5997"], undefined);

console.log("inventory state tests passed");
