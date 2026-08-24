import { calculateGiftBoxExpectedExp } from "./gift-box-state.js?v=dashboard-20260824-data-refresh-v113";
import { calculateRequiredRelationshipExp } from "./planner-state.js?v=dashboard-20260824-data-refresh-v113";
import { calculatePeriodicResourceAmount, calculateSynthesisStoneSourceForecast, summarizeUnlimitedAssaultRewards } from "./resource-model.js?v=dashboard-20260824-data-refresh-v113";

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function integerOr(value, fallback = 0) {
  return Math.floor(numberOr(value, fallback));
}

function valueFor(collection, id) {
  if (collection instanceof Map) return collection.get(String(id)) ?? collection.get(Number(id));
  return collection?.[String(id)] ?? collection?.[Number(id)];
}

function valuesForStudent(student) {
  return Object.fromEntries((student?.gift_values ?? []).map((item) => [String(item.gift_id), numberOr(item.relationship_exp)]));
}

function boxExpectedExp(giftBoxes, boxId, giftValues) {
  const box = valueFor(giftBoxes, boxId);
  if (!box) return 0;
  const result = calculateGiftBoxExpectedExp(box, giftValues, { policy: "best_for_student" });
  return result.status === "ready" ? numberOr(result.expectedExp) : 0;
}

function boxCalculation(giftBoxes, boxId, giftValues) {
  const box = valueFor(giftBoxes, boxId);
  if (!box) return { status: "missing_box_definition", expectedExp: null };
  return calculateGiftBoxExpectedExp(box, giftValues, { policy: "best_for_student" });
}

function mapEntries(value) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {}).map(([key, item]) => [String(key), numberOr(item)]));
}

function sumConcreteExp(state, giftValues) {
  const inventory = mapEntries(state?.inventory);
  const reservations = mapEntries(state?.giftReservations);
  return Object.entries(inventory).reduce((sum, [giftId, count]) => {
    const available = Math.max(0, Math.floor(count - numberOr(reservations[giftId])));
    return sum + available * numberOr(giftValues[giftId]);
  }, 0);
}

function synthesisExpFromInventory(state, giftById, giftValues, choiceBoxExp, synthesisStones) {
  if (!giftById?.get || choiceBoxExp <= 0 || synthesisStones <= 0) return { expectedExp: 0, count: 0 };
  const values = Object.entries(state?.inventory ?? {})
    .flatMap(([giftId, count]) => {
      if (giftById.get(String(giftId))?.rarity !== "SR") return [];
      const available = Math.max(0, integerOr(count) - integerOr(state?.giftReservations?.[giftId]));
      return Array.from({ length: available }, () => numberOr(giftValues[String(giftId)]));
    })
    .sort((left, right) => left - right);
  const maxCount = Math.min(integerOr(synthesisStones), Math.floor(values.length / 2));
  let expectedExp = 0;
  let count = 0;
  for (let index = 0; index < maxCount; index += 1) {
    const netExp = choiceBoxExp - values[index * 2] - values[index * 2 + 1];
    if (netExp <= 0) break;
    expectedExp += netExp;
    count += 1;
  }
  return { expectedExp, count };
}

function positiveGap(requiredExp, coveredExp) {
  return Math.max(0, requiredExp - coveredExp);
}

function choiceBoxesNeeded(requiredExp, coveredExp, choiceBoxExp) {
  if (choiceBoxExp <= 0) return null;
  return Math.ceil(positiveGap(requiredExp, coveredExp) / choiceBoxExp);
}

function cadenceMultiplier(resource, periodDays) {
  if (resource?.cadence === "daily") return periodDays;
  if (resource?.cadence === "weekly") return periodDays / 7;
  if (resource?.cadence === "monthly") return periodDays / 30;
  return 0;
}

/**
 * Build the two-month gift-only forecast from the editable periodic-resource
 * rows. Schedule/Cafe relationship EXP are omitted; manufacturing and synthesis
 * stones are converted using the same planning assumptions as paid bundles.
 * A posted row is already present in incomingResources and is not duplicated.
 */
export function calculateGiftOnlyForecast(state, { periodDays = 60, rewardSnapshot, excludePostedResources = false } = {}) {
  const forecast = {
    choiceBoxes: 0,
    randomGoldBoxes: 0,
    randomPurpleBoxes: 0,
    manufacturingStones: 0,
    synthesisStones: 0,
  };
  const managedSynthesisSources = (state?.resources ?? []).some((resource) => [
    "monthly-synthesis-stones",
    "monthly-unlimited-assault-gift-boxes",
  ].includes(resource?.id));
  const isPostedResource = (resource) => state?.resourcePostingHistory?.some((item) => item.active !== false && (
    item.postingKey === `${resource.id}:${periodDays}`
    || (excludePostedResources && item.resourceId === resource.id)
  ));
  for (const resource of state?.resources ?? []) {
    if (resource?.amount === null || resource?.amount === undefined || resource?.amount === "") continue;
    const isPosted = isPostedResource(resource);
    if (isPosted) continue;
    const multiplier = cadenceMultiplier(resource, periodDays);
    const effectiveAmount = calculatePeriodicResourceAmount(resource, resource.amount, state?.resources ?? []);
    const amount = numberOr(effectiveAmount) * multiplier;
    if (resource.input_kind === "floor") {
      const summary = summarizeUnlimitedAssaultRewards(rewardSnapshot, resource.amount);
      if (!summary) continue;
      forecast.choiceBoxes += numberOr(summary.goldSelectableGifts) * multiplier;
      forecast.randomPurpleBoxes += numberOr(summary.purpleRandomGifts) * multiplier;
      if (!managedSynthesisSources) forecast.synthesisStones += numberOr(summary.synthesisStones) * multiplier;
      continue;
    }
    if (resource.unit === "gift_equivalent") {
      forecast.randomGoldBoxes += amount;
      continue;
    }
    if (resource.unit === "manufacturing_stone") {
      forecast.manufacturingStones += amount;
      continue;
    }
    if (resource.unit === "synthesis_stone_gold") {
      if (!managedSynthesisSources) forecast.synthesisStones += amount;
      continue;
    }
    if (resource.unit !== "gift_box") continue;
    for (const breakdown of resource.gift_box_breakdown ?? []) {
      const quantity = numberOr(breakdown.amount) * multiplier;
      if (String(breakdown.gift_box_id) === "100008") forecast.choiceBoxes += quantity;
      if (String(breakdown.gift_box_id) === "100000") forecast.randomGoldBoxes += quantity;
      if (String(breakdown.gift_box_id) === "100009") forecast.randomPurpleBoxes += quantity;
    }
    if (resource.gift_box_id === "100008") forecast.choiceBoxes += amount;
    if (resource.gift_box_id === "100000") forecast.randomGoldBoxes += amount;
    if (resource.gift_box_id === "100009") forecast.randomPurpleBoxes += amount;
  }
  if (managedSynthesisSources) {
    const synthesisForecast = calculateSynthesisStoneSourceForecast(
      state?.resources ?? [],
      periodDays,
      rewardSnapshot,
    );
    const managedIds = new Set([
      "monthly-synthesis-stones",
      "monthly-unlimited-assault-gift-boxes",
    ]);
    const activePostings = (state?.resourcePostingHistory ?? []).filter((item) => item.active !== false
      && managedIds.has(item.resourceId)
      && Number(item.periodDays) === Number(periodDays));
    const postingsHaveMappedAmounts = activePostings.length > 0 && activePostings.every((item) => Number.isFinite(
      Number(item?.mapped?.stockResources?.synthesis_stone_gold),
    ));
    if (!excludePostedResources && postingsHaveMappedAmounts) {
      const postedAmount = activePostings.reduce(
        (sum, item) => sum + numberOr(item.mapped.stockResources.synthesis_stone_gold),
        0,
      );
      forecast.synthesisStones = Math.max(0, synthesisForecast.total - postedAmount);
    } else {
      forecast.synthesisStones = calculateSynthesisStoneSourceForecast(
        state?.resources ?? [],
        periodDays,
        rewardSnapshot,
        { isResourcePosted: isPostedResource },
      ).total;
    }
  }
  return forecast;
}

function sourceSummary({
  choiceBoxes,
  randomGoldBoxes,
  randomPurpleBoxes,
  manufacturingStones,
  synthesisStones,
  choiceBoxExp,
  randomGoldExp,
  randomPurpleExp,
  manufacturingExpectedPerStone,
}) {
  const choiceExp = choiceBoxes * choiceBoxExp;
  const randomGoldExpectedExp = randomGoldBoxes * randomGoldExp;
  const randomPurpleExpectedExp = randomPurpleBoxes * randomPurpleExp;
  const manufacturingExpectedExp = manufacturingStones * manufacturingExpectedPerStone;
  // Synthesis stones are conditional materials, not gifts.  Without two
  // concrete gold gifts available to consume, they cannot contribute EXP.
  // The gift-only forecast has no concrete allocation for future stones, so
  // keep the quantity visible but do not turn it into relationship EXP.
  const synthesisExpectedExp = 0;
  return {
    choiceBoxes,
    randomGoldBoxes,
    randomPurpleBoxes,
    manufacturingStones: numberOr(manufacturingStones),
    synthesisStones: numberOr(synthesisStones),
    choiceBoxExp,
    randomGoldExpectedExp,
    randomPurpleExpectedExp,
    manufacturingExpectedExp,
    synthesisExpectedExp,
    expectedExp: choiceExp + randomGoldExpectedExp + randomPurpleExpectedExp + manufacturingExpectedExp + synthesisExpectedExp,
  };
}

const PAID_GIFT_MIN_EXP = Object.freeze({ gold: 20, purple: 120 });

/**
 * A gold synthesis stone is valued as a choice gift made from two spare
 * 20-EXP gold gifts.  The two inputs account for 40 EXP, so only the
 * selectable gift's excess value is credited.  This is intentionally an
 * approximation for package comparison; actual inventory synthesis keeps
 * its exact two-gift allocation logic elsewhere.
 */
export function calculateSynthesisStoneEquivalentExp(student) {
  const bestGoldGiftExp = Math.max(
    0,
    ...(student?.gift_values ?? [])
      .filter((gift) => Number(gift?.gift_id) >= 5000 && Number(gift?.gift_id) <= 5034)
      .map((gift) => numberOr(gift?.relationship_exp)),
  );
  return Math.max(0, bestGoldGiftExp - 40);
}

function isEligibleStudentLaunchTarget(student) {
  return student?.future_only === true && student?.launch_package_eligibility === "limited_or_fes";
}

function launchPackageDisplayNames(item) {
  const isStudentSpecific = item?.gift_binding?.type === "student_specific_favorites";
  const isManufacturing = item?.category === "manufacturing";
  const names = isStudentSpecific
    ? {
      name_zh_cn: "限定/FES学生专属礼物礼包",
      name_en: "Limited/FES Student Favorite Gift Package",
      name_ja: "限定/FES生徒専用贈り物パック",
    }
    : isManufacturing
      ? {
        name_zh_cn: "限定/FES学生制造礼包",
        name_en: "Limited/FES Student Manufacturing Package",
        name_ja: "限定/FES生徒製造パック",
      }
      : {
        name_zh_cn: "限定/FES学生礼物礼包",
        name_en: "Limited/FES Student Gift Package",
        name_ja: "限定/FES生徒贈り物パック",
      };
  return { ...item, ...names };
}

function materializeStudentLaunchTemplate(template, student) {
  const studentId = Number(student?.student_id);
  const id = `${template.id}@${studentId}-launch`;
  return launchPackageDisplayNames({
    ...template,
    id,
    plan_id: id,
    catalog_id: template.id,
    timeline_id: "mika-launch",
    availability_phase: "student_launch",
    launch_student_ids: [studentId],
    status: "forecast",
    gift_binding: {
      ...template.gift_binding,
      target_student_ids: [studentId],
      target_student_id: studentId,
    },
  });
}

/**
 * Student-specific packages are forecast packages for an unreleased
 * limited/FES student only. They must never leak into a released permanent
 * student's package list, even when the catalog row is marked as the current
 * banner. Generic packages remain available to every target.
 */
export function filterGiftPackagesForStudent(packages = [], student) {
  const studentId = Number(student?.student_id);
  return packages.filter((item) => {
    if (["expired", "template"].includes(item?.status)) return false;
    const binding = item?.gift_binding;
    if (binding?.type === "student_specific_favorites") {
      if (!isEligibleStudentLaunchTarget(student)) return false;
      const targetIds = Array.isArray(binding.target_student_ids)
        ? binding.target_student_ids.map(Number)
        : binding.target_student_id === null || binding.target_student_id === undefined
          ? []
          : [Number(binding.target_student_id)];
      return targetIds.includes(studentId);
    }
    // Current-banner flags are valid for generic packages only. A generic
    // package can be compared for any planned student; a student-specific
    // package was handled above and is intentionally not allowed through.
    return true;
  });
}

/**
 * Split the catalog into packages available now and packages that are opened
 * again when the selected future student launches. A package can opt into the
 * latter with availability_phase: "student_launch" or "mika_launch"; generic
 * permanent/active packages stay in the current phase.
 */
export function partitionGiftPackagesForTimeline(packages = [], student) {
  const studentId = Number(student?.student_id);
  const eligible = filterGiftPackagesForStudent(packages, student);
  const current = eligible.filter((item) => (
    !["student_launch", "mika_launch"].includes(item?.availability_phase)
      && item?.gift_binding?.type !== "student_specific_favorites"
  ));
  // A launch phase belongs to an unreleased planner target. Without this
  // guard, the generic `launch_reoffer` flag is also copied into the already
  // released base Mika (10059), making the package page look as if her
  // swimsuit launch bundle were available for the original student.
  const canShowLaunchPackages = isEligibleStudentLaunchTarget(student);
  let mikaLaunch = [];
  if (canShowLaunchPackages) {
    mikaLaunch = eligible
      .filter((item) => ["student_launch", "mika_launch"].includes(item?.availability_phase)
        && (!Array.isArray(item?.launch_student_ids) || item.launch_student_ids.map(Number).includes(studentId)))
      .map((item) => launchPackageDisplayNames({ ...item, plan_id: item.plan_id ?? item.id, timeline_id: "mika-launch", catalog_id: item.id }));
    for (const item of current) {
      if (!item?.launch_reoffer) continue;
      mikaLaunch.push(launchPackageDisplayNames({
        ...item,
        id: `${item.id}@mika-launch`,
        plan_id: `${item.id}@mika-launch`,
        timeline_id: "mika-launch",
        catalog_id: item.id,
        availability_phase: "student_launch",
      }));
    }
    const hasStudentSpecificLaunchPackage = mikaLaunch.some((item) => {
      const targetIds = item?.gift_binding?.target_student_ids ?? [];
      return Array.isArray(targetIds) && targetIds.map(Number).includes(studentId);
    });
    const template = packages.find((item) => (
      item?.status === "template"
      && item?.gift_binding?.type === "student_specific_favorites"
      && item?.gift_binding?.repeat_rule === "one_per_limited_or_fes_student"
    ));
    if (template && !hasStudentSpecificLaunchPackage) {
      mikaLaunch.push(materializeStudentLaunchTemplate(template, student));
    }
  }
  return {
    current,
    mikaLaunch,
  };
}

function addPackagePlans(...planSets) {
  return Object.assign({}, ...planSets.filter((plan) => plan && typeof plan === "object"));
}

function packagePurchaseLimit(item, periodDays = 60) {
  const limit = integerOr(item?.purchase_limit, 0);
  if (item?.cadence === "monthly") return limit * Math.max(1, Math.ceil(numberOr(periodDays, 60) / 30));
  return limit;
}

function packagePlanFor(packagePlans, item) {
  const source = packagePlans?.[item.plan_id ?? item.id] ?? {};
  return {
    purchased: integerOr(source.purchased, 0),
    inInventory: Math.min(integerOr(source.inInventory, 0), integerOr(source.purchased, 0)),
    planned: integerOr(source.planned, 0),
  };
}

function emptyPackageContentExp() {
  return { expectedExp: 0, giftExp: 0, goldGiftExp: 0, purpleGiftExp: 0, bouquetExp: 0, boxExp: 0, choiceBoxExp: 0, randomBoxExp: 0, manufacturingExp: 0, synthesisExp: 0, manufacturingStones: 0, synthesisStones: 0 };
}

const PACKAGE_GIFT_RANGES = Object.freeze({
  purple: [5100, 5112],
  gold: [5000, 5034],
});

export function resolveStudentFavoriteGiftId(student, giftColor) {
  const explicitId = Number(student?.package_favorite_gifts?.[giftColor]);
  if (Number.isFinite(explicitId) && explicitId > 0) return explicitId;
  const range = PACKAGE_GIFT_RANGES[giftColor];
  if (!range) return null;
  return (student?.gift_values ?? [])
    .filter((gift) => Number(gift?.gift_id) >= range[0] && Number(gift?.gift_id) <= range[1])
    .sort((left, right) => numberOr(right.relationship_exp) - numberOr(left.relationship_exp) || Number(left.gift_id) - Number(right.gift_id))[0]
    ?.gift_id ?? null;
}

function resolveStudentFavoriteContent(content, student) {
  if (content?.kind !== "student_favorite_gift") return content;
  const resolvedId = resolveStudentFavoriteGiftId(student, content.gift_color);
  if (resolvedId === null || resolvedId === undefined || resolvedId === "") return content;
  return { ...content, item_id: resolvedId };
}

function packageContentExp(content, giftValues, { choiceBoxExp, randomGoldBoxExp, randomPurpleBoxExp, manufacturingExpectedPerStone, synthesisStoneEquivalentExp }) {
  const quantity = numberOr(content?.quantity);
  if (!quantity) return emptyPackageContentExp();
  if (content?.kind === "student_favorite_gift") {
    const giftExp = giftValues[String(content.item_id)] ?? PAID_GIFT_MIN_EXP[content.gift_color] ?? 0;
    return { ...emptyPackageContentExp(), expectedExp: quantity * giftExp, giftExp: quantity * giftExp, goldGiftExp: content.gift_color === "gold" ? quantity * giftExp : 0, purpleGiftExp: content.gift_color === "purple" ? quantity * giftExp : 0 };
  }
  const itemId = String(content?.item_id ?? "");
  if (itemId === "100008") return { ...emptyPackageContentExp(), expectedExp: quantity * choiceBoxExp, boxExp: quantity * choiceBoxExp, choiceBoxExp: quantity * choiceBoxExp };
  if (itemId === "100000") return { ...emptyPackageContentExp(), expectedExp: quantity * randomGoldBoxExp, boxExp: quantity * randomGoldBoxExp, randomBoxExp: quantity * randomGoldBoxExp };
  if (itemId === "100009") return { ...emptyPackageContentExp(), expectedExp: quantity * randomPurpleBoxExp, boxExp: quantity * randomPurpleBoxExp, randomBoxExp: quantity * randomPurpleBoxExp };
  if (itemId === "3") return { ...emptyPackageContentExp(), expectedExp: quantity * manufacturingExpectedPerStone, manufacturingExp: quantity * manufacturingExpectedPerStone, manufacturingStones: quantity };
  if (itemId === "82") {
    const synthesisExp = quantity * numberOr(synthesisStoneEquivalentExp);
    return { ...emptyPackageContentExp(), expectedExp: synthesisExp, synthesisExp, synthesisStones: quantity };
  }
  const isGold = content?.gift_color === "gold" || (Number(itemId) >= 5000 && Number(itemId) <= 5034);
  const isPurple = content?.gift_color === "purple" || (Number(itemId) >= 5100 && Number(itemId) <= 5112);
  const giftExp = isGold ? PAID_GIFT_MIN_EXP.gold : isPurple ? PAID_GIFT_MIN_EXP.purple : (itemId === "5997" ? 240 : giftValues[itemId] ?? 0);
  return { ...emptyPackageContentExp(), expectedExp: quantity * giftExp, giftExp: quantity * giftExp, goldGiftExp: isGold ? quantity * giftExp : 0, purpleGiftExp: isPurple ? quantity * giftExp : 0, bouquetExp: itemId === "5997" ? quantity * giftExp : 0 };
}

export function calculatePaidGiftPackageExp({
  student,
  giftBoxes,
  packages = [],
  packagePlans,
  packagePurchases = {},
  periodDays = 60,
  manufacturingExpectedPerStone = 0,
}) {
  const giftValues = valuesForStudent(student);
  const synthesisStoneEquivalentExp = calculateSynthesisStoneEquivalentExp(student);
  const choiceBoxExp = boxExpectedExp(giftBoxes, "100008", giftValues);
  const randomGoldBoxExp = boxExpectedExp(giftBoxes, "100000", giftValues);
  const randomPurpleBoxExp = boxExpectedExp(giftBoxes, "100009", giftValues);
  return packages.map((item) => {
    const plan = packagePlans ? packagePlanFor(packagePlans, item) : { purchased: integerOr(packagePurchases[item.id], 0), planned: 0 };
    const maxPurchases = packagePurchaseLimit(item, periodDays);
    const purchased = Math.min(maxPurchases, plan.purchased);
    const inInventory = Math.min(purchased, plan.inInventory);
    const planned = Math.min(Math.max(0, maxPurchases - purchased), plan.planned);
    const expectedPurchases = Math.max(0, purchased - inInventory) + planned;
    const breakdown = (item.contents ?? []).reduce((sum, content) => {
      const unit = packageContentExp(resolveStudentFavoriteContent(content, student), giftValues, {
        choiceBoxExp,
        randomGoldBoxExp,
        randomPurpleBoxExp,
        manufacturingExpectedPerStone,
        synthesisStoneEquivalentExp,
      });
      return {
        expectedExp: sum.expectedExp + unit.expectedExp * expectedPurchases,
        giftExp: sum.giftExp + unit.giftExp * expectedPurchases,
        goldGiftExp: sum.goldGiftExp + unit.goldGiftExp * expectedPurchases,
        purpleGiftExp: sum.purpleGiftExp + unit.purpleGiftExp * expectedPurchases,
        bouquetExp: sum.bouquetExp + unit.bouquetExp * expectedPurchases,
        boxExp: sum.boxExp + unit.boxExp * expectedPurchases,
        choiceBoxExp: sum.choiceBoxExp + unit.choiceBoxExp * expectedPurchases,
        randomBoxExp: sum.randomBoxExp + unit.randomBoxExp * expectedPurchases,
        manufacturingExp: sum.manufacturingExp + unit.manufacturingExp * expectedPurchases,
        synthesisExp: sum.synthesisExp + unit.synthesisExp * expectedPurchases,
        manufacturingStones: sum.manufacturingStones + unit.manufacturingStones * expectedPurchases,
        synthesisStones: sum.synthesisStones + unit.synthesisStones * expectedPurchases,
      };
    }, emptyPackageContentExp());
    const perPackageBreakdown = (item.contents ?? []).reduce((sum, content) => {
      const unit = packageContentExp(resolveStudentFavoriteContent(content, student), giftValues, {
        choiceBoxExp,
        randomGoldBoxExp,
        randomPurpleBoxExp,
        manufacturingExpectedPerStone,
        synthesisStoneEquivalentExp,
      });
      return {
        expectedExp: sum.expectedExp + unit.expectedExp,
        giftExp: sum.giftExp + unit.giftExp,
        goldGiftExp: sum.goldGiftExp + unit.goldGiftExp,
        purpleGiftExp: sum.purpleGiftExp + unit.purpleGiftExp,
        bouquetExp: sum.bouquetExp + unit.bouquetExp,
        boxExp: sum.boxExp + unit.boxExp,
        choiceBoxExp: sum.choiceBoxExp + unit.choiceBoxExp,
        randomBoxExp: sum.randomBoxExp + unit.randomBoxExp,
        manufacturingExp: sum.manufacturingExp + unit.manufacturingExp,
        synthesisExp: sum.synthesisExp + unit.synthesisExp,
        manufacturingStones: sum.manufacturingStones + unit.manufacturingStones,
        synthesisStones: sum.synthesisStones + unit.synthesisStones,
      };
    }, emptyPackageContentExp());
    return {
      id: item.id,
      catalogId: item.catalog_id ?? item.id,
      planId: item.plan_id ?? item.id,
      timelineId: item.timeline_id ?? "current",
      purchases: expectedPurchases,
      purchased,
      inInventory,
      planned,
      expectedPurchases,
      maxPurchases,
      price: numberOr(item.price_cny),
      totalCost: (purchased + planned) * numberOr(item.price_cny),
      alreadyPaidCost: purchased * numberOr(item.price_cny),
      plannedCost: planned * numberOr(item.price_cny),
      expectedExpPerPackage: perPackageBreakdown.expectedExp,
      goldGiftExpPerPackage: perPackageBreakdown.goldGiftExp,
      purpleGiftExpPerPackage: perPackageBreakdown.purpleGiftExp,
      bouquetExpPerPackage: perPackageBreakdown.bouquetExp,
      boxExpPerPackage: perPackageBreakdown.boxExp,
      choiceBoxExpPerPackage: perPackageBreakdown.choiceBoxExp,
      randomBoxExpPerPackage: perPackageBreakdown.randomBoxExp,
      manufacturingExpPerPackage: perPackageBreakdown.manufacturingExp,
      synthesisExpPerPackage: perPackageBreakdown.synthesisExp,
      manufacturingStonesPerPackage: perPackageBreakdown.manufacturingStones,
      synthesisStonesPerPackage: perPackageBreakdown.synthesisStones,
      ...breakdown,
    };
  });
}

export function summarizePaidGiftPackages(rows = []) {
  return rows.reduce((sum, row) => ({
    purchases: sum.purchases + numberOr(row.purchases),
    totalCost: sum.totalCost + numberOr(row.totalCost),
    plannedCost: sum.plannedCost + numberOr(row.plannedCost),
    alreadyPaidCost: sum.alreadyPaidCost + numberOr(row.alreadyPaidCost),
    expectedExp: sum.expectedExp + numberOr(row.expectedExp),
    giftExp: sum.giftExp + numberOr(row.giftExp),
    goldGiftExp: sum.goldGiftExp + numberOr(row.goldGiftExp),
    purpleGiftExp: sum.purpleGiftExp + numberOr(row.purpleGiftExp),
    bouquetExp: sum.bouquetExp + numberOr(row.bouquetExp),
    boxExp: sum.boxExp + numberOr(row.boxExp),
    manufacturingExp: sum.manufacturingExp + numberOr(row.manufacturingExp),
    synthesisExp: sum.synthesisExp + numberOr(row.synthesisExp),
    manufacturingStones: sum.manufacturingStones + numberOr(row.manufacturingStones),
    synthesisStones: sum.synthesisStones + numberOr(row.synthesisStones),
  }), { purchases: 0, totalCost: 0, plannedCost: 0, alreadyPaidCost: 0, expectedExp: 0, giftExp: 0, goldGiftExp: 0, purpleGiftExp: 0, bouquetExp: 0, boxExp: 0, manufacturingExp: 0, synthesisExp: 0, manufacturingStones: 0, synthesisStones: 0 });
}

function isBetterPackagePlan(candidate, current, targetExp) {
  if (!current) return true;
  const candidateCovers = candidate.expectedExp >= targetExp;
  const currentCovers = current.expectedExp >= targetExp;
  if (candidateCovers !== currentCovers) return candidateCovers;
  if (candidateCovers) {
    if (candidate.totalCost !== current.totalCost) return candidate.totalCost < current.totalCost;
    if (candidate.expectedExp !== current.expectedExp) return candidate.expectedExp < current.expectedExp;
  } else {
    if (candidate.expectedExp !== current.expectedExp) return candidate.expectedExp > current.expectedExp;
    if (candidate.totalCost !== current.totalCost) return candidate.totalCost < current.totalCost;
  }
  if (candidate.quantity !== current.quantity) return candidate.quantity < current.quantity;
  return candidate.signature < current.signature;
}

/**
 * Recommend additional purchases from finite package limits.
 * Existing purchases and manually planned purchases are not recommended again.
 * When the available catalog cannot cover the gap, the fallback buys every
 * remaining eligible package so the user sees the maximum possible coverage.
 */
export function recommendGiftPackagePurchases(rows = [], gap = 0) {
  const targetExp = numberOr(gap);
  const candidates = rows.map((row) => ({
    row,
    id: String(row.id),
    price: numberOr(row.price),
    expectedExpPerPackage: numberOr(row.expectedExpPerPackage),
    maxAdditional: Math.max(0, integerOr(row.maxPurchases) - integerOr(row.purchased) - integerOr(row.planned)),
  })).filter((item) => item.maxAdditional > 0 && (item.expectedExpPerPackage > 0 || item.price > 0));

  if (targetExp <= 0 || !candidates.length) {
    return { items: [], expectedExp: 0, totalCost: 0, remainingGap: targetExp, canCover: targetExp <= 0 };
  }

  let best = null;
  function visit(index, expectedExp, totalCost, quantity, selections) {
    if (index >= candidates.length) {
      const itemSelections = selections.filter((item) => item.quantity > 0);
      const signature = itemSelections.map((item) => `${item.id}:${item.quantity}`).join("|");
      const candidate = { expectedExp, totalCost, quantity, selections: itemSelections, signature };
      if (isBetterPackagePlan(candidate, best, targetExp)) best = candidate;
      return;
    }
    const item = candidates[index];
    for (let count = 0; count <= item.maxAdditional; count += 1) {
      visit(index + 1, expectedExp + count * item.expectedExpPerPackage, totalCost + count * item.price, quantity + count, [...selections, { id: item.id, quantity: count }]);
    }
  }
  visit(0, 0, 0, 0, []);

  const selectedById = new Map(candidates.map((item) => [item.id, item]));
  const items = (best?.selections ?? []).map((selection) => {
    const candidate = selectedById.get(selection.id);
    return {
      id: selection.id,
      quantity: selection.quantity,
      price: candidate.price,
      expectedExp: selection.quantity * candidate.expectedExpPerPackage,
      maxAdditional: candidate.maxAdditional,
    };
  });
  const expectedExp = numberOr(best?.expectedExp);
  return {
    items,
    expectedExp,
    totalCost: numberOr(best?.totalCost),
    remainingGap: positiveGap(targetExp, expectedExp),
    canCover: expectedExp >= targetExp,
    usedAllAvailable: !best || expectedExp < targetExp,
  };
}

/**
 * Calculate a future student's gift-only relationship plan.
 * Random boxes and equivalent pools remain expectations; choice boxes use
 * the student's best selectable craftable gold gift.
 */
export function calculateGiftOnlyProjection({
  student,
  thresholds,
  currentLevel = 1,
  currentProgress = 0,
  targetLevel = 100,
  state = {},
  gifts = [],
  giftById,
  giftBoxes,
  forecast = {},
  packages = [],
  launchPackages = [],
  packagePlans = {},
  periodDays = 60,
  manufacturingExpectedPerStone = 81.879452,
  paidPackages,
}) {
  const giftValues = valuesForStudent(student);
  const requiredExp = calculateRequiredRelationshipExp(currentLevel, currentProgress, targetLevel, thresholds);
  const concreteExp = sumConcreteExp(state, giftValues);
  const choiceBoxCalculation = boxCalculation(giftBoxes, "100008", giftValues);
  const choiceBoxExp = choiceBoxCalculation.status === "ready" ? numberOr(choiceBoxCalculation.expectedExp) : 0;
  const randomGoldBoxExp = boxExpectedExp(giftBoxes, "100000", giftValues);
  const randomPurpleBoxExp = boxExpectedExp(giftBoxes, "100009", giftValues);
  const currentGiftBoxes = mapEntries(state.giftBoxes);
  const currentPools = mapEntries(state.equivalentGiftPools);
  const currentIncomingBoxes = mapEntries(state.incomingResources?.giftBoxes);
  const currentIncomingPools = mapEntries(state.incomingResources?.equivalentGiftPools);
  const includeIncomingResources = Number(periodDays) > 0;
  const currentChoiceBoxes = currentGiftBoxes["100008"] ?? 0;
  const currentRandomGoldBoxes = (currentGiftBoxes["100000"] ?? 0) + (currentPools["random-gold"] ?? 0);
  const currentRandomPurpleBoxes = currentGiftBoxes["100009"] ?? 0;
  const currentIncomingChoiceBoxes = currentIncomingBoxes["100008"] ?? 0;
  const currentIncomingRandomGoldBoxes = (currentIncomingBoxes["100000"] ?? 0) + (currentIncomingPools["random-gold"] ?? 0);
  const currentIncomingRandomPurpleBoxes = currentIncomingBoxes["100009"] ?? 0;
  const currentStockResources = mapEntries(state.stockResources);
  const currentManufacturingStones = currentStockResources.manufacturing_stone ?? 0;
  const currentSynthesisStones = currentStockResources.synthesis_stone_gold ?? 0;
  const currentRandomExpectedExp = currentRandomGoldBoxes * randomGoldBoxExp + currentRandomPurpleBoxes * randomPurpleBoxExp;
  const currentManufacturingExpectedExp = currentManufacturingStones * numberOr(manufacturingExpectedPerStone);
  const inventorySynthesis = synthesisExpFromInventory(state, giftById, giftValues, choiceBoxExp, currentSynthesisStones);
  const currentSynthesisExpectedExp = inventorySynthesis.expectedExp;
  const currentStockExpectedExp = currentManufacturingExpectedExp + currentSynthesisExpectedExp;
  const currentTotalExpectedExp = concreteExp + currentRandomExpectedExp + currentChoiceBoxes * choiceBoxExp + currentStockExpectedExp;
  const currentDirectExp = concreteExp + currentRandomExpectedExp + currentStockExpectedExp;
  const forecastSources = sourceSummary({
    choiceBoxes: numberOr(forecast.choiceBoxes) + (includeIncomingResources ? currentIncomingChoiceBoxes : 0),
    randomGoldBoxes: numberOr(forecast.randomGoldBoxes) + (includeIncomingResources ? currentIncomingRandomGoldBoxes : 0),
    randomPurpleBoxes: numberOr(forecast.randomPurpleBoxes) + (includeIncomingResources ? currentIncomingRandomPurpleBoxes : 0),
    manufacturingStones: numberOr(forecast.manufacturingStones),
    synthesisStones: numberOr(forecast.synthesisStones),
    choiceBoxExp,
    randomGoldExp: randomGoldBoxExp,
    randomPurpleExp: randomPurpleBoxExp,
    manufacturingExpectedPerStone,
  });
  const timelinePackages = partitionGiftPackagesForTimeline(packages, student);
  const currentPackageRows = timelinePackages.current.length ? calculatePaidGiftPackageExp({ student, giftBoxes, packages: timelinePackages.current, packagePlans, periodDays, manufacturingExpectedPerStone }) : [];
  const launchTimelinePackages = partitionGiftPackagesForTimeline(launchPackages, student).mikaLaunch;
  const launchPackageRows = launchTimelinePackages.length ? calculatePaidGiftPackageExp({ student, giftBoxes, packages: launchTimelinePackages, packagePlans, periodDays: 1, manufacturingExpectedPerStone }) : [];
  const currentPaidSummary = summarizePaidGiftPackages(currentPackageRows);
  const launchPaidSummary = summarizePaidGiftPackages(launchPackageRows);
  const paidRows = [...currentPackageRows, ...launchPackageRows];
  const paidSummary = paidPackages ?? summarizePaidGiftPackages(paidRows);
  const twoMonthFreeTotalExpectedExp = currentTotalExpectedExp + forecastSources.expectedExp;
  const twoMonthFreeDirectExp = currentDirectExp + forecastSources.expectedExp;
  const twoMonthTotalExpectedExp = twoMonthFreeTotalExpectedExp + numberOr(paidSummary.expectedExp);
  const currentChoiceBoxesNeeded = choiceBoxesNeeded(requiredExp, currentDirectExp, choiceBoxExp);
  const twoMonthChoiceBoxesNeededWithoutCurrent = choiceBoxesNeeded(requiredExp, twoMonthFreeDirectExp, choiceBoxExp);
  const twoMonthAdditionalChoiceBoxesNeeded = choiceBoxesNeeded(requiredExp, twoMonthTotalExpectedExp, choiceBoxExp);
  const packageGap = positiveGap(requiredExp, twoMonthTotalExpectedExp);
  const packageRecommendation = recommendGiftPackagePurchases(paidRows, packageGap);

  return {
    studentId: student?.student_id ?? null,
    requiredExp,
    targetLevel,
    current: {
      concreteExp,
      currentRandomGoldBoxes,
      currentRandomPurpleBoxes,
      randomGoldBoxExp: randomGoldBoxExp,
      randomPurpleBoxExp: randomPurpleBoxExp,
      randomExpectedExp: currentRandomExpectedExp,
      choiceBoxes: currentChoiceBoxes,
      choiceBoxExp,
      choiceBoxSelection: choiceBoxCalculation,
      manufacturingStones: currentManufacturingStones,
      manufacturingExpectedExp: currentManufacturingExpectedExp,
      synthesisStones: currentSynthesisStones,
      synthesisExpectedExp: currentSynthesisExpectedExp,
      stockExpectedExp: currentStockExpectedExp,
      directExp: currentDirectExp,
      totalExpectedExp: currentTotalExpectedExp,
      gap: positiveGap(requiredExp, currentTotalExpectedExp),
      minimumChoiceBoxesNeeded: currentChoiceBoxesNeeded,
      additionalChoiceBoxesNeeded: choiceBoxesNeeded(requiredExp, currentTotalExpectedExp, choiceBoxExp),
      choiceBoxesAfterGoal: currentChoiceBoxes - Math.min(currentChoiceBoxes, currentChoiceBoxesNeeded ?? 0),
    },
    twoMonthFree: {
      ...forecastSources,
      currentChoiceBoxes,
      totalChoiceBoxes: currentChoiceBoxes + forecastSources.choiceBoxes,
      totalExpectedExp: twoMonthFreeTotalExpectedExp,
      directExpWithoutCurrentChoiceBoxes: twoMonthFreeDirectExp,
      gap: positiveGap(requiredExp, twoMonthFreeTotalExpectedExp),
      minimumChoiceBoxesNeededWithoutCurrentChoiceBoxes: twoMonthChoiceBoxesNeededWithoutCurrent,
      additionalChoiceBoxesNeeded: choiceBoxesNeeded(requiredExp, twoMonthFreeTotalExpectedExp, choiceBoxExp),
      choiceBoxesAfterGoal: currentChoiceBoxes + forecastSources.choiceBoxes - Math.min(currentChoiceBoxes + forecastSources.choiceBoxes, twoMonthChoiceBoxesNeededWithoutCurrent ?? 0),
    },
    twoMonthWithPaid: {
      ...paidSummary,
      totalManufacturingStones: forecastSources.manufacturingStones + numberOr(paidSummary.manufacturingStones),
      totalSynthesisStones: forecastSources.synthesisStones + numberOr(paidSummary.synthesisStones),
      totalExpectedExp: twoMonthTotalExpectedExp,
      gap: positiveGap(requiredExp, twoMonthTotalExpectedExp),
      additionalChoiceBoxesNeeded: twoMonthAdditionalChoiceBoxesNeeded,
      recommendedPackageExp: packageRecommendation.expectedExp,
      recommendedPackageCost: packageRecommendation.totalCost,
      recommendedGap: packageRecommendation.remainingGap,
      packageRecommendation,
    },
    paidPackages: {
      rows: paidRows,
      current: { rows: currentPackageRows, ...currentPaidSummary },
      mikaLaunch: { rows: launchPackageRows, ...launchPaidSummary },
      ...paidSummary,
    },
    giftValues,
    giftById,
    gifts,
  };
}
