import { calculateGiftBoxExpectedExp } from "./gift-box-state.js?v=dashboard-20260824-data-refresh-v113";
import { isGoldGift } from "./inventory-state.js?v=dashboard-20260824-data-refresh-v113";
import { calculateGiftOnlyForecast, calculatePaidGiftPackageExp, partitionGiftPackagesForTimeline } from "./gift-only-planner.js?v=dashboard-20260824-data-refresh-v113";
import { calculateRequiredRelationshipExp, planGiftAllocation } from "./planner-state.js?v=dashboard-20260824-data-refresh-v113";
import { getEligibleRelationshipSources } from "./release-state.js?v=dashboard-20260824-data-refresh-v113";

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function integerOr(value, fallback = 0) {
  return Math.floor(numberOr(value, fallback));
}

function mapEntries(value) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {}).map(([key, item]) => [String(key), numberOr(item)]));
}

function valueFor(collection, id) {
  if (collection instanceof Map) return collection.get(String(id)) ?? collection.get(Number(id));
  if (Array.isArray(collection)) return collection.find((item) => String(item?.id) === String(id));
  return collection?.[String(id)] ?? collection?.[Number(id)];
}

function studentValues(student) {
  return Object.fromEntries((student?.gift_values ?? []).map((item) => [String(item.gift_id), numberOr(item.relationship_exp)]));
}

const MAX_SYNTHESIS_SEARCH_STATES = 25000;
const EXACT_SYNTHESIS_GIFT_TYPES_LIMIT = 12;
const EXACT_SYNTHESIS_UNIT_LIMIT = 24;
const EXACT_SYNTHESIS_COUNT_LIMIT = 3;

function synthesisPairs(inventory, giftById, giftValuesByStudent) {
  const giftIds = Object.entries(inventory ?? {})
    .filter(([giftId, quantity]) => integerOr(quantity) > 0 && isGoldGift(giftById?.get?.(String(giftId))))
    .map(([giftId]) => String(giftId))
    .sort((left, right) => left.localeCompare(right));
  const pairs = [];
  for (let firstIndex = 0; firstIndex < giftIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex; secondIndex < giftIds.length; secondIndex += 1) {
      const first = giftIds[firstIndex];
      const second = giftIds[secondIndex];
      if (first === second && integerOr(inventory[first]) < 2) continue;
      const opportunityExp = Math.max(0, ...[...giftValuesByStudent.values()].map((values) => numberOr(values[first]) + numberOr(values[second])));
      pairs.push({ giftIds: [first, second], opportunityExp });
    }
  }
  return pairs.sort((left, right) => left.opportunityExp - right.opportunityExp
    || left.giftIds[0].localeCompare(right.giftIds[0])
    || left.giftIds[1].localeCompare(right.giftIds[1]));
}

function synthesisPlanForGiftIds(giftIds, choiceBoxExp, synthesisStones) {
  const count = Math.min(integerOr(synthesisStones), Math.floor((giftIds?.length ?? 0) / 2));
  const consumedGiftIds = (giftIds ?? []).slice(0, count * 2).map(String);
  return {
    expectedExp: count * choiceBoxExp,
    count,
    consumedGiftIds,
  };
}

function singleStudentSynthesisGiftIds(inventory, giftById, giftValuesByStudent, studentId) {
  const values = giftValuesByStudent.get(String(studentId)) ?? {};
  return Object.entries(inventory ?? {})
    .filter(([giftId, quantity]) => integerOr(quantity) > 0 && isGoldGift(giftById?.get?.(String(giftId))))
    .flatMap(([giftId, quantity]) => Array.from({ length: integerOr(quantity) }, () => ({
      giftId: String(giftId),
      relationshipExp: numberOr(values[String(giftId)]),
    })))
    .sort((left, right) => left.relationshipExp - right.relationshipExp || left.giftId.localeCompare(right.giftId))
    .map((item) => item.giftId);
}

function synthesisGiftGroups(inventory, giftById, giftValuesByStudent, mainStudentId) {
  return Object.entries(inventory ?? {})
    .filter(([giftId, quantity]) => integerOr(quantity) > 0 && isGoldGift(giftById?.get?.(String(giftId))))
    .map(([giftId, quantity]) => {
      const values = [...giftValuesByStudent.values()].map((studentValues) => numberOr(studentValues[String(giftId)]));
      return {
        giftId: String(giftId),
        quantity: integerOr(quantity),
        mainValue: numberOr(giftValuesByStudent.get(String(mainStudentId))?.[String(giftId)]),
        globalValue: Math.max(0, ...values),
        totalValue: values.reduce((sum, value) => sum + value, 0),
      };
    });
}

function takeSynthesisGiftIds(groups, count) {
  const result = [];
  let remaining = Math.max(0, integerOr(count));
  for (const group of groups) {
    if (remaining <= 0) break;
    const take = Math.min(group.quantity, remaining);
    for (let index = 0; index < take; index += 1) result.push(group.giftId);
    remaining -= take;
  }
  return result;
}

function synthesisCountCandidates(maxCount) {
  const maximum = integerOr(maxCount);
  if (maximum <= 0) return [];
  return [...new Set([1, Math.ceil(maximum / 2), maximum])]
    .filter((count) => count > 0 && count <= maximum);
}

function directUpperBound(inventory, students, giftValuesByStudent) {
  const requiredExp = students.reduce((sum, student) => sum + numberOr(student.requiredExp), 0);
  const giftUpperBound = Object.entries(inventory ?? {}).reduce((sum, [giftId, quantity]) => {
    const maxValue = Math.max(0, ...students.map((student) => numberOr(giftValuesByStudent.get(String(student.id))?.[String(giftId)])));
    return sum + integerOr(quantity) * maxValue;
  }, 0);
  return Math.min(requiredExp, giftUpperBound);
}

function addGiftQuantities(inventory, giftIds) {
  const next = { ...inventory };
  for (const giftId of giftIds ?? []) next[String(giftId)] = integerOr(next[String(giftId)]) + 1;
  return next;
}

function removeGiftQuantities(inventory, giftIds) {
  const next = { ...inventory };
  for (const giftId of giftIds ?? []) next[String(giftId)] = Math.max(0, integerOr(next[String(giftId)]) - 1);
  return next;
}

function chooseAllocationWithSynthesis({ students, inventory, giftById, giftValuesByStudent, mainPlan, choiceBoxExp, synthesisStones, priorityStudentIds = [] }) {
  const directAllocation = (candidateInventory) => planGiftAllocation({
    students,
    inventory: candidateInventory,
    giftById,
    giftValuesByStudent,
    priorityStudentIds,
  });
  const baseline = directAllocation(inventory);
  if (!mainPlan || !(choiceBoxExp > 0) || !(synthesisStones > 0)) return { allocation: baseline, consumedGiftIds: [], searchTruncated: false };

  let best = { allocation: baseline, consumedGiftIds: [], effectiveExp: baseline.totalEffectiveExp, searchTruncated: false };
  const goldGiftCount = Object.entries(inventory).reduce((sum, [giftId, quantity]) => (
    isGoldGift(giftById?.get?.(String(giftId))) ? sum + integerOr(quantity) : sum
  ), 0);
  const maxCount = Math.min(integerOr(synthesisStones), Math.floor(goldGiftCount / 2));

  const goldGiftTypes = Object.entries(inventory).filter(([giftId, quantity]) => (
    integerOr(quantity) > 0 && isGoldGift(giftById?.get?.(String(giftId)))
  )).length;
  const exactSearchIsSmall = goldGiftTypes <= EXACT_SYNTHESIS_GIFT_TYPES_LIMIT
    && goldGiftCount <= EXACT_SYNTHESIS_UNIT_LIMIT
    && maxCount <= EXACT_SYNTHESIS_COUNT_LIMIT;

  // With one target, all concrete gifts go to that target. For a fixed number
  // of syntheses, removing the lowest-value gold gifts is therefore exact;
  // this avoids an exponential pair search for the common single-student case.
  if (students.length === 1) {
    const orderedGiftIds = singleStudentSynthesisGiftIds(inventory, giftById, giftValuesByStudent, mainPlan.id);
    const values = giftValuesByStudent.get(String(mainPlan.id)) ?? {};
    const totalConcreteExp = Object.entries(inventory).reduce((sum, [giftId, quantity]) => (
      sum + integerOr(quantity) * numberOr(values[String(giftId)])
    ), 0);
    let removedExp = 0;
    let bestCount = 0;
    for (let count = 1; count <= maxCount; count += 1) {
      const firstGiftId = orderedGiftIds[(count - 1) * 2];
      const secondGiftId = orderedGiftIds[(count - 1) * 2 + 1];
      removedExp += numberOr(values[firstGiftId]) + numberOr(values[secondGiftId]);
      const concreteExp = Math.min(numberOr(mainPlan.requiredExp), Math.max(0, totalConcreteExp - removedExp));
      const synthesisEffectiveExp = Math.min(count * choiceBoxExp, Math.max(0, numberOr(mainPlan.requiredExp) - concreteExp));
      const effectiveExp = concreteExp + synthesisEffectiveExp;
      if (effectiveExp > best.effectiveExp) {
        best.effectiveExp = effectiveExp;
        bestCount = count;
      }
    }
    if (bestCount > 0) {
      const consumedGiftIds = orderedGiftIds.slice(0, bestCount * 2);
      best = {
        allocation: directAllocation(removeGiftQuantities(inventory, consumedGiftIds)),
        consumedGiftIds,
        effectiveExp: best.effectiveExp,
        searchTruncated: false,
      };
    }
    return best;
  }

  // Multi-student exact search grows combinatorially with the number of gift
  // types and synthesis stones. A large stock should never freeze the main
  // thread, so evaluate only a few cumulative, low-sacrifice plans instead.
  // The two orders cover the two useful policies: preserve the best gift for
  // every student, or preserve the best gift for the main target first.
  if (!exactSearchIsSmall) {
    const groups = synthesisGiftGroups(inventory, giftById, giftValuesByStudent, mainPlan.id);
    const globalOrder = [...groups].sort((left, right) => left.globalValue - right.globalValue
      || left.totalValue - right.totalValue
      || left.mainValue - right.mainValue
      || left.giftId.localeCompare(right.giftId));
    const mainOrder = [...groups].sort((left, right) => left.mainValue - right.mainValue
      || left.globalValue - right.globalValue
      || left.totalValue - right.totalValue
      || left.giftId.localeCompare(right.giftId));
    const countCandidates = synthesisCountCandidates(maxCount);
    const heuristicPlans = [
      { order: globalOrder, counts: countCandidates },
      { order: mainOrder, counts: [maxCount] },
    ];
    for (const { order, counts } of heuristicPlans) {
      for (const count of counts) {
        const consumedGiftIds = takeSynthesisGiftIds(order, count * 2);
        if (consumedGiftIds.length < count * 2) continue;
        const candidateAllocation = directAllocation(removeGiftQuantities(inventory, consumedGiftIds));
        const mainResult = candidateAllocation.students.find((student) => String(student.id) === String(mainPlan.id));
        const synthesisEffectiveExp = Math.min(count * choiceBoxExp, numberOr(mainResult?.unmetExp));
        const effectiveExp = candidateAllocation.totalEffectiveExp + synthesisEffectiveExp;
        if (effectiveExp > best.effectiveExp) {
          best = { allocation: candidateAllocation, consumedGiftIds, effectiveExp, searchTruncated: true };
        }
      }
    }
    return { ...best, searchTruncated: true };
  }

  const allPairs = synthesisPairs(inventory, giftById, giftValuesByStudent);
  const candidatePairs = allPairs;
  const visitedStates = new Set();
  let searchStates = 0;
  let searchTruncated = false;

  function search(pairStart, count, workingInventory, selectedGiftIds, allocation) {
    if (count >= maxCount) return;
    if (searchStates >= MAX_SYNTHESIS_SEARCH_STATES) {
      searchTruncated = true;
      return;
    }
    const stateKey = `${pairStart}|${count}|${Object.entries(workingInventory).map(([giftId, quantity]) => `${giftId}:${quantity}`).join(",")}`;
    if (visitedStates.has(stateKey)) return;
    visitedStates.add(stateKey);
    const upperBound = directUpperBound(workingInventory, students, giftValuesByStudent)
      + Math.min((maxCount - count) * choiceBoxExp, numberOr(mainPlan.requiredExp));
    if (upperBound <= best.effectiveExp) return;

    for (let pairIndex = pairStart; pairIndex < candidatePairs.length; pairIndex += 1) {
      if (searchStates >= MAX_SYNTHESIS_SEARCH_STATES) {
        searchTruncated = true;
        return;
      }
      const pair = candidatePairs[pairIndex].giftIds;
      const firstAvailable = integerOr(workingInventory[pair[0]]);
      const secondAvailable = integerOr(workingInventory[pair[1]]);
      if (firstAvailable < 1 || secondAvailable < (pair[0] === pair[1] ? 2 : 1)) continue;
      searchStates += 1;
      const candidateInventory = removeGiftQuantities(workingInventory, pair);
      const candidateAllocation = directAllocation(candidateInventory);
      const mainResult = candidateAllocation.students.find((student) => String(student.id) === String(mainPlan.id));
      const synthesisEffectiveExp = Math.min((count + 1) * choiceBoxExp, numberOr(mainResult?.unmetExp));
      const effectiveExp = candidateAllocation.totalEffectiveExp + synthesisEffectiveExp;
      const nextGiftIds = [...selectedGiftIds, ...pair];
      if (effectiveExp > best.effectiveExp) {
        best = { allocation: candidateAllocation, consumedGiftIds: nextGiftIds, effectiveExp, searchTruncated: false };
      }
      search(pairIndex, count + 1, candidateInventory, nextGiftIds, candidateAllocation);
    }
  }
  search(0, 0, { ...inventory }, [], baseline);
  return { ...best, searchTruncated };
}

function boxExp(giftBoxes, id, student) {
  const box = valueFor(giftBoxes, id);
  if (!box || !student) return 0;
  const result = calculateGiftBoxExpectedExp(box, studentValues(student), { policy: "best_for_student" });
  return result.status === "ready" ? numberOr(result.expectedExp) : 0;
}

function periodDaysOf(value, fallback = 60) {
  const numeric = Number(value);
  const days = Number.isFinite(numeric) ? Math.floor(numeric) : integerOr(fallback, 60);
  return Math.min(366, Math.max(0, days));
}

function targetStudent(data, plan) {
  return valueFor(data?.studentById, plan?.studentId)
    ?? (data?.plannerStudents ?? data?.students ?? []).find((student) => Number(student.student_id) === Number(plan?.studentId));
}

function buildAllocation({ plans, data, state, mainTargetId, synthesisStones = 0, choiceBoxExp = 0 }) {
  const students = plans.map((plan) => {
    const student = targetStudent(data, plan);
    return {
      ...plan,
      id: plan.id,
      name: student?.name_en ?? student?.name_zh_cn ?? String(plan.studentId),
      requiredExp: calculateRequiredRelationshipExp(plan.currentLevel, plan.currentProgress, plan.targetLevel, data?.snapshots?.thresholds ?? data?.thresholds),
    };
  });
  const giftValuesByStudent = new Map(students.map((plan) => {
    const student = targetStudent(data, plan);
    return [String(plan.id), studentValues(student)];
  }));
  // Reservations are locks, not consumption. The planner must continue to
  // count them in the projected contribution until the user confirms use.
  const inventory = Object.fromEntries(Object.entries(state?.inventory ?? {}).map(([giftId, quantity]) => [String(giftId), integerOr(quantity)]));
  const mainPlan = students.find((plan) => Number(plan.studentId) === Number(mainTargetId));
  const priorityStudentIds = [
    mainPlan?.id,
    ...students.filter((plan) => Number(plan.studentId) !== Number(mainTargetId)).map((plan) => plan.id),
  ].filter(Boolean);
  const synthesisReservation = chooseAllocationWithSynthesis({
    students,
    inventory,
    giftById: data?.giftById,
    giftValuesByStudent,
    mainPlan,
    choiceBoxExp,
    synthesisStones,
    priorityStudentIds,
  });
  const allocation = synthesisReservation.allocation;
  return {
    ...allocation,
    remainingInventory: addGiftQuantities(allocation.remainingInventory, synthesisReservation.consumedGiftIds),
    synthesisGiftIds: synthesisReservation.consumedGiftIds,
    searchTruncated: Boolean(synthesisReservation.searchTruncated),
  };
}

function activePosting(state, resourceId, periodDays) {
  return (state?.resourcePostingHistory ?? []).some((item) => item?.active !== false && item.postingKey === `${resourceId}:${periodDays}`);
}

function hasActivePostingForResource(state, resourceId) {
  return (state?.resourcePostingHistory ?? []).some((item) => item?.active !== false && String(item.resourceId) === String(resourceId));
}

function currentPeriodIncoming(state, periodDays) {
  const result = {
    giftBoxes: {},
    equivalentGiftPools: {},
    stockResources: {},
    relationshipExp: {},
  };
  const seenPostingKeys = new Set();
  const postedResourceKeys = new Set();
  const hasActivePostingHistory = (state?.resourcePostingHistory ?? []).some((item) => item?.active !== false);
  for (const item of state?.resourcePostingHistory ?? []) {
    if (item?.active === false || Number(item.periodDays) !== Number(periodDays)) continue;
    const postingKey = String(item.postingKey ?? item.id ?? "");
    if (seenPostingKeys.has(postingKey)) continue;
    seenPostingKeys.add(postingKey);
    for (const bucket of Object.keys(result)) {
      for (const [id, value] of Object.entries(item.mapped?.[bucket] ?? {})) {
        postedResourceKeys.add(`${bucket}:${String(id)}`);
        result[bucket][String(id)] = numberOr(result[bucket][String(id)]) + numberOr(value);
      }
    }
  }
  // Older local states can contain confirmed incoming resources without any
  // posting history. Keep that compatibility fallback only when there is no
  // history at all; otherwise the aggregate incoming buckets may belong to a
  // different planning period and would be counted a second time.
  if (!hasActivePostingHistory) {
    for (const bucket of Object.keys(result)) {
      for (const [id, value] of Object.entries(state?.incomingResources?.[bucket] ?? {})) {
        if (postedResourceKeys.has(`${bucket}:${String(id)}`)) continue;
        result[bucket][String(id)] = numberOr(result[bucket][String(id)]) + numberOr(value);
      }
    }
  }
  return result;
}

function dailyRelationshipExp(state, studentId, periodDays, data, { includeIncoming = true, excludePostedResources = false } = {}) {
  const release = getEligibleRelationshipSources(studentId, state?.cnProgress, data?.releaseTimeline ?? []);
  if (release.giftOnly) {
    return {
      scheduleExp: 0,
      cafeExp: 0,
      totalExp: 0,
      recurringTotalExp: 0,
      incomingTotalExp: 0,
      recurring: { scheduleExp: 0, cafeExp: 0, totalExp: 0 },
      incoming: { scheduleExp: 0, cafeExp: 0, totalExp: 0 },
    };
  }
  const periodIncoming = periodDays > 0 ? currentPeriodIncoming(state, periodDays).relationshipExp : {};
  const recurring = { scheduleExp: 0, cafeExp: 0, totalExp: 0 };
  const incoming = { scheduleExp: 0, cafeExp: 0, totalExp: 0 };
  for (const resource of state?.resources ?? []) {
    if (resource?.cadence !== "daily" || resource?.unit !== "relationship_exp") continue;
    const allowed = resource.id === "daily-schedule-exp" ? release.includeSchedule : resource.id === "daily-cafe-exp" ? release.includeCafe : false;
    if (!allowed) continue;
    const isPosted = includeIncoming && periodDays > 0 && activePosting(state, resource.id, periodDays);
    if (!includeIncoming && excludePostedResources && hasActivePostingForResource(state, resource.id)) continue;
    const value = isPosted
      ? numberOr(periodIncoming[resource.id])
      : numberOr(resource.amount) * periodDays * numberOr(resource.expected_per_count);
    const bucket = isPosted ? incoming : recurring;
    if (resource.id === "daily-schedule-exp") bucket.scheduleExp += value;
    if (resource.id === "daily-cafe-exp") bucket.cafeExp += value;
  }
  recurring.totalExp = recurring.scheduleExp + recurring.cafeExp;
  incoming.totalExp = incoming.scheduleExp + incoming.cafeExp;
  return {
    scheduleExp: recurring.scheduleExp + incoming.scheduleExp,
    cafeExp: recurring.cafeExp + incoming.cafeExp,
    totalExp: recurring.totalExp + incoming.totalExp,
    recurringTotalExp: recurring.totalExp,
    incomingTotalExp: incoming.totalExp,
    recurring,
    incoming,
  };
}

function mergeIncomingForecast(state, forecast, periodDays) {
  const next = { ...forecast };
  // A zero-day snapshot describes what is available right now.  Confirmed
  // periodic resources are future arrivals, so they must not leak into the
  // zero-day contribution or close the immediate gap.
  const incoming = periodDays > 0 ? currentPeriodIncoming(state, periodDays) : {
    giftBoxes: {},
    equivalentGiftPools: {},
    stockResources: {},
    relationshipExp: {},
  };
  const incomingBoxes = mapEntries(incoming.giftBoxes);
  const incomingPools = mapEntries(incoming.equivalentGiftPools);
  const incomingStocks = mapEntries(incoming.stockResources);
  next.choiceBoxes = numberOr(next.choiceBoxes) + numberOr(incomingBoxes["100008"]);
  next.randomGoldBoxes = numberOr(next.randomGoldBoxes) + numberOr(incomingBoxes["100000"]) + numberOr(incomingPools["random-gold"]);
  next.randomPurpleBoxes = numberOr(next.randomPurpleBoxes) + numberOr(incomingBoxes["100009"]);
  next.manufacturingStones = numberOr(next.manufacturingStones) + numberOr(incomingStocks.manufacturing_stone);
  next.synthesisStones = numberOr(next.synthesisStones) + numberOr(incomingStocks.synthesis_stone_gold);
  return next;
}

function currentContribution({ state, student, allocationResult, isMain, giftBoxes, crafting, synthesisGiftIds = [] }) {
  const concreteExp = numberOr(allocationResult?.effectiveExp);
  if (!isMain || !student) return { concreteExp, boxExp: 0, randomPoolExp: 0, manufacturingExp: 0, synthesisExp: 0, totalExp: concreteExp };
  const currentBoxes = mapEntries(state?.giftBoxes);
  const currentPools = mapEntries(state?.equivalentGiftPools);
  const choiceBoxExp = boxExp(giftBoxes, "100008", student);
  const randomGoldBoxExp = boxExp(giftBoxes, "100000", student);
  const randomPurpleBoxExp = boxExp(giftBoxes, "100009", student);
  const randomPoolExp = (numberOr(currentBoxes["100000"]) + numberOr(currentPools["random-gold"])) * randomGoldBoxExp
    + numberOr(currentBoxes["100009"]) * randomPurpleBoxExp;
  const stock = mapEntries(state?.stockResources);
  const manufacturingExp = numberOr(stock.manufacturing_stone) * numberOr(crafting?.relationship_exp_per_manufacturing_stone);
  const synthesis = synthesisPlanForGiftIds(synthesisGiftIds, choiceBoxExp, numberOr(stock.synthesis_stone_gold));
  const boxExpectedExp = numberOr(currentBoxes["100008"]) * choiceBoxExp;
  return {
    concreteExp,
    boxExp: boxExpectedExp,
    randomPoolExp,
    manufacturingExp,
    synthesisExp: synthesis.expectedExp,
    synthesisCount: synthesis.count,
    synthesisConsumedGiftIds: synthesis.consumedGiftIds,
    totalExp: concreteExp + boxExpectedExp + randomPoolExp + manufacturingExp + synthesis.expectedExp,
    choiceBoxExp,
    randomGoldBoxExp,
    randomPurpleBoxExp,
  };
}

function forecastContribution({ forecast, student, giftBoxes, crafting, synthesisGiftIds = [], currentSynthesisConsumedGiftIds = [] }) {
  const choiceExp = boxExp(giftBoxes, "100008", student);
  const randomGoldExp = boxExp(giftBoxes, "100000", student);
  const randomPurpleExp = boxExp(giftBoxes, "100009", student);
  const manufacturingExp = numberOr(forecast.manufacturingStones) * numberOr(crafting?.relationship_exp_per_manufacturing_stone);
  const futureSynthesisGiftIds = synthesisGiftIds.slice(currentSynthesisConsumedGiftIds.length);
  const synthesis = synthesisPlanForGiftIds(futureSynthesisGiftIds, choiceExp, numberOr(forecast.synthesisStones));
  const choiceBoxExp = numberOr(forecast.choiceBoxes) * choiceExp;
  const randomGoldBoxExp = numberOr(forecast.randomGoldBoxes) * randomGoldExp;
  const randomPurpleBoxExp = numberOr(forecast.randomPurpleBoxes) * randomPurpleExp;
  return {
    choiceBoxExp,
    randomGoldBoxExp,
    randomPurpleBoxExp,
    manufacturingExp,
    synthesisExp: synthesis.expectedExp,
    synthesisCount: synthesis.count,
    totalExp: choiceBoxExp + randomGoldBoxExp + randomPurpleBoxExp + manufacturingExp + synthesis.expectedExp,
  };
}

function freeContribution({ state, student, studentId, isMain, includeIncoming = true, excludePostedResources = false, periodDays, data, giftBoxes, crafting, rawForecast, synthesisGiftIds = [], currentSynthesisConsumedGiftIds = [] }) {
  if (!isMain || !student) return { totalExp: 0, recurringTotalExp: 0, incomingTotalExp: 0, sourceBreakdown: {}, daily: { scheduleExp: 0, cafeExp: 0, totalExp: 0 } };
  const forecast = includeIncoming ? mergeIncomingForecast(state, rawForecast, periodDays) : rawForecast;
  const recurring = forecastContribution({ forecast: rawForecast, student, giftBoxes, crafting, synthesisGiftIds, currentSynthesisConsumedGiftIds });
  const total = forecastContribution({ forecast, student, giftBoxes, crafting, synthesisGiftIds, currentSynthesisConsumedGiftIds });
  const incoming = includeIncoming ? {
    choiceBoxExp: Math.max(0, total.choiceBoxExp - recurring.choiceBoxExp),
    randomGoldBoxExp: Math.max(0, total.randomGoldBoxExp - recurring.randomGoldBoxExp),
    randomPurpleBoxExp: Math.max(0, total.randomPurpleBoxExp - recurring.randomPurpleBoxExp),
    manufacturingExp: Math.max(0, total.manufacturingExp - recurring.manufacturingExp),
    synthesisExp: Math.max(0, total.synthesisExp - recurring.synthesisExp),
    synthesisCount: Math.max(0, total.synthesisCount - recurring.synthesisCount),
  } : {
    choiceBoxExp: 0,
    randomGoldBoxExp: 0,
    randomPurpleBoxExp: 0,
    manufacturingExp: 0,
    synthesisExp: 0,
    synthesisCount: 0,
  };
  incoming.totalExp = incoming.choiceBoxExp + incoming.randomGoldBoxExp + incoming.randomPurpleBoxExp + incoming.manufacturingExp + incoming.synthesisExp;
  const daily = dailyRelationshipExp(state, studentId, periodDays, data, { includeIncoming, excludePostedResources });
  const recurringTotalExp = recurring.totalExp + daily.recurringTotalExp;
  const incomingTotalExp = incoming.totalExp + daily.incomingTotalExp;
  return {
    totalExp: total.totalExp + daily.totalExp,
    recurringTotalExp,
    incomingTotalExp,
    sourceBreakdown: {
      choiceBoxExp: total.choiceBoxExp,
      randomGoldBoxExp: total.randomGoldBoxExp,
      randomPurpleBoxExp: total.randomPurpleBoxExp,
      manufacturingExp: total.manufacturingExp,
      synthesisExp: total.synthesisExp,
      synthesisCount: total.synthesisCount,
      daily,
      recurring: { ...recurring, daily: daily.recurring, totalExp: recurringTotalExp },
      incoming: { ...incoming, daily: daily.incoming, totalExp: incomingTotalExp },
    },
    daily,
    forecast,
  };
}

export function calculatePlanningSummary({ state = {}, targets, mainTargetId, forecastDays = 60, data = {} } = {}) {
  const plans = Array.isArray(targets) ? targets : (state.students ?? []);
  const days = periodDaysOf(forecastDays);
  const mainId = integerOr(mainTargetId ?? state.mainTargetStudentId, 0) || plans[0]?.studentId || null;
  const giftBoxes = data?.giftBoxes ?? data?.snapshots?.giftBoxes?.boxes ?? [];
  const rawForecast = calculateGiftOnlyForecast(state, { periodDays: days, rewardSnapshot: data?.snapshots?.unlimitedAssaultRewards ?? data?.unlimitedAssaultRewards });
  const ratePeriodDays = days > 0 ? days : 1;
  const rateRawForecast = days > 0
    ? rawForecast
    : calculateGiftOnlyForecast(state, { periodDays: ratePeriodDays, rewardSnapshot: data?.snapshots?.unlimitedAssaultRewards ?? data?.unlimitedAssaultRewards });
  const forecast = mergeIncomingForecast(state, rawForecast, days);
  const mainStudent = plans.find((plan) => Number(plan.studentId) === Number(mainId));
  const mainStudentData = mainStudent ? targetStudent(data, mainStudent) : null;
  const choiceBoxExp = boxExp(giftBoxes, "100008", mainStudentData);
  const allocation = buildAllocation({
    plans,
    data,
    state,
    mainTargetId: mainId,
    choiceBoxExp,
    synthesisStones: numberOr(state?.stockResources?.synthesis_stone_gold) + numberOr(forecast.synthesisStones),
  });
  const priorityStudents = [
    allocation.students.find((allocated) => Number(allocated.studentId) === Number(mainId)),
    ...allocation.students.filter((allocated) => Number(allocated.studentId) !== Number(mainId)),
  ].filter(Boolean);
  const resultByPlanId = new Map();
  let previousCompletionDays = 0;
  let previousCompletionUnknown = false;
  for (const allocated of priorityStudents) {
    const student = targetStudent(data, allocated);
    const release = getEligibleRelationshipSources(allocated.studentId, state.cnProgress, data.releaseTimeline ?? []);
    const requiredExp = numberOr(allocated.requiredExp);
    const isMain = Number(allocated.studentId) === Number(mainId);
    const crafting = valueFor(data?.craftingById, allocated.studentId);
    const current = currentContribution({ state, student, allocationResult: allocated, isMain, giftBoxes, crafting, synthesisGiftIds: allocation.synthesisGiftIds });
    const startDay = isMain ? 0 : previousCompletionUnknown ? null : previousCompletionDays;
    const availableDays = startDay === null ? 0 : Math.max(0, days - startDay);
    const actualPeriodDays = isMain ? days : availableDays;
    const actualRawForecast = isMain
      ? rawForecast
      : calculateGiftOnlyForecast(state, {
        periodDays: actualPeriodDays,
        rewardSnapshot: data?.snapshots?.unlimitedAssaultRewards ?? data?.unlimitedAssaultRewards,
        excludePostedResources: true,
      });
    const free = freeContribution({
      state,
      student,
      studentId: allocated.studentId,
      isMain: true,
      includeIncoming: isMain,
      excludePostedResources: !isMain,
      periodDays: actualPeriodDays,
      data,
      giftBoxes,
      crafting,
      rawForecast: actualRawForecast,
      synthesisGiftIds: isMain ? allocation.synthesisGiftIds : [],
      currentSynthesisConsumedGiftIds: isMain ? current.synthesisConsumedGiftIds : [],
    });
    const rateForecast = isMain
      ? rateRawForecast
      : calculateGiftOnlyForecast(state, {
        periodDays: ratePeriodDays,
        rewardSnapshot: data?.snapshots?.unlimitedAssaultRewards ?? data?.unlimitedAssaultRewards,
        excludePostedResources: true,
      });
    const rateFree = freeContribution({
        state,
        student,
        studentId: allocated.studentId,
        isMain: true,
        includeIncoming: isMain,
        excludePostedResources: !isMain,
        periodDays: ratePeriodDays,
        data,
        giftBoxes,
        crafting,
        rawForecast: rateForecast,
        synthesisGiftIds: isMain ? allocation.synthesisGiftIds : [],
        currentSynthesisConsumedGiftIds: isMain ? current.synthesisConsumedGiftIds : [],
      });
    const totalExpectedExp = current.totalExp + free.totalExp;
    const gapWithinPeriod = Math.max(0, requiredExp - totalExpectedExp);
    const recurringFreeExp = numberOr(rateFree.recurringTotalExp);
    const incomingFreeExp = days > 0 ? numberOr(free.incomingTotalExp) : 0;
    const freeExpPerDay = recurringFreeExp / ratePeriodDays;
    const immediateGap = Math.max(0, requiredExp - current.totalExp);
    const gapAfterIncoming = Math.max(0, immediateGap - incomingFreeExp);
    const ownDays = gapAfterIncoming <= 0 ? 0 : freeExpPerDay > 0 ? Math.ceil(gapAfterIncoming / freeExpPerDay) : null;
    const estimatedDays = ownDays === null
      ? null
      : ownDays === 0
        ? 0
        : (isMain ? 0 : previousCompletionDays) + ownDays;
    if (ownDays === null) {
      previousCompletionUnknown = true;
    } else if (!previousCompletionUnknown) {
      previousCompletionDays = ownDays === 0 ? previousCompletionDays : (isMain ? 0 : previousCompletionDays) + ownDays;
    }
    resultByPlanId.set(String(allocated.id), {
      studentId: allocated.studentId,
      planId: allocated.id,
      requiredExp,
      currentExp: current.totalExp,
      freeExp: free.totalExp,
      totalExpectedExp,
      immediateGap,
      gapWithinPeriod,
      freeExpPerDay,
      recurringFreeExp,
      incomingFreeExp,
      estimatedDays,
      releaseStatus: release.status,
      isMainTarget: isMain,
      sourceBreakdown: { current, free: { ...free.sourceBreakdown, forecast: free.forecast } },
    });
  }
  const students = allocation.students.map((allocated) => resultByPlanId.get(String(allocated.id)));
  return { forecastDays: days, mainTargetId: mainId, students, allocation };
}

export function calculatePackageEfficiency({ student, packageCatalog, packages, packagePlans = {}, giftBoxes, manufacturingData, periodDays = 60 } = {}) {
  const catalog = packages ?? packageCatalog?.packages ?? packageCatalog ?? [];
  const eligible = partitionGiftPackagesForTimeline(catalog, student);
  const rows = [...eligible.current, ...eligible.mikaLaunch];
  const crafting = manufacturingData ?? {};
  const allRows = calculatePaidGiftPackageExp({
    student,
    giftBoxes: giftBoxes instanceof Map ? giftBoxes : new Map((giftBoxes ?? []).map((box) => [String(box.id), box])),
    packages: rows,
    packagePlans: {},
    periodDays,
    manufacturingExpectedPerStone: numberOr(crafting.relationship_exp_per_manufacturing_stone),
  });
  return allRows.map((row) => {
    const item = rows.find((candidate) => String(candidate.id) === String(row.id));
    const plan = packagePlans?.[row.planId] ?? packagePlans?.[row.catalogId] ?? {};
    const purchaseLimit = numberOr(row.maxPurchases);
    const purchased = Math.min(purchaseLimit, integerOr(plan.purchased));
    const planned = Math.min(Math.max(0, purchaseLimit - purchased), integerOr(plan.planned));
    const availablePurchases = Math.max(0, purchaseLimit - purchased - planned);
    const price = numberOr(item?.price_cny);
    return {
      packageId: row.catalogId ?? row.id,
      rowId: row.id,
      timelineId: row.timelineId,
      name: row.name_zh_cn ?? item?.name_zh_cn ?? item?.name_en ?? row.id,
      name_zh_cn: row.name_zh_cn ?? item?.name_zh_cn ?? item?.name_en ?? row.id,
      name_en: row.name_en ?? item?.name_en ?? item?.name_zh_cn ?? row.id,
      name_ja: row.name_ja ?? item?.name_ja ?? item?.name_en ?? item?.name_zh_cn ?? row.id,
      price,
      purchaseLimit,
      purchasedCount: purchased,
      plannedCount: planned,
      availablePurchases,
      expectedExp: numberOr(row.expectedExpPerPackage),
      expPerYuan: price > 0 ? numberOr(row.expectedExpPerPackage) / price : null,
      goldGiftExp: numberOr(row.goldGiftExpPerPackage),
      purpleGiftExp: numberOr(row.purpleGiftExpPerPackage),
      bouquetExp: numberOr(row.bouquetExpPerPackage),
      choiceBoxExp: numberOr(row.choiceBoxExpPerPackage),
      randomBoxExp: numberOr(row.randomBoxExpPerPackage),
      manufacturingExp: numberOr(row.manufacturingExpPerPackage),
      synthesisExp: numberOr(row.synthesisExpPerPackage),
      source: item?.source ?? null,
      asOf: item?.asOf ?? packageCatalog?.asOf ?? null,
      contents: item?.contents ?? [],
    };
  }).sort((left, right) => numberOr(right.expPerYuan, -1) - numberOr(left.expPerYuan, -1) || String(left.packageId).localeCompare(String(right.packageId)));
}
