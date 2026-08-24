import assert from "node:assert/strict";
import { applyPlanningProposal, buildAgentContext, calculateResourceContribution, canReuseConfiguredProxy, extractConversationFacts, mergePlanningProposals, stagePlanningProposal, validatePlanningProposal } from "./agent-state.js";
import { buildReleaseTimeline, calculateRelationshipSourceForecast, getDefaultCnProgress, getStudentReleaseStatus, normalizeCnProgress } from "./release-state.js";
import { createEmptyPlannerState } from "./planner-state.js";
import { getGiftOnlyPlanningStudents } from "./planner-view.js";
import { getCnGiftPackageCatalog, getEligibleGiftPackages } from "./package-catalog.js";

const students = [
  { student_id: 10001, name_zh_cn: "甲", name_en: "A", default_order: 0 },
  { student_id: 10002, name_zh_cn: "乙", name_en: "B", default_order: 1 },
  { student_id: 10059, name_zh_cn: "未花", name_en: "Mika", default_order: 127 },
  { student_id: 10122, name_zh_cn: "未花（泳装）", name_en: "Mika (Swimsuit)", default_order: 230, future_only: true },
];
const timeline = buildReleaseTimeline(students);
const progress = normalizeCnProgress({ cutoffStudentId: 10002 }, timeline, students);
assert.equal(progress.cutoffRank, 2);
assert.equal(progress.asOf, null);
assert.equal(getStudentReleaseStatus(10001, progress, timeline).status, "released");
assert.equal(getStudentReleaseStatus(10122, progress, timeline).status, "unreleased");
assert.equal(getStudentReleaseStatus(99999, progress, timeline).status, "unknown");

const datedStudents = students.map((student) => ({ ...student, release_as_of: "2026-08-24" }));
const datedTimeline = buildReleaseTimeline(datedStudents);
const automaticProgress = getDefaultCnProgress(datedTimeline, [
  { ...datedStudents[0], cn_released: true },
  { ...datedStudents[1], cn_released: true },
  { ...datedStudents[2], cn_released: false },
  { ...datedStudents[3], cn_released: false },
]);
assert.equal(automaticProgress.cutoffStudentId, 10002);
assert.equal(automaticProgress.asOf, "2026-08-24");
assert.equal(automaticProgress.source, "schaledb_cn_release_snapshot");

const data = {
  students,
  plannerStudents: students,
  studentById: new Map(students.map((student) => [String(student.student_id), student])),
  releaseTimeline: timeline,
  snapshots: { packages: { packages: [{ id: "p-1", price_cny: 10, purchase_limit: 1, status: "active", contents: [] }] } },
  gifts: [{ id: 5000, name_zh_cn: "礼物", base_exp: 20 }],
};
const catalog = getCnGiftPackageCatalog({ scope: { server: "cn", as_of: "2026-08-12" }, packages: [
  { id: "current", status: "active", contents: [] },
  { id: "launch", status: "active", availability_phase: "student_launch", gift_binding: { type: "student_specific_favorites", target_student_ids: [10122] }, contents: [] },
  { id: "template", status: "template", contents: [] },
] });
assert.equal(catalog.packages.find((item) => item.id === "launch").availability, "student_launch");
assert.deepEqual(getEligibleGiftPackages({ catalog, studentId: 10122 }).map((item) => item.id), ["current", "launch"]);
assert.deepEqual(getEligibleGiftPackages({ catalog, studentId: 10001, includeStudentLaunchPackages: false }).map((item) => item.id), ["current"]);
const state = { ...createEmptyPlannerState(), cnProgress: progress };
assert.equal(canReuseConfiguredProxy({ configured: true, configuredBaseUrl: "https://api.example.com", configuredModel: "deepseek-v4-flash", baseUrl: "https://api.example.com", model: "deepseek-v4-flash" }), true);
assert.equal(canReuseConfiguredProxy({ configured: true, configuredBaseUrl: "https://api.example.com", configuredModel: "deepseek-v4-flash", baseUrl: "https://other.example.com", model: "deepseek-v4-flash" }), false);
assert.equal(canReuseConfiguredProxy({ configured: true, configuredBaseUrl: "https://api.example.com", configuredModel: "deepseek-v4-flash", baseUrl: "https://api.example.com", model: "other-model" }), false);
const plannedState = { ...state, students: [
  { id: "student-10122", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
  { id: "student-10001", studentId: 10001, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
] };
assert.deepEqual(getGiftOnlyPlanningStudents({ data, state: plannedState }).map(({ student }) => student.student_id), [10122]);
const sourceForecast = calculateRelationshipSourceForecast({ state: { resources: [
  { id: "daily-schedule-exp", cadence: "daily", amount: 7, expected_per_count: 31.25 },
  { id: "daily-cafe-exp", cadence: "daily", amount: 8, expected_per_count: 15 },
] }, studentId: 10122, cnProgress: progress, timeline, periodDays: 60 });
assert.equal(sourceForecast.totalExp, 0);
assert.equal(calculateRelationshipSourceForecast({ state: { resources: [
  { id: "daily-schedule-exp", cadence: "daily", amount: 7, expected_per_count: 31.25 },
  { id: "daily-cafe-exp", cadence: "daily", amount: 8, expected_per_count: 15 },
] }, studentId: 10001, cnProgress: progress, timeline, periodDays: 60 }).totalExp, 20325);
const context = buildAgentContext(state, { gap: 123.456 }, data);
assert.equal(context.students.find((student) => student.studentId === 10122).release.giftOnly, true);
assert.equal(context.students.find((student) => student.studentId === 10122).release.includeCafe, false);
assert.equal(context.calculatedResults.gap, 123.456);
assert.ok(Array.isArray(context.dataQuality.missingUserInputs));
assert.equal(context.schemaVersion, 2);
assert.equal(context.plannerState.mainTargetStudentId, null);
assert.equal(context.disclosure.mode, "progressive");
assert.equal(context.planningSession.mode, "working_copy");
assert.equal(context.planningSession.requiresConfirmation, true);
assert.ok(context.rules.planningActions.some((action) => action.kind === "remove_student_goal"));
assert.ok(Array.isArray(context.calculationTools));
assert.ok(context.calculationTools.some((tool) => tool.id === "calculate_student_plan"));
assert.ok(Array.isArray(context.calculatedResults.giftPlanning.packageEfficiency.students));

const conversationFacts = extractConversationFacts([
  { role: "user", content: "你就按照mika原皮，60级0经验算，计入每日摸头一次，日程一次" },
]);
assert.deepEqual(conversationFacts, {
  currentLevel: 60,
  currentProgress: 0,
  dailyCafeCount: 1,
  dailyScheduleCount: 1,
  forecastDays: null,
  targetLevel: null,
  studentHints: ["mika原皮"],
});

const dualMikaState = {
  ...state,
  students: [
    { id: "student-10059", studentId: 10059, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
    { id: "student-10122", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
  ],
  mainTargetStudentId: 10122,
};
const dualMikaContext = buildAgentContext(
  dualMikaState,
  {},
  data,
  {
    conversation: [{ role: "user", content: "先算未花（泳装）从1级到100级。" }],
    message: "改算原皮未花，从61级提升到100级。",
  },
);
const dualMikaPlans = new Map(dualMikaContext.confirmedFacts.plannedStudents.map((item) => [item.studentId, item.plan]));
assert.equal(dualMikaPlans.get(10059).currentLevel, 61, "the latest message must update original Mika only");
assert.equal(dualMikaPlans.get(10122).currentLevel, 1, "historical swimsuit Mika values must not leak into original Mika");

const releasedState = { ...createEmptyPlannerState(), cnProgress: progress, students: [
  { id: "student-10001", studentId: 10001, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
] };

const giftOnlyContext = buildAgentContext(
  { ...state, students: [{ id: "student-10122", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 100 }] },
  {},
  data,
  { message: "未来两个月只按礼物规划", conversation: [{ role: "user", content: "未来两个月只按礼物规划" }] },
);
assert.deepEqual(giftOnlyContext.dataQuality.relevantMissingUserInputs.map((item) => item.id), ["unlimited-assault-floor"]);
assert.equal(giftOnlyContext.confirmedFacts.plannedStudents[0].release.status, "unreleased");
assert.equal(giftOnlyContext.confirmedFacts.plannedStudents[0].relationshipSources.included, false);
assert.ok(giftOnlyContext.calculatedResults.giftPlanning.projections[0].projection);

const releasedGiftOnlyContext = buildAgentContext(
  releasedState,
  {},
  data,
  { message: "只按当前礼物库存计算，不计入日程和咖啡厅", conversation: [] },
);
assert.deepEqual(releasedGiftOnlyContext.dataQuality.relevantMissingUserInputs.map((item) => item.id), []);

const releasedFullContext = buildAgentContext(
  releasedState,
  {},
  data,
  { message: "把日程和咖啡厅摸头也计入未来两个月", conversation: [] },
);
assert.deepEqual(releasedFullContext.dataQuality.relevantMissingUserInputs.map((item) => item.id), [
  "daily-schedule-count",
  "daily-cafe-count",
  "unlimited-assault-floor",
]);

const releasedContext = buildAgentContext(releasedState, {}, data);
assert.deepEqual(releasedContext.dataQuality.missingUserInputs.map((item) => item.id), [
  "daily-schedule-count",
  "daily-cafe-count",
  "unlimited-assault-floor",
]);

const dailyConfiguredState = {
  ...releasedState,
  resources: releasedState.resources.map((resource) => resource.id === "daily-schedule-exp"
    ? { ...resource, amount: 1 }
    : resource.id === "daily-cafe-exp"
      ? { ...resource, amount: 1 }
      : resource),
};
const dailyConfiguredContext = buildAgentContext(dailyConfiguredState, {}, data);
const dailyProjection = dailyConfiguredContext.calculatedResults.giftPlanning.projections[0].combined;
assert.equal(dailyProjection.relationshipExp, 60 * (31.25 + 15));
assert.equal(dailyProjection.giftExp + dailyProjection.relationshipExp, dailyProjection.totalExpectedExp, "Agent EXP fields must partition total EXP without double counting");

const postedForecastContext = buildAgentContext({
  ...dailyConfiguredState,
  students: [{ studentId: 10001, currentLevel: 1, currentProgress: 0, targetLevel: 100 }],
  mainTargetStudentId: 10001,
  resources: [{ id: "monthly-total-assault-gift-boxes", cadence: "monthly", amount: 3, unit: "gift_box", gift_box_id: "100008" }],
  incomingResources: { giftBoxes: { "100008": 6 }, stockResources: {}, equivalentGiftPools: {}, relationshipExp: {} },
  resourcePostingHistory: [{
    id: "posted-choice-60",
    postingKey: "monthly-total-assault-gift-boxes:60",
    resourceId: "monthly-total-assault-gift-boxes",
    periodDays: 60,
    active: true,
    mapped: { giftBoxes: { "100008": 6 }, stockResources: {}, equivalentGiftPools: {}, relationshipExp: {} },
  }],
}, {}, {
  ...data,
  giftBoxes: [{ id: "100008", type: "choice", selectable_gift_ids: [5000] }],
});
assert.equal(postedForecastContext.calculatedResults.giftPlanning.forecast.choiceBoxes, 15, "Agent forecast must merge the current-period posting with the other free resources instead of dropping the posted resource");

const multiStudentDailyState = {
  ...dailyConfiguredState,
  mainTargetStudentId: 10001,
  students: [
    { studentId: 10001, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
    { studentId: 10002, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
  ],
};
assert.equal(calculateResourceContribution({ state: multiStudentDailyState, studentId: 10001, data }).totalExp, 60 * (31.25 + 15));
assert.equal(calculateResourceContribution({ state: multiStudentDailyState, studentId: 10002, data }).totalExp, 0, "shared daily EXP must belong to the main target only");

const directRequestContext = buildAgentContext(
  { ...createEmptyPlannerState(), cnProgress: progress },
  {},
  data,
  { message: "把甲从60级提升到100级，并计入日程和咖啡厅摸头", conversation: [] },
);
assert.deepEqual(directRequestContext.dataQuality.relevantMissingUserInputs.map((item) => item.id), [
  "daily-schedule-count",
  "daily-cafe-count",
  "unlimited-assault-floor",
]);
assert.equal(directRequestContext.confirmedFacts.plannedStudents.length, 1);
assert.equal(directRequestContext.confirmedFacts.plannedStudents[0].studentId, 10001);
assert.equal(directRequestContext.confirmedFacts.plannedStudents[0].plan.currentLevel, 60);
assert.equal(directRequestContext.confirmedFacts.plannedStudents[0].plan.targetLevel, 100);

const proposal = { type: "planning_proposal", summary: "目标", changes: [
  { kind: "set_student_target", studentId: 10122, targetLevel: 100 },
  { kind: "set_forecast_days", value: 60 },
] };
assert.equal(validatePlanningProposal(proposal, { state, data }).ok, true);
assert.equal(validatePlanningProposal({ ...proposal, changes: [{ kind: "set_forecast_days", value: 0 }] }, { state, data }).ok, true);
const applied = applyPlanningProposal(state, proposal, { data });
assert.equal(applied.ok, true);
assert.equal(applied.state.students[0].studentId, 10122);
assert.equal(applied.state.students[0].targetLevel, 100);
assert.deepEqual(applied.state.packagePlans, state.packagePlans);
assert.equal(applied.state.inventory["5000"], undefined);
const appliedZeroDay = applyPlanningProposal(state, { ...proposal, changes: [{ kind: "set_forecast_days", value: 0 }] }, { data });
assert.equal(appliedZeroDay.state.forecastDays, 0);
assert.equal(appliedZeroDay.state.periodDays, 30, "changing the planner horizon must not change the resource preview horizon");
assert.equal(validatePlanningProposal({ ...proposal, changes: [{ kind: "set_inventory", giftId: 5000, count: 999 }] }, { state, data }).ok, false);
assert.equal(validatePlanningProposal({ ...proposal, changes: [{ kind: "set_forecast_days", value: 60, inventory: {} }] }, { state, data }).ok, false);
assert.equal(validatePlanningProposal({ ...proposal, changes: [{ kind: "set_package_plan", packageId: "p-1", planned: 1 }] }, { state, data }).ok, false);

const multiActionState = { ...createEmptyPlannerState(), students: [
  { id: "student-10001", studentId: 10001, currentLevel: 20, currentProgress: 3, targetLevel: 60 },
  { id: "student-10002", studentId: 10002, currentLevel: 10, currentProgress: 0, targetLevel: 50 },
], mainTargetStudentId: 10001 };
const multiActionProposal = { type: "planning_proposal", summary: "重排目标", changes: [
  { kind: "add_student_goal", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 100 },
  { kind: "update_student_goal", studentId: 10122, currentLevel: 10, targetLevel: 80 },
  { kind: "remove_student_goal", studentId: 10002 },
  { kind: "set_main_target", studentId: 10122 },
  { kind: "reorder_student_goals", studentIds: [10122, 10001] },
] };
assert.equal(validatePlanningProposal(multiActionProposal, { state: multiActionState, data }).ok, true);
const multiActionApplied = applyPlanningProposal(multiActionState, multiActionProposal, { data });
assert.equal(multiActionApplied.ok, true);
assert.deepEqual(multiActionApplied.state.students.map((student) => student.studentId), [10122, 10001]);
assert.equal(multiActionApplied.state.students[0].currentLevel, 10);
assert.equal(multiActionApplied.state.students[0].targetLevel, 80);
assert.equal(multiActionApplied.state.mainTargetStudentId, 10122);
const staged = stagePlanningProposal(multiActionState, multiActionProposal, { data });
assert.equal(staged.ok, true);
assert.equal(staged.persisted, false);
assert.equal(multiActionState.students.length, 2, "staging must not mutate the page planner state");
assert.equal(staged.state.students.length, 2);
const merged = mergePlanningProposals(
  { type: "planning_proposal", summary: "第一轮", changes: [{ kind: "add_student_goal", studentId: 10001, targetLevel: 60 }] },
  { type: "planning_proposal", summary: "第二轮", changes: [{ kind: "set_main_target", studentId: 10001 }] },
);
assert.deepEqual(merged.changes.map((change) => change.kind), ["add_student_goal", "set_main_target"]);
assert.equal(validatePlanningProposal({ ...multiActionProposal, changes: [{ kind: "remove_student_goal", studentId: 99999 }] }, { state: multiActionState, data }).ok, false);
assert.equal(validatePlanningProposal({ ...multiActionProposal, changes: [{ kind: "reorder_student_goals", studentIds: [10001] }] }, { state: multiActionState, data }).ok, false);
assert.equal(validatePlanningProposal({ ...multiActionProposal, changes: [{ kind: "set_main_target", studentId: null }] }, { state: multiActionState, data }).ok, true);
assert.equal(validatePlanningProposal({ ...multiActionProposal, changes: [{ kind: "set_main_target" }] }, { state: multiActionState, data }).ok, false);
assert.equal(validatePlanningProposal({ ...multiActionProposal, changes: [{ kind: "set_forecast_days", value: "not-a-number" }] }, { state: multiActionState, data }).ok, false);

console.log("agent state tests passed");
