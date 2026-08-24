import { addStudentPlan, normalizePlannerState, removeStudentPlan, setMainTargetStudent } from "./planner-state.js?v=dashboard-20260824-data-refresh-v113";
import { calculateRelationshipSourceForecast, getEligibleRelationshipSources, getStudentReleaseStatus, normalizeCnProgress } from "./release-state.js?v=dashboard-20260824-data-refresh-v113";
import { calculateGiftOnlyForecast } from "./gift-only-planner.js?v=dashboard-20260824-data-refresh-v113";
import { calculatePackageEfficiency, calculatePlanningSummary } from "./planning-summary.js?v=dashboard-20260824-data-refresh-v113";
import { text as t } from "./i18n.js?v=dashboard-20260824-data-refresh-v113";

const ALLOWED_CHANGE_KINDS = new Set([
  // Kept for compatibility with older Harness responses.
  "set_student_target",
  "add_student_goal",
  "update_student_goal",
  "remove_student_goal",
  "set_main_target",
  "set_forecast_days",
  "reorder_student_goals",
  "set_cn_cutoff_student",
]);
const ALLOWED_CHANGE_FIELDS = Object.freeze({
  set_student_target: new Set(["kind", "studentId", "currentLevel", "currentProgress", "targetLevel"]),
  add_student_goal: new Set(["kind", "studentId", "currentLevel", "currentProgress", "targetLevel"]),
  update_student_goal: new Set(["kind", "studentId", "currentLevel", "currentProgress", "targetLevel"]),
  remove_student_goal: new Set(["kind", "studentId"]),
  set_main_target: new Set(["kind", "studentId"]),
  set_forecast_days: new Set(["kind", "value"]),
  reorder_student_goals: new Set(["kind", "studentIds"]),
  set_cn_cutoff_student: new Set(["kind", "studentId"]),
});
const PLANNING_ACTIONS = Object.freeze([
  { kind: "add_student_goal", fields: ["studentId", "currentLevel", "currentProgress", "targetLevel"], description: "Add or replace a planned student goal." },
  { kind: "update_student_goal", fields: ["studentId", "currentLevel", "currentProgress", "targetLevel"], description: "Update an existing planned student's fields; studentId must already be planned." },
  { kind: "remove_student_goal", fields: ["studentId"], description: "Remove an existing planned student goal." },
  { kind: "set_main_target", fields: ["studentId"], description: "Set an existing planned student as the main target; studentId may be null to clear it." },
  { kind: "set_forecast_days", fields: ["value"], description: "Set the forecast period from 0 to 366 days." },
  { kind: "reorder_student_goals", fields: ["studentIds"], description: "Reorder all planned students without dropping any student." },
  { kind: "set_cn_cutoff_student", fields: ["studentId"], description: "Change the CN release cutoff using a student from the full timeline." },
]);

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integerOr(value, fallback = 0) {
  return Math.max(0, Math.floor(numberOr(value, fallback)));
}

function hasFiniteNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function canReuseConfiguredProxy({ configured = false, configuredBaseUrl = "", configuredModel = "", baseUrl = "", model = "" } = {}) {
  return configured
    && String(configuredBaseUrl).trim() === String(baseUrl).trim()
    && String(configuredModel).trim() === String(model).trim();
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function parseCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const arabic = text.match(/\d+(?:\.\d+)?/);
  if (arabic) return Number(arabic[0]);
  const chinese = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (Object.hasOwn(chinese, text)) return chinese[text];
  return null;
}

function conversationText(conversation = []) {
  return (Array.isArray(conversation) ? conversation : [])
    .filter((item) => item?.role === "user" && typeof item.content === "string")
    .map((item) => item.content)
    .join("\n");
}

/**
 * Extract explicit numeric facts from the user's conversation for this one
 * calculation. These are never persisted into the planner state and are not
 * treated as researched game data.
 */
export function extractConversationFacts(conversation = []) {
  const text = conversationText(conversation);
  const currentLevelMatch = text.match(/(?:从|按照|当前|现为|原皮[，, ]*)\s*(\d+)\s*(?:级|level)/i)
    ?? text.match(/(\d+)\s*级\s*(?:提升|升到|到)/i);
  const currentProgressMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:经验|exp)/i);
  const targetLevelMatch = text.match(/(?:提升到|升到|到|目标(?:为|是)?)[\s:：]*(\d+)\s*(?:级|level)/i);
  const countToken = "(\\d+(?:\\.\\d+)?|零|一|二|两|三|四|五|六|七|八|九|十)";
  const scheduleMatch = text.match(new RegExp(`(?:日程|schedule)(?:每天|每日)?(?:摸头|邀请)?\\s*(?:为|是|每天|每日)?\\s*${countToken}\\s*(?:次)?(?!个月)`, "i"));
  const cafeMatch = text.match(new RegExp(`(?:咖啡厅|咖啡|cafe)(?:每天|每日)?(?:摸头|邀请)?\\s*(?:为|是|每天|每日)?\\s*${countToken}\\s*(?:次)?(?!个月)`, "i"))
    ?? text.match(new RegExp(`(?:每日|每天)\\s*(?:摸头|邀请)\\s*(?:为|是)?\\s*${countToken}\\s*(?:次)?(?!个月)`, "i"));
  const dayMatch = text.match(/(\d+)\s*(?:天|days?)/i);
  const studentHints = [...text.matchAll(/((?:mika|米卡|未花)[^，。！？\n]{0,12})/ig)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .filter((hint, index, list) => list.indexOf(hint) === index);
  return {
    currentLevel: currentLevelMatch ? parseCount(currentLevelMatch[1]) : null,
    currentProgress: currentProgressMatch ? parseCount(currentProgressMatch[1]) : null,
    dailyCafeCount: cafeMatch ? parseCount(cafeMatch[1]) : null,
    dailyScheduleCount: scheduleMatch ? parseCount(scheduleMatch[1]) : null,
    forecastDays: dayMatch ? parseCount(dayMatch[1]) : null,
    targetLevel: targetLevelMatch ? parseCount(targetLevelMatch[1]) : null,
    studentHints,
  };
}

function mergeConversationFacts(historyFacts, latestFacts) {
  const fields = ["currentLevel", "currentProgress", "dailyCafeCount", "dailyScheduleCount", "forecastDays", "targetLevel"];
  return {
    ...historyFacts,
    ...Object.fromEntries(fields.map((field) => [
      field,
      latestFacts?.[field] !== null && latestFacts?.[field] !== undefined
        ? latestFacts[field]
        : historyFacts?.[field] ?? null,
    ])),
    // A new student name is a scope change. Do not carry an old Mika hint
    // into the next turn when the current message names another costume.
    studentHints: latestFacts?.studentHints?.length ? latestFacts.studentHints : historyFacts?.studentHints ?? [],
  };
}

function hasPlanningScope(text = "") {
  return /(?:规划|计划|怎么|如何|提升|需要多少|缺多少|(?<![不未])计入|未来.{0,12}(?:天|周|个月)|\d+\s*(?:天|周|个月)|raise|plan|need|how can)/i.test(text);
}

function requestsGiftOnly(text = "") {
  return /(?:只|仅|只能|完全).{0,8}(?:礼物|gift)|(?:不|无需|不要).{0,8}(?:日程|咖啡厅|摸头|schedule|cafe)|gift[ -]?only/i.test(text);
}

function requestsRelationshipSources(text = "") {
  return /(?:日程|咖啡厅|摸头|schedule|cafe)/i.test(text);
}

function studentNameAliases(student) {
  return [student?.name_zh_cn, student?.name_zh, student?.name_en, student?.name_ja]
    .filter((name) => typeof name === "string" && name.trim())
    .flatMap((name) => {
      const value = name.trim();
      const withoutCostume = value.replace(/\s*[（(][^）)]*[）)]\s*/g, " ").trim();
      return [...new Set([value, withoutCostume].filter(Boolean))];
    });
}

function findRequestedStudentIds(text, data) {
  const students = data?.plannerStudents ?? data?.students ?? [];
  const originalHint = /(?:原皮|普通版|常驻版|original|base)/i.test(text);
  const costumeHint = /(?:泳装|水着|swimsuit|夏日|夏服|礼服|新年|正月|holiday|costume)/i.test(text);
  const isCostumeVariant = (student) => {
    const names = [student?.name_zh_cn, student?.name_en, student?.name_ja].filter(Boolean).join(" ");
    return /[（(].+[）)]|泳装|水着|swimsuit|夏日|夏服|礼服|新年|正月|holiday|costume/i.test(names);
  };
  return students
    .map((student) => ({ student, aliases: studentNameAliases(student) }))
    .sort((left, right) => Math.max(...right.aliases.map((alias) => alias.length), 0) - Math.max(...left.aliases.map((alias) => alias.length), 0))
    .filter(({ student, aliases }) => {
      if (!aliases.some((alias) => text.includes(alias))) return false;
      if (originalHint && !costumeHint && isCostumeVariant(student)) return false;
      if (costumeHint && !originalHint && !isCostumeVariant(student)) return false;
      return true;
    })
    .map(({ student }) => Number(student.student_id))
    .filter((studentId, index, ids) => Number.isFinite(studentId) && ids.indexOf(studentId) === index);
}

function effectiveStateFromConversation(state, facts, data, requestedStudentIds = []) {
  const normalized = normalizePlannerState(state);
  const resources = normalized.resources.map((resource) => {
    if (resource.id === "daily-schedule-exp" && facts.dailyScheduleCount !== null) {
      return { ...resource, amount: facts.dailyScheduleCount, value_source: "conversation" };
    }
    if (resource.id === "daily-cafe-exp" && facts.dailyCafeCount !== null) {
      return { ...resource, amount: facts.dailyCafeCount, value_source: "conversation" };
    }
    return resource;
  });
  let students = normalized.students;
  const requestedIds = new Set(requestedStudentIds.map(Number));
  if (facts.currentLevel !== null || facts.currentProgress !== null || facts.targetLevel !== null) {
    const hint = facts.studentHints.join(" ").toLowerCase();
    const candidates = students.filter((plan) => {
      const student = data?.studentById?.get(String(plan.studentId));
      const names = [student?.name_zh_cn, student?.name_en, student?.name_ja].filter(Boolean).join(" ").toLowerCase();
      if (requestedIds.size) return requestedIds.has(Number(plan.studentId));
      return !hint || names.includes(hint) || hint.includes(names) || /mika|米卡|未花/.test(hint) && /mika|米卡|未花/.test(names);
    });
    const targetPlans = candidates.length === 1 ? candidates : students.length === 1 ? students : [];
    students = students.map((plan) => targetPlans.some((target) => target.id === plan.id)
      ? {
        ...plan,
        currentLevel: facts.currentLevel ?? plan.currentLevel,
        currentProgress: facts.currentProgress ?? plan.currentProgress,
        targetLevel: facts.targetLevel ?? plan.targetLevel,
      }
      : plan);
    const existingIds = new Set(students.map((plan) => Number(plan.studentId)));
    const transientPlans = [...requestedIds]
      .filter((studentId) => !existingIds.has(studentId))
      .map((studentId) => ({
        studentId,
        currentLevel: facts.currentLevel ?? 1,
        currentProgress: facts.currentProgress ?? 0,
        targetLevel: facts.targetLevel ?? facts.currentLevel ?? 1,
      }));
    students = [...students, ...transientPlans];
  }
  return {
    ...normalized,
    forecastDays: facts.forecastDays ?? normalized.forecastDays,
    resources,
    students,
  };
}

function buildCalculatedResults(normalizedState, data) {
  const rawForecast = calculateGiftOnlyForecast(normalizedState, {
    periodDays: normalizedState.forecastDays,
    rewardSnapshot: data?.snapshots?.unlimitedAssaultRewards,
  });
  const summary = calculatePlanningSummary({ state: normalizedState, targets: normalizedState.students, mainTargetId: normalizedState.mainTargetStudentId, forecastDays: normalizedState.forecastDays, data });
  // The summary is the canonical path for the current period: it merges
  // already-posted incoming resources with resources that are still forecast.
  // Reusing its main-target forecast keeps the Agent context from showing a
  // smaller raw number than the planning page after a manual posting.
  const mainProjection = summary.students.find((item) => item.isMainTarget);
  const forecast = mainProjection?.sourceBreakdown?.free?.forecast ?? rawForecast;
  const projections = (normalizedState.students ?? []).map((plan) => {
    const item = summary.students.find((candidate) => Number(candidate.studentId) === Number(plan.studentId));
    const student = data?.studentById?.get(String(plan.studentId));
    if (!item || !student) return null;
    const release = getEligibleRelationshipSources(plan.studentId, normalizedState.cnProgress, data?.releaseTimeline ?? []);
    return {
      studentId: plan.studentId,
      release,
      relationshipSources: { ...(item.sourceBreakdown?.free?.daily ?? { totalExp: 0 }), included: release.status === "released" },
      projection: item,
      combined: {
        requiredExp: item.requiredExp,
        totalExpectedExp: item.totalExpectedExp,
        relationshipExp: item.sourceBreakdown?.free?.daily?.totalExp ?? 0,
        giftExp: Math.max(0, item.totalExpectedExp - (item.sourceBreakdown?.free?.daily?.totalExp ?? 0)),
        gap: item.gapWithinPeriod,
        complete: item.gapWithinPeriod <= 0,
      },
    };
  }).filter(Boolean);
  const packageCatalog = data?.packageCatalog ?? data?.snapshots?.packages;
  const giftBoxList = data?.giftBoxes ?? data?.snapshots?.giftBoxes?.boxes ?? [];
  const packageEfficiency = (normalizedState.students ?? []).map((plan) => {
    const student = data?.studentById?.get(String(plan.studentId));
    if (!student) return null;
    return {
      studentId: plan.studentId,
      packages: calculatePackageEfficiency({
        student,
        packageCatalog,
        packagePlans: normalizedState.packagePlans,
        giftBoxes: giftBoxList,
        manufacturingData: data?.craftingById?.get(String(plan.studentId)),
        periodDays: normalizedState.forecastDays,
      }),
    };
  }).filter(Boolean);
  return {
    forecast,
    projections,
    packageEfficiency: {
      mainTargetId: normalizedState.mainTargetStudentId,
      students: packageEfficiency,
    },
  };
}

export function calculateStudentPlan({ state, studentId, data } = {}) {
  const normalizedState = normalizePlannerState(state);
  const plan = normalizedState.students.find((item) => Number(item.studentId) === Number(studentId));
  if (!plan) return null;
  const summary = calculatePlanningSummary({ state: normalizedState, targets: normalizedState.students, mainTargetId: normalizedState.mainTargetStudentId, forecastDays: normalizedState.forecastDays, data });
  const item = summary.students.find((candidate) => Number(candidate.studentId) === Number(studentId));
  return item ? { studentId: plan.studentId, projection: item, combined: { requiredExp: item.requiredExp, totalExpectedExp: item.totalExpectedExp, gap: item.gapWithinPeriod, complete: item.gapWithinPeriod <= 0 } } : null;
}

export function calculateResourceContribution({ state, studentId, data } = {}) {
  const normalizedState = normalizePlannerState(state);
  const result = calculateRelationshipSourceForecast({ state: normalizedState, studentId, cnProgress: normalizedState.cnProgress, timeline: data?.releaseTimeline ?? [], periodDays: normalizedState.forecastDays });
  const hasMainTarget = normalizedState.students.length > 0 && normalizedState.mainTargetStudentId !== null;
  if (hasMainTarget && Number(normalizedState.mainTargetStudentId) !== Number(studentId)) {
    return { ...result, scheduleExp: 0, cafeExp: 0, totalExp: 0, shared: false };
  }
  return { ...result, shared: true };
}

export function calculatePackageNeed({ projection } = {}) {
  return safeJson(projection?.twoMonthWithPaid?.packageRecommendation ?? null);
}

export function buildAgentContext(state, calculatedResults, data, { message = "", conversation = [], locale = "zh_cn" } = {}) {
  const historyFacts = extractConversationFacts(conversation);
  const latestFacts = extractConversationFacts(message ? [{ role: "user", content: message }] : []);
  const facts = mergeConversationFacts(historyFacts, latestFacts);
  const requestText = [message, conversationText(conversation)].filter(Boolean).join("\n");
  const requestedStudentIds = findRequestedStudentIds(message, data);
  // If the latest message is a follow-up without a student name, use the
  // conversation scope. If it names a student, that latest scope wins.
  const scopedRequestedStudentIds = requestedStudentIds.length
    ? requestedStudentIds
    : findRequestedStudentIds(requestText, data);
  const normalizedState = effectiveStateFromConversation(state, facts, data, scopedRequestedStudentIds);
  const timeline = data?.releaseTimeline ?? [];
  const cnProgress = normalizeCnProgress(normalizedState.cnProgress, timeline, data?.plannerStudents ?? data?.students ?? []);
  const students = (data?.plannerStudents ?? data?.students ?? []).map((student) => ({
    studentId: Number(student.student_id),
    names: { zh_cn: student.name_zh_cn ?? null, en: student.name_en ?? null, ja: student.name_ja ?? null },
    futureOnly: student.future_only === true,
    release: getEligibleRelationshipSources(student.student_id, cnProgress, timeline),
    planned: normalizedState.students.find((plan) => Number(plan.studentId) === Number(student.student_id)) ?? null,
  }));
  const packageCatalog = data?.packageCatalog ?? data?.snapshots?.packages;
  const calculated = { ...(calculatedResults ?? {}), giftPlanning: buildCalculatedResults(normalizedState, data) };
  const plannedReleasedStudents = normalizedState.students
    .map((plan) => students.find((student) => Number(student.studentId) === Number(plan.studentId)))
    .filter((student) => student?.release?.status === "released");
  const resourcesById = new Map(normalizedState.resources.map((resource) => [resource.id, resource]));
  const missingUserInputs = [];
  if (plannedReleasedStudents.length) {
    const schedule = resourcesById.get("daily-schedule-exp");
    if (schedule && (schedule.amount === null || schedule.amount === undefined || schedule.amount === "")) {
      missingUserInputs.push({
        id: "daily-schedule-count",
        question: t(locale, "agentMissingScheduleQuestion"),
        answerPatterns: ["日程.{0,12}\\d+", "schedule.{0,12}\\d+"],
      });
    }
    const cafe = resourcesById.get("daily-cafe-exp");
    if (cafe && (cafe.amount === null || cafe.amount === undefined || cafe.amount === "")) {
      missingUserInputs.push({
        id: "daily-cafe-count",
        question: t(locale, "agentMissingCafeQuestion"),
        answerPatterns: ["咖啡厅.{0,12}\\d+", "咖啡.{0,12}\\d+", "cafe.{0,12}\\d+"],
      });
    }
  }
  const tower = resourcesById.get("monthly-unlimited-assault-gift-boxes");
  if (tower && (tower.amount === null || tower.amount === undefined || tower.amount === "")) {
    missingUserInputs.push({
      id: "unlimited-assault-floor",
      question: t(locale, "agentMissingTowerQuestion"),
      answerPatterns: ["\\d+\\s*层", "floor.{0,8}\\d+"],
    });
  }
  const giftOnly = requestsGiftOnly(requestText);
  const relationshipRequested = requestsRelationshipSources(requestText);
  const shouldAskForRelationshipSources = plannedReleasedStudents.length > 0
    && !giftOnly
    && (relationshipRequested || hasPlanningScope(requestText));
  const relevantMissingUserInputs = missingUserInputs.filter((item) => {
    if (["daily-schedule-count", "daily-cafe-count"].includes(item.id)) return shouldAskForRelationshipSources;
    return hasPlanningScope(requestText);
  });
  const plannedStudentFacts = normalizedState.students.map((plan) => {
    const student = students.find((item) => Number(item.studentId) === Number(plan.studentId));
    const projection = calculated.giftPlanning.projections.find((item) => Number(item.studentId) === Number(plan.studentId));
    return {
      studentId: plan.studentId,
      names: student?.names ?? {},
      plan,
      release: student?.release ?? null,
      relationshipSources: projection?.relationshipSources ?? null,
      calculated: projection?.combined ?? null,
    };
  });
  return {
    schemaVersion: 2,
    server: "cn",
    generatedAt: new Date().toISOString(),
    cnProgress,
    students,
    disclosure: {
      mode: "progressive",
      order: ["confirmedFacts", "calculatedResults", "relevantMissingUserInputs", "optionalMissingUserInputs"],
      instruction: "Use confirmed facts and calculated results first. Ask only relevantMissingUserInputs when an exact answer still depends on them; never repeat a fact already present here.",
    },
    confirmedFacts: {
      source: "local_planner_state_and_user_conversation",
      conversationFacts: facts,
      plannedStudents: plannedStudentFacts,
      forecastDays: normalizedState.forecastDays,
      cnProgress,
    },
    calculationTools: [
      { id: "calculate_student_plan", mode: "precomputed_context", readOnly: true, description: "Read the locally calculated gift, resource, package, total EXP, and remaining-gap projection included in calculatedResults; this is not an executable model tool." },
      { id: "calculate_resource_contribution", mode: "precomputed_context", readOnly: true, description: "Read the locally calculated Schedule/Cafe eligibility and relationship EXP contribution included in calculatedResults; this is not an executable model tool." },
      { id: "calculate_package_need", mode: "precomputed_context", readOnly: true, description: "Read the locally calculated package efficiency included in calculatedResults; package facts come only from the CN snapshot and this is not an executable model tool." },
    ],
    plannerState: {
      forecastDays: normalizedState.forecastDays,
      resourceForecastDays: normalizedState.resourceForecastDays,
      periodDays: normalizedState.periodDays,
      mainTargetStudentId: normalizedState.mainTargetStudentId ?? null,
      students: normalizedState.students,
      inventory: normalizedState.inventory,
      giftBoxes: normalizedState.giftBoxes,
      stockResources: normalizedState.stockResources,
      incomingResources: normalizedState.incomingResources,
      equivalentGiftPools: normalizedState.equivalentGiftPools,
      giftReservations: normalizedState.giftReservations,
      resourcePostingHistory: normalizedState.resourcePostingHistory,
      resources: normalizedState.resources,
      packagePlans: normalizedState.packagePlans,
    },
    planningSession: {
      mode: "working_copy",
      requiresConfirmation: true,
      note: "This planner state is an Agent working copy. It must not be written to the page until the user applies the proposal.",
    },
    gifts: (data?.gifts ?? []).map((gift) => ({ id: Number(gift.id), names: { zh_cn: gift.name_zh_cn ?? null, en: gift.name_en ?? null, ja: gift.name_ja ?? null }, rarity: gift.rarity, baseExp: gift.base_exp })),
    giftBoxes: safeJson(data?.snapshots?.giftBoxes?.boxes ?? []),
    packages: safeJson({
      catalog: packageCatalog?.scope ?? data?.snapshots?.packages?.scope ?? null,
      packages: packageCatalog?.packages ?? [],
    }),
    calculatedResults: safeJson(calculated) ?? {},
    dataQuality: {
      missingUserInputs,
      relevantMissingUserInputs,
      optionalMissingUserInputs: missingUserInputs.filter((item) => !relevantMissingUserInputs.includes(item)),
      policy: "Use confirmedFacts and calculatedResults first. Ask only relevantMissingUserInputs when the requested exact result depends on them; never invent missing CN values.",
    },
    rules: {
      agentCanOnlyPropose: [...ALLOWED_CHANGE_KINDS],
      planningActions: PLANNING_ACTIONS,
      agentCannotModify: ["inventory", "giftBoxes", "incomingResources", "purchasedPackages", "localStorage", "javascript"],
      unreleasedStudents: "schedule and cafe EXP excluded; gifts only",
      randomGiftBoxes: "expectation only; never converted into concrete inventory",
      calculationTools: "descriptions only; use calculatedResults instead of claiming that a tool was called",
    },
  };
}

function invalid(message) {
  return { ok: false, errors: [message] };
}

export function validatePlanningProposal(proposal, { state, data } = {}) {
  if (!proposal || typeof proposal !== "object") return invalid("proposal must be an object");
  if (proposal.type !== "planning_proposal") return invalid("proposal.type must be planning_proposal");
  if (!Array.isArray(proposal.changes) || proposal.changes.length > 50) return invalid("proposal.changes must contain 0–50 items");
  const students = data?.plannerStudents ?? data?.students ?? [];
  const studentIds = new Set(students.map((student) => Number(student.student_id)));
  const cutoffStudentIds = new Set((data?.releaseTimeline ?? []).map((entry) => Number(entry.studentId)));
  const errors = [];
  let simulatedState = normalizePlannerState(state);
  const plannedIds = () => new Set(simulatedState.students.map((student) => Number(student.studentId)));
  const hasPlannedStudent = (studentId) => plannedIds().has(Number(studentId));
  const validateStudentFields = (change, index, { requireTarget = false, requireAny = false } = {}) => {
    if (!hasFiniteNumber(change.studentId) || !studentIds.has(Number(change.studentId))) errors.push(`changes[${index}] references an unknown student`);
    if (requireTarget && (!hasFiniteNumber(change.targetLevel) || integerOr(change.targetLevel, 0) < 1 || integerOr(change.targetLevel, 0) > 100)) {
      errors.push(`changes[${index}].targetLevel must be 1–100`);
    }
    if (requireAny && change.currentLevel === undefined && change.currentProgress === undefined && change.targetLevel === undefined) {
      errors.push(`changes[${index}] must change at least one student field`);
    }
    if (change.currentLevel !== undefined && (!hasFiniteNumber(change.currentLevel) || integerOr(change.currentLevel, 0) < 1 || integerOr(change.currentLevel, 0) > 100)) {
      errors.push(`changes[${index}].currentLevel must be 1–100`);
    }
    if (change.currentProgress !== undefined && (!hasFiniteNumber(change.currentProgress) || numberOr(change.currentProgress, -1) < 0)) {
      errors.push(`changes[${index}].currentProgress must be non-negative`);
    }
    if (change.targetLevel !== undefined && (!hasFiniteNumber(change.targetLevel) || integerOr(change.targetLevel, 0) < 1 || integerOr(change.targetLevel, 0) > 100)) {
      errors.push(`changes[${index}].targetLevel must be 1–100`);
    }
  };
  proposal.changes.forEach((change, index) => {
    if (!change || typeof change !== "object" || !ALLOWED_CHANGE_KINDS.has(change.kind)) {
      errors.push(`changes[${index}].kind is not allowed`);
      return;
    }
    if (Object.keys(change).some((key) => !ALLOWED_CHANGE_FIELDS[change.kind].has(key))) {
      errors.push(`changes[${index}] contains a forbidden field`);
      return;
    }
    if (change.kind === "set_student_target" || change.kind === "add_student_goal") {
      validateStudentFields(change, index, { requireTarget: true });
      if (!errors.some((error) => error.startsWith(`changes[${index}]`))) simulatedState = applyPlanningChange(simulatedState, change);
    } else if (change.kind === "update_student_goal") {
      if (!hasPlannedStudent(change.studentId)) errors.push(`changes[${index}] can only update an existing planned student`);
      validateStudentFields(change, index, { requireAny: true });
      if (!errors.some((error) => error.startsWith(`changes[${index}]`))) simulatedState = applyPlanningChange(simulatedState, change);
    } else if (change.kind === "remove_student_goal") {
      if (!hasFiniteNumber(change.studentId) || !hasPlannedStudent(change.studentId)) errors.push(`changes[${index}] can only remove an existing planned student`);
      else simulatedState = applyPlanningChange(simulatedState, change);
    } else if (change.kind === "set_main_target") {
      if (!Object.hasOwn(change, "studentId")) {
        errors.push(`changes[${index}].studentId is required`);
      } else if (change.studentId !== null && (!hasFiniteNumber(change.studentId) || !hasPlannedStudent(change.studentId))) {
        errors.push(`changes[${index}] main target must be an existing planned student or null`);
      } else {
        simulatedState = applyPlanningChange(simulatedState, change);
      }
    } else if (change.kind === "set_forecast_days" && (!hasFiniteNumber(change.value) || integerOr(change.value, 0) < 0 || integerOr(change.value, 0) > 366)) {
      errors.push(`changes[${index}].value must be 0–366`);
    } else if (change.kind === "set_forecast_days") {
      simulatedState = applyPlanningChange(simulatedState, change);
    } else if (change.kind === "reorder_student_goals") {
      const requestedIds = Array.isArray(change.studentIds) ? change.studentIds.map(Number) : [];
      if (!Array.isArray(change.studentIds) || requestedIds.length !== simulatedState.students.length
        || new Set(requestedIds).size !== requestedIds.length
        || requestedIds.some((studentId, itemIndex) => !hasFiniteNumber(change.studentIds[itemIndex]) || !plannedIds().has(studentId))) {
        errors.push(`changes[${index}].studentIds must contain every planned student exactly once`);
      } else {
        simulatedState = applyPlanningChange(simulatedState, change);
      }
    } else if (change.kind === "set_cn_cutoff_student" && (!hasFiniteNumber(change.studentId) || !cutoffStudentIds.has(Number(change.studentId)))) {
      errors.push(`changes[${index}] references an unknown cutoff student`);
    } else if (change.kind === "set_cn_cutoff_student") {
      simulatedState = applyPlanningChange(simulatedState, change, { timeline: data?.releaseTimeline ?? [], students });
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, proposal };
}

function applyPlanningChange(state, change, { timeline = [], students = [] } = {}) {
  let next = normalizePlannerState(state);
  if (change.kind === "set_student_target" || change.kind === "add_student_goal" || change.kind === "update_student_goal") {
    const existing = next.students.find((plan) => Number(plan.studentId) === Number(change.studentId));
    next = addStudentPlan(next, {
      studentId: change.studentId,
      currentLevel: change.currentLevel ?? existing?.currentLevel ?? 1,
      currentProgress: change.currentProgress ?? existing?.currentProgress ?? 0,
      targetLevel: change.targetLevel ?? existing?.targetLevel ?? existing?.currentLevel ?? 1,
    });
  } else if (change.kind === "remove_student_goal") {
    const existing = next.students.find((plan) => Number(plan.studentId) === Number(change.studentId));
    if (existing) next = removeStudentPlan(next, existing.id);
  } else if (change.kind === "set_main_target") {
    next = setMainTargetStudent(next, change.studentId);
  } else if (change.kind === "set_forecast_days") {
    const days = integerOr(change.value, next.forecastDays);
    next = { ...next, forecastDays: days };
  } else if (change.kind === "reorder_student_goals") {
    const order = new Map(change.studentIds.map((studentId, index) => [Number(studentId), index]));
    next = { ...next, students: [...next.students].sort((left, right) => order.get(Number(left.studentId)) - order.get(Number(right.studentId))) };
  } else if (change.kind === "set_cn_cutoff_student") {
    const entry = timeline.find((candidate) => Number(candidate.studentId) === Number(change.studentId));
    if (entry) next = { ...next, cnProgress: normalizeCnProgress({ cutoffStudentId: entry.studentId, cutoffRank: entry.jpRank }, timeline, students) };
  }
  return next;
}

export function applyPlanningProposal(state, proposal, { data } = {}) {
  const validation = validatePlanningProposal(proposal, { state, data });
  if (!validation.ok) return { ok: false, errors: validation.errors, state: normalizePlannerState(state) };
  let next = normalizePlannerState(state);
  for (const change of proposal.changes) {
    next = applyPlanningChange(next, change, {
      timeline: data?.releaseTimeline ?? [],
      students: data?.plannerStudents ?? data?.students ?? [],
    });
  }
  return { ok: true, state: next };
}

/**
 * Apply a validated Agent proposal to an in-memory working copy. The caller
 * decides whether and when to persist the returned state to the page.
 */
export function stagePlanningProposal(state, proposal, { data } = {}) {
  const result = applyPlanningProposal(state, proposal, { data });
  return result.ok
    ? { ok: true, state: result.state, persisted: false }
    : { ok: false, errors: result.errors, state: normalizePlannerState(state), persisted: false };
}

export function mergePlanningProposals(previous, next) {
  if (!next) return previous ?? null;
  if (!previous) return next;
  return {
    ...next,
    changes: [...(previous.changes ?? []), ...(next.changes ?? [])],
  };
}

export { ALLOWED_CHANGE_KINDS };
