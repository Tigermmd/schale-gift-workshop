import assert from "node:assert/strict";
import fs from "node:fs";
import { FUTURE_STUDENTS } from "./future-students.js";
import { calculateGiftOnlyForecast, calculateGiftOnlyProjection, calculatePaidGiftPackageExp, calculateSynthesisStoneEquivalentExp, filterGiftPackagesForStudent, partitionGiftPackagesForTimeline, recommendGiftPackagePurchases } from "./gift-only-planner.js";
import { calculateGiftBoxExpectedExp } from "./gift-box-state.js";

const gifts = JSON.parse(fs.readFileSync(new URL("../relationship_data/gifts.json", import.meta.url), "utf8")).gifts;
const thresholds = JSON.parse(fs.readFileSync(new URL("../relationship_data/relationship_thresholds.json", import.meta.url), "utf8"));
const boxes = JSON.parse(fs.readFileSync(new URL("../relationship_data/gift_boxes_cn.json", import.meta.url), "utf8")).boxes;
const paidPackagesCatalog = JSON.parse(fs.readFileSync(new URL("../relationship_data/paid_packages_cn.json", import.meta.url), "utf8")).packages;
const giftById = new Map(gifts.map((gift) => [String(gift.id), gift]));
const boxById = new Map(boxes.map((box) => [String(box.id), box]));
const student = FUTURE_STUDENTS.find((item) => item.student_id === 10122);
const craftingSnapshot = JSON.parse(fs.readFileSync(new URL("../relationship_data/crafting_expected_relationship.json", import.meta.url), "utf8"));
const baseMikaCrafting = craftingSnapshot.students.find((item) => item.student_id === 10059);

assert.equal(calculateSynthesisStoneEquivalentExp({ gift_values: [{ gift_id: 5000, relationship_exp: 20 }] }), 0);
assert.equal(calculateSynthesisStoneEquivalentExp({ gift_values: [{ gift_id: 5000, relationship_exp: 60 }] }), 20);
assert.equal(calculateSynthesisStoneEquivalentExp({ gift_values: [{ gift_id: 5000, relationship_exp: 80 }] }), 40);

const towerForecast = calculateGiftOnlyForecast({
  resources: [{
    id: "tower",
    cadence: "monthly",
    amount: 99,
    unit: "gift_box",
    input_kind: "floor",
  }],
  resourcePostingHistory: [],
}, { periodDays: 60, rewardSnapshot: JSON.parse(fs.readFileSync(new URL("../relationship_data/unlimited_assault_rewards_cn.json", import.meta.url), "utf8")) });
assert.deepEqual(towerForecast, {
  choiceBoxes: 12,
  randomGoldBoxes: 0,
  randomPurpleBoxes: 6,
  manufacturingStones: 0,
  synthesisStones: 40,
});

const twoMonthForecast = calculateGiftOnlyForecast({
  resources: [
    { id: "monthly-total", cadence: "monthly", amount: 3, unit: "gift_box", gift_box_id: "100008" },
    { id: "monthly-grand-gold", cadence: "monthly", amount: 4.5, unit: "gift_box", gift_box_id: "100008" },
    { id: "monthly-grand-purple", cadence: "monthly", amount: 1.5, unit: "gift_box", gift_box_id: "100009" },
    { id: "monthly-event-gold", cadence: "monthly", amount: 80, unit: "gift_equivalent", equivalent_box_id: "100000" },
    { id: "monthly-event-purple", cadence: "monthly", amount: 4, unit: "gift_box", gift_box_id: "100009" },
  ],
  resourcePostingHistory: [],
});
assert.deepEqual(twoMonthForecast, {
  choiceBoxes: 15,
  randomGoldBoxes: 160,
  randomPurpleBoxes: 11,
  manufacturingStones: 0,
  synthesisStones: 0,
});

const synthesisForecastLowTower = calculateGiftOnlyForecast({
  resources: [
    { id: "monthly-synthesis-stones", cadence: "monthly", amount: 70, value_source: "default", unit: "synthesis_stone_gold" },
    { id: "monthly-unlimited-assault-gift-boxes", cadence: "monthly", amount: 49, input_kind: "floor", unit: "gift_box" },
  ],
}, { periodDays: 60, rewardSnapshot: JSON.parse(fs.readFileSync(new URL("../relationship_data/unlimited_assault_rewards_cn.json", import.meta.url), "utf8")) });
assert.equal(synthesisForecastLowTower.synthesisStones, 100, "a low tower must contribute 50 shop stones per month, not the default 20 tower stones");

const synthesisForecastHighTower = calculateGiftOnlyForecast({
  resources: [
    { id: "monthly-synthesis-stones", cadence: "monthly", amount: 70, value_source: "default", unit: "synthesis_stone_gold" },
    { id: "monthly-unlimited-assault-gift-boxes", cadence: "monthly", amount: 99, input_kind: "floor", unit: "gift_box" },
  ],
}, { periodDays: 60, rewardSnapshot: JSON.parse(fs.readFileSync(new URL("../relationship_data/unlimited_assault_rewards_cn.json", import.meta.url), "utf8")) });
assert.equal(synthesisForecastHighTower.synthesisStones, 140, "a high tower must be counted once: 50 shop + 20 tower per month");
const postedMonthlySynthesisForecast = calculateGiftOnlyForecast({
  resources: [
    { id: "monthly-synthesis-stones", cadence: "monthly", amount: 70, value_source: "default", unit: "synthesis_stone_gold" },
    { id: "monthly-unlimited-assault-gift-boxes", cadence: "monthly", amount: 99, input_kind: "floor", unit: "gift_box" },
  ],
  resourcePostingHistory: [{
    id: "monthly-post",
    resourceId: "monthly-synthesis-stones",
    postingKey: "monthly-synthesis-stones:60",
    periodDays: 60,
    mapped: { stockResources: { synthesis_stone_gold: 100 } },
    active: true,
  }],
}, { periodDays: 60, rewardSnapshot: JSON.parse(fs.readFileSync(new URL("../relationship_data/unlimited_assault_rewards_cn.json", import.meta.url), "utf8")) });
assert.equal(postedMonthlySynthesisForecast.synthesisStones, 40, "after posting the shop source, the forecast must retain only two months of tower stones");

const combinedSynthesisPostingBeforeTowerConfiguration = calculateGiftOnlyForecast({
  resources: [
    { id: "monthly-synthesis-stones", cadence: "monthly", amount: 70, value_source: "default", unit: "synthesis_stone_gold" },
    { id: "monthly-unlimited-assault-gift-boxes", cadence: "monthly", amount: 99, input_kind: "floor", unit: "gift_box" },
  ],
  resourcePostingHistory: [{
    id: "monthly-post-before-tower",
    resourceId: "monthly-synthesis-stones",
    postingKey: "monthly-synthesis-stones:60",
    periodDays: 60,
    mapped: { stockResources: { synthesis_stone_gold: 140 } },
    active: true,
  }],
}, { periodDays: 60, rewardSnapshot: JSON.parse(fs.readFileSync(new URL("../relationship_data/unlimited_assault_rewards_cn.json", import.meta.url), "utf8")) });
assert.equal(combinedSynthesisPostingBeforeTowerConfiguration.synthesisStones, 0, "a previously posted combined 70/month baseline must cover the total after the tower floor is configured");

const specialPackage = {
  id: "special",
  price_cny: 98,
  purchase_limit: 3,
  contents: [
    { kind: "student_favorite_gift", item_id: 5104, gift_color: "purple", quantity: 6 },
    { kind: "student_favorite_gift", item_id: 5008, gift_color: "gold", quantity: 10 },
    { kind: "item", item_id: 5997, quantity: 2 },
  ],
};
const manufacturePackage = {
  id: "manufacture",
  price_cny: 156,
  purchase_limit: 2,
  contents: [{ kind: "item", item_id: 3, quantity: 20 }, { kind: "item", item_id: 82, quantity: 25 }],
};
const paidPackageExp = calculatePaidGiftPackageExp({
  student,
  giftBoxes: boxById,
  packages: [specialPackage, manufacturePackage],
  packagePlans: {
    special: { purchased: 1, inInventory: 0, planned: 0 },
    manufacture: { purchased: 1, inInventory: 0, planned: 0 },
  },
  manufacturingExpectedPerStone: 81.879452,
});
assert.equal(paidPackageExp.find((item) => item.id === "special").expectedExp, 2520);
assert.equal(paidPackageExp.find((item) => item.id === "special").goldGiftExpPerPackage, 600);
assert.equal(paidPackageExp.find((item) => item.id === "special").purpleGiftExpPerPackage, 1440);
assert.equal(paidPackageExp.find((item) => item.id === "special").bouquetExpPerPackage, 480);
assert.equal(paidPackageExp.find((item) => item.id === "manufacture").expectedExp, 2137.58904, "gold synthesis stones should use the 20-EXP-gift approximation");
assert.equal(paidPackageExp.find((item) => item.id === "manufacture").synthesisExpPerPackage, 500, "25 gold synthesis stones should add 25 × (best gold gift EXP - 40)");

const genericPackage = { id: "generic", contents: [{ kind: "item", item_id: 100008, quantity: 1 }] };
const unrelatedPackage = {
  id: "unrelated",
  gift_binding: { type: "student_specific_favorites" },
  contents: [
    { kind: "student_favorite_gift", item_id: 5112, gift_color: "purple", quantity: 6 },
    { kind: "student_favorite_gift", item_id: 5018, gift_color: "gold", quantity: 10 },
  ],
};
const mikaPackage = {
  id: "mika",
  gift_binding: { type: "student_specific_favorites", target_student_ids: [10122] },
  contents: [
    { kind: "student_favorite_gift", item_id: 5104, gift_color: "purple", quantity: 6 },
    { kind: "student_favorite_gift", item_id: 5008, gift_color: "gold", quantity: 10 },
  ],
};
assert.deepEqual(filterGiftPackagesForStudent([genericPackage, unrelatedPackage, mikaPackage], student).map((item) => item.id), ["generic", "mika"]);
const currentStudentPackage = {
  id: "current-student-package",
  current_banner_for_planning: true,
  gift_binding: { type: "student_specific_favorites", target_student_ids: [10063] },
  contents: [],
};
assert.deepEqual(filterGiftPackagesForStudent([genericPackage, currentStudentPackage], student).map((item) => item.id), ["generic"], "a released student's package cannot be reused for swimsuit Mika");
const timeline = partitionGiftPackagesForTimeline([
  { ...genericPackage, id: "current-generic" },
  { ...mikaPackage, id: "mika-launch", availability_phase: "mika_launch" },
  { ...unrelatedPackage, id: "current-unrelated", current_banner_for_planning: true },
], student);
assert.deepEqual(timeline.current.map((item) => item.id), ["current-generic"]);
assert.deepEqual(timeline.mikaLaunch.map((item) => item.id), ["mika-launch"]);

const activeCatalogForMika = paidPackagesCatalog.filter((item) => item.status === "active" || ["cn-monthly-manufacturing-98", "cn-monthly-gifts-78"].includes(item.id));
const catalogTimeline = partitionGiftPackagesForTimeline(activeCatalogForMika, student);
assert.ok(catalogTimeline.current.some((item) => item.id === "cn-third-anniversary-gifts-98"));
assert.ok(catalogTimeline.current.some((item) => item.id === "cn-third-anniversary-manufacturing-156"));
assert.ok(catalogTimeline.current.some((item) => item.id === "cn-monthly-manufacturing-98"));
assert.ok(catalogTimeline.current.some((item) => item.id === "cn-monthly-gifts-78"));
assert.equal(catalogTimeline.current.some((item) => item.id === "cn-third-anniversary-special-ii-98"), false, "Koyuki's student-specific package must not be shown for swimsuit Mika");
assert.ok(catalogTimeline.mikaLaunch.some((item) => item.id === "cn-third-anniversary-special-i-98"));
assert.ok(catalogTimeline.mikaLaunch.some((item) => item.id === "cn-third-anniversary-gifts-98@mika-launch"));
assert.ok(catalogTimeline.mikaLaunch.some((item) => item.id === "cn-third-anniversary-manufacturing-156@mika-launch"));
assert.equal(catalogTimeline.mikaLaunch.some((item) => item.id === "cn-third-anniversary-special-ii-98@mika-launch"), false);
const mikaLaunchGiftPackage = catalogTimeline.mikaLaunch.find((item) => item.id === "cn-third-anniversary-gifts-98@mika-launch");
assert.equal(mikaLaunchGiftPackage.name_zh_cn, "限定/FES学生礼物礼包", "未来上线参考礼包不能假设复刻周年名称");
assert.equal(mikaLaunchGiftPackage.name_en, "Limited/FES Student Gift Package");
assert.equal(mikaLaunchGiftPackage.name_ja, "限定/FES生徒贈り物パック");
assert.doesNotMatch(mikaLaunchGiftPackage.name_zh_cn, /周年/);
assert.doesNotMatch(mikaLaunchGiftPackage.name_zh_cn, /未花（泳装）上线/, "目标学生不能被拼进正式礼包名称");

const baseMika = JSON.parse(fs.readFileSync(new URL("../relationship_data/student_gift_preferences.json", import.meta.url), "utf8"))
  .students.find((item) => item.student_id === 10059);
const baseMikaTimeline = partitionGiftPackagesForTimeline(activeCatalogForMika, baseMika);
assert.equal(baseMikaTimeline.mikaLaunch.length, 0, "原皮未花已经实装，不应显示未花上线礼包");
const koyuki = JSON.parse(fs.readFileSync(new URL("../relationship_data/student_gift_preferences.json", import.meta.url), "utf8"))
  .students.find((item) => item.student_id === 10063);
const koyukiTimeline = partitionGiftPackagesForTimeline(activeCatalogForMika, koyuki);
assert.equal(koyukiTimeline.current.some((item) => item.id === "cn-third-anniversary-special-ii-98"), false, "常驻且已实装的小雪不应显示学生专属礼包");
assert.equal(koyukiTimeline.mikaLaunch.length, 0, "常驻且已实装的小雪不应显示预测上线礼包");
const nonLimitedFutureTimeline = partitionGiftPackagesForTimeline(activeCatalogForMika, { student_id: 99999, future_only: true });
assert.equal(nonLimitedFutureTimeline.mikaLaunch.length, 0, "未标记为限定/FES的未来学生不应显示上线礼包");

const futureFes = {
  ...student,
  student_id: 10099,
  name_zh_cn: "星野（武装）",
  name_en: "Hoshino (Armed)",
  future_only: true,
  launch_package_eligibility: "limited_or_fes",
  package_favorite_gifts: undefined,
};
const templatePackage = paidPackagesCatalog.find((item) => item.id === "cn-limited-fes-student-favorite-98-template");
const futureFesTimeline = partitionGiftPackagesForTimeline([
  ...activeCatalogForMika,
  templatePackage,
], futureFes);
assert.ok(futureFesTimeline.mikaLaunch.some((item) => item.id === "cn-limited-fes-student-favorite-98-template@10099-launch"), "另一个未实装FES学生也必须生成上线礼物礼包");
const futureFesPackage = futureFesTimeline.mikaLaunch.find((item) => item.id === "cn-limited-fes-student-favorite-98-template@10099-launch");
assert.equal(futureFesPackage.contents.find((item) => item.gift_color === "purple")?.item_id, undefined, "模板内容保留语义，由目标学生反应动态解析");
const futureFesPackageExp = calculatePaidGiftPackageExp({
  student: futureFes,
  giftBoxes: boxById,
  packages: [futureFesPackage],
  packagePlans: {},
});
assert.ok(futureFesPackageExp[0].expectedExpPerPackage > 0, "生成的学生礼包必须能计算期望好感");

const phaseProjection = calculateGiftOnlyProjection({
  student,
  thresholds,
  currentLevel: 1,
  currentProgress: 0,
  targetLevel: 1,
  state: { inventory: {}, giftBoxes: {}, equivalentGiftPools: {}, incomingResources: { giftBoxes: {}, equivalentGiftPools: {} }, giftReservations: {} },
  giftBoxes: boxById,
  packages: [{ ...specialPackage, launch_reoffer: true }],
  launchPackages: [{ ...specialPackage, id: "mika-launch-special", availability_phase: "mika_launch", launch_student_ids: [10122] }],
  packagePlans: {
    special: { purchased: 1, inInventory: 0, planned: 0 },
    "mika-launch-special": { purchased: 0, planned: 1 },
  },
});
assert.equal(phaseProjection.paidPackages.current.expectedExp, 2520);
assert.equal(phaseProjection.paidPackages.mikaLaunch.expectedExp, 2520);
assert.equal(phaseProjection.paidPackages.expectedExp, 5040);
const recommendation = recommendGiftPackagePurchases([
  { id: "value", purchased: 1, maxPurchases: 3, expectedExpPerPackage: 1500, price: 98 },
  { id: "middle", purchased: 1, maxPurchases: 2, expectedExpPerPackage: 1000, price: 100 },
  { id: "cheap", purchased: 0, maxPurchases: 2, expectedExpPerPackage: 500, price: 40 },
], 2800);
assert.deepEqual(recommendation.items.map((item) => [item.id, item.quantity]), [["value", 2]]);
assert.equal(recommendation.expectedExp, 3000);
assert.equal(recommendation.remainingGap, 0);
const incompleteRecommendation = recommendGiftPackagePurchases([
  { id: "small", purchased: 0, planned: 0, maxPurchases: 1, expectedExpPerPackage: 40, price: 10 },
], 100);
assert.equal(incompleteRecommendation.canCover, false);
assert.equal(incompleteRecommendation.usedAllAvailable, true);
assert.equal(incompleteRecommendation.remainingGap, 60);

assert.ok(student, "Mika (Swimsuit) should be available as a future planner target");
assert.equal(student.launch_package_eligibility, "limited_or_fes");
assert.equal(baseMikaCrafting.relationship_exp_per_manufacturing_stone, 83.638734);
assert.equal(student.gift_values.find((item) => item.gift_id === 5104).relationship_exp, 120);
assert.equal(student.gift_values.find((item) => item.gift_id === 5106).relationship_exp, 240);
assert.equal(student.gift_values.find((item) => item.gift_id === 5102).relationship_exp, 180);
assert.equal(student.gift_values.find((item) => item.gift_id === 5005).relationship_exp, 60);
assert.equal(student.gift_values.find((item) => item.gift_id === 5006).relationship_exp, 40);
assert.equal(student.gift_values.find((item) => item.gift_id === 5034).relationship_exp, 60);
assert.equal(student.gift_values.find((item) => item.gift_id === 5000).relationship_exp, 20);
assert.equal(student.gift_values.find((item) => item.gift_id === 5008).relationship_exp, 20);
assert.deepEqual(student.most_favorite_gifts, [5106]);
assert.deepEqual(student.package_favorite_gifts, { purple: 5106, gold: 5034 });

const studentGiftValues = Object.fromEntries(student.gift_values.map((item) => [String(item.gift_id), item.relationship_exp]));
const choiceBox = boxById.get("100008");
const randomGoldBox = boxById.get("100000");
const randomPurpleBox = boxById.get("100009");
assert.deepEqual(choiceBox.selectable_gift_ids, Array.from({ length: 35 }, (_, index) => 5000 + index));
assert.equal(choiceBox.selectable_gift_ids.includes(5106), false);
assert.equal(randomGoldBox.outcomes.some((outcome) => outcome.gift_id === 5106), false);
assert.equal(randomPurpleBox.outcomes.some((outcome) => outcome.gift_id === 5106), true);
const choiceBoxResult = calculateGiftBoxExpectedExp(choiceBox, studentGiftValues, { policy: "best_for_student" });
assert.equal(choiceBoxResult.expectedExp, 60);
assert.deepEqual(choiceBoxResult.selectedGiftIds, ["5005", "5034"]);
assert.equal(choiceBoxResult.selectableGiftCount, 35);
assert.ok(Math.abs(calculateGiftBoxExpectedExp(randomPurpleBox, studentGiftValues).expectedExp - 133.84615384615384) < 1e-9);

const projection = calculateGiftOnlyProjection({
  student,
  thresholds,
  currentLevel: 1,
  currentProgress: 0,
  targetLevel: 100,
  gifts,
  giftById,
  giftBoxes: boxById,
  state: {
    inventory: { "5106": 1, "5006": 1, "5100": 1 },
    giftBoxes: { "100008": 1 },
    equivalentGiftPools: {},
    incomingResources: { giftBoxes: {}, equivalentGiftPools: {} },
    giftReservations: {},
  },
  forecast: {
    choiceBoxes: 2,
    randomGoldBoxes: 1,
    randomPurpleBoxes: 1,
  },
  paidPackages: { expectedExp: 0 },
  manufacturingExpectedPerStone: 83.638734,
});

assert.equal(projection.requiredExp, 240225);
assert.equal(projection.current.concreteExp, 400);
assert.equal(projection.current.choiceBoxes, 1);
assert.equal(projection.current.choiceBoxExp, 60);
assert.deepEqual(projection.current.choiceBoxSelection.selectedGiftIds, ["5005", "5034"]);
assert.equal(projection.current.choiceBoxSelection.selectableGiftCount, 35);
assert.equal(projection.current.totalExpectedExp, 460);
assert.equal(projection.current.minimumChoiceBoxesNeeded, 3998);
assert.equal(projection.twoMonthFree.choiceBoxes, 2);
assert.equal(projection.twoMonthFree.randomGoldBoxes, 1);
assert.equal(projection.twoMonthFree.randomPurpleBoxes, 1);
assert.ok(Math.abs(projection.twoMonthFree.randomGoldExpectedExp - 23.428571428571438) < 1e-9);
assert.ok(Math.abs(projection.twoMonthFree.randomPurpleExpectedExp - 133.84615384615384) < 1e-9);
assert.equal(projection.twoMonthFree.minimumChoiceBoxesNeededWithoutCurrentChoiceBoxes, 3993);
assert.equal(projection.twoMonthFree.additionalChoiceBoxesNeeded, 3992);
assert.ok(Math.abs(projection.twoMonthWithPaid.gap - 239487.72527472526) < 1e-9);

const futureSynthesisOnlyProjection = calculateGiftOnlyProjection({
  student,
  thresholds,
  currentLevel: 1,
  currentProgress: 0,
  targetLevel: 2,
  gifts,
  giftById,
  giftBoxes: boxById,
  state: { inventory: {}, giftBoxes: {}, equivalentGiftPools: {}, incomingResources: {}, giftReservations: {} },
  forecast: { synthesisStones: 1 },
});
assert.equal(futureSynthesisOnlyProjection.twoMonthFree.synthesisStones, 1);
assert.equal(futureSynthesisOnlyProjection.twoMonthFree.synthesisExpectedExp, 0, "future synthesis stones need concrete gold gifts before they can contribute");
assert.equal(futureSynthesisOnlyProjection.twoMonthFree.totalExpectedExp, 0, "future synthesis stones alone must not create relationship EXP");

const zeroDayIncomingProjection = calculateGiftOnlyProjection({
  student,
  thresholds,
  currentLevel: 1,
  currentProgress: 0,
  targetLevel: 2,
  gifts,
  giftById,
  giftBoxes: boxById,
  periodDays: 0,
  state: {
    inventory: {},
    giftBoxes: {},
    equivalentGiftPools: {},
    incomingResources: { giftBoxes: { "100008": 1 }, equivalentGiftPools: {} },
    giftReservations: {},
  },
});
assert.equal(zeroDayIncomingProjection.twoMonthFree.choiceBoxes, 0, "zero-day planning must not include posted future gift boxes");
assert.equal(zeroDayIncomingProjection.twoMonthFree.totalExpectedExp, 0, "zero-day planning must not include future incoming EXP");
assert.equal(zeroDayIncomingProjection.twoMonthFree.gap, 15, "zero-day planning should report the immediate relationship gap");

console.log("gift-only planner tests passed");
