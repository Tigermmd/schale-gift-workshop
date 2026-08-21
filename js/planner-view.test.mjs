import assert from "node:assert/strict";
import { filterPlannerStudents, plannerStudentLabel, prepareAllocation, renderPlannerStudentOptions, renderPlannerWorkspace, renderWorkbenchTabs } from "./planner-view.js";
import { text } from "./i18n.js";
import { createEmptyPlannerState } from "./planner-state.js";

const students = [
  { student_id: 10122, name_zh_cn: "未花（泳装）", name_en: "Mika (Swimsuit)", name_ja: "ミカ（水着）" },
  { student_id: 10063, name_zh_cn: "小雪", name_en: "Koyuki", name_ja: "コユキ" },
];

assert.deepEqual(filterPlannerStudents(students, "mika", {}), [students[0]]);
assert.deepEqual(filterPlannerStudents(students, "コユキ", {}), [students[1]]);
assert.deepEqual(filterPlannerStudents(students, "10063", {}), [students[1]]);
assert.equal(plannerStudentLabel(students[0], "zh_cn", {}), "未花（泳装）");
const workbenchTabs = renderWorkbenchTabs({ locale: "zh_cn", active: "agent" });
assert.match(workbenchTabs, /aria-label="工作区导航"/);
assert.equal((workbenchTabs.match(/class="workbench-tab-icon"/g) ?? []).length, 7, "Every workspace tab should have one unified vector icon");
assert.equal((workbenchTabs.match(/<img /g) ?? []).length, 0, "Navigation must not use cropped content artwork as icons");
assert.match(workbenchTabs, /data-workbench="packages"[\s\S]*礼包性价比/);
assert.match(workbenchTabs, /data-workbench="knowledge"[\s\S]*好感知识/);

const options = renderPlannerStudentOptions({ students, query: "mika", locale: "zh_cn", localization: {} });
assert.match(options, /data-planner-student-option="10122"/);
assert.match(options, /未花（泳装）/);
assert.doesNotMatch(options, /10063/);
const synthesisReservationData = {
  snapshots: { thresholds: [{ level: 1, cumulative_exp_to_reach_level: 0 }, { level: 2, cumulative_exp_to_reach_level: 100 }] },
  studentById: new Map([["1", { student_id: 1, name_en: "Student", gift_values: [{ gift_id: 5000, relationship_exp: 20 }, { gift_id: 5001, relationship_exp: 20 }, { gift_id: 5002, relationship_exp: 60 }] }]]),
  plannerStudents: [],
  giftById: new Map([["5000", { id: 5000, rarity: "SR" }], ["5001", { id: 5001, rarity: "SR" }]]),
  giftBoxes: [{ id: "100008", type: "choice", selectable_gift_ids: [5002] }],
  craftingById: new Map(),
  releaseTimeline: [{ studentId: 1, jpRank: 1 }],
};
const synthesisReservationState = {
  students: [{ id: "student-1", studentId: 1, currentLevel: 1, currentProgress: 0, targetLevel: 2 }],
  mainTargetStudentId: 1,
  forecastDays: 10,
  inventory: { 5000: 1, 5001: 1 },
  giftReservations: {},
  giftBoxes: {},
  stockResources: { manufacturing_stone: 0, synthesis_stone_gold: 1 },
  incomingResources: {},
  equivalentGiftPools: {},
  resources: [],
  resourcePostingHistory: [],
  cnProgress: { cutoffRank: 1 },
};
const preparedSynthesisAllocation = prepareAllocation(synthesisReservationData, synthesisReservationState, synthesisReservationData.snapshots.thresholds);
assert.deepEqual(preparedSynthesisAllocation.allocation.reservationAssignments, [], "synthesis materials use a separate reservation record");
assert.deepEqual(preparedSynthesisAllocation.allocation.synthesisGiftIds, ["5000", "5001"], "quick reserve must retain the synthesis pair separately");
const synthesisOnlyHtml = renderPlannerWorkspace({
  data: { ...synthesisReservationData, plannerStudents: [synthesisReservationData.studentById.get("1")] },
  state: synthesisReservationState,
  locale: "zh_cn",
  localization: {},
});
assert.match(synthesisOnlyHtml, /data-reserve-allocation/, "a synthesis-only plan must still expose the reserve action");

const reservedSynthesisHtml = renderPlannerWorkspace({
  data: {
    ...synthesisReservationData,
    plannerStudents: [synthesisReservationData.studentById.get("1")],
  },
  state: {
    ...synthesisReservationState,
    giftReservations: { "5000": 1, "5001": 1 },
    synthesisReservations: [["5000", "5001"]],
  },
  locale: "zh_cn",
  localization: {},
});
assert.doesNotMatch(reservedSynthesisHtml, /data-reserve-allocation/, "a reserved plan must not keep a misleading repeat-reserve button");
assert.match(reservedSynthesisHtml, /已有预留/, "a reserved plan must show that gifts are already reserved");

const reservationNoticeHtml = renderPlannerWorkspace({
  data: {
    ...synthesisReservationData,
    plannerStudents: [synthesisReservationData.studentById.get("1")],
  },
  state: synthesisReservationState,
  locale: "zh_cn",
  localization: {},
  notice: "plannerReservationPosted",
});
assert.match(reservationNoticeHtml, /礼物已预留；可到库存页释放或确认消耗/, "the planner must acknowledge a successful reservation");

const manyStudents = Array.from({ length: 30 }, (_, index) => ({ student_id: 11000 + index, name_zh_cn: `测试学生${index}`, name_en: `Test Student ${index}`, name_ja: `テスト${index}` }));
const allMatchingOptions = renderPlannerStudentOptions({ students: manyStudents, query: "test", locale: "zh_cn", localization: {} });
assert.equal((allMatchingOptions.match(/data-planner-student-option=/g) ?? []).length, 30, "Planner search must keep the full matching student set");
assert.notEqual(text("zh_cn", "planningCurrentGap"), "planningCurrentGap");
assert.notEqual(text("zh_cn", "planningNonMainNote"), "planningNonMainNote");

const emptyPlannerHtml = renderPlannerWorkspace({
  data: {
    snapshots: { thresholds: [] },
    studentById: new Map(),
    plannerStudents: [],
    students: [],
    gifts: [],
    giftById: new Map(),
    releaseTimeline: [],
  },
  state: {
    students: [],
    mainTargetStudentId: null,
    forecastDays: 60,
    inventory: {},
    giftReservations: {},
    giftBoxes: {},
    stockResources: {},
    incomingResources: {},
    equivalentGiftPools: {},
  },
  locale: "zh_cn",
  localization: {},
});
assert.match(emptyPlannerHtml, /class="planner-empty-copy"/, "Empty planner state should separate copy from its action");
assert.match(emptyPlannerHtml, /data-planner-open-form/, "Empty planner state should keep one clear add-goal action");

const iconPlannerStudent = { student_id: 10122, name_zh_cn: "未花（泳装）", name_en: "Mika (Swimsuit)", name_ja: "ミカ（水着）" };
const iconPlannerState = createEmptyPlannerState();
iconPlannerState.students = [{ id: "plan-10122", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 50 }];
iconPlannerState.mainTargetStudentId = 10122;
const iconPlannerHtml = renderPlannerWorkspace({
  data: {
    snapshots: { thresholds: [] },
    studentById: new Map([["10122", iconPlannerStudent]]),
    plannerStudents: [iconPlannerStudent],
    students: [iconPlannerStudent],
    gifts: [],
    giftById: new Map(),
    giftBoxes: [],
    craftingById: new Map(),
    releaseTimeline: [],
  },
  state: iconPlannerState,
  locale: "zh_cn",
  localization: {},
});
assert.match(iconPlannerHtml, /class="planner-student-photo icon-frame"/, "Planner student portraits must use the shared icon frame");
assert.match(iconPlannerHtml, /src="\.\/assets\/students\/10122\.webp"/, "A future student without local collection art must use the local icon snapshot");
assert.doesNotMatch(iconPlannerHtml, /src="\.\/assets\/students\/collection\/10122\.webp"/, "Planner must not emit a predictable missing collection-art URL");
assert.match(iconPlannerHtml, /min="0"[^>]*data-planner-forecast-days/, "Planner forecast window must allow a current-only zero-day calculation");
assert.match(iconPlannerHtml, /<summary class="planner-details-toggle">[\s\S]*planner-details-toggle-icon/, "Planner details must look and behave like an explicit disclosure control");
assert.match(iconPlannerHtml, /<button type="button" class="planner-remove-button"[\s\S]*planner-remove-icon/, "Removing a planned student must use an explicit destructive button");
assert.doesNotMatch(iconPlannerHtml, /class="text-button planner-remove-button"/, "Remove must not look like ordinary inline text");
assert.match(iconPlannerHtml, /class="planner-detail-section planner-stock-detail"/, "Planner details must include a dedicated current-stock breakdown");
assert.match(iconPlannerHtml, /class="planner-detail-section planner-periodic-detail"/, "Planner details must include a dedicated periodic-resource breakdown");
assert.match(iconPlannerHtml, /本期手动计入|Manually added|今期手動追加/, "Planner details must distinguish one-time and cadence-based resources");

const noValidGoalHtml = renderPlannerWorkspace({
  data: {
    snapshots: { thresholds: [] },
    studentById: new Map([["10122", iconPlannerStudent]]),
    plannerStudents: [iconPlannerStudent],
    students: [iconPlannerStudent],
    gifts: [],
    giftById: new Map(),
    giftBoxes: [],
    craftingById: new Map(),
    releaseTimeline: [],
  },
  state: {
    ...createEmptyPlannerState(),
    students: [{ id: "plan-10122", studentId: 10122, currentLevel: 1, currentProgress: 0, targetLevel: 1 }],
    mainTargetStudentId: 10122,
  },
  locale: "zh_cn",
  localization: {},
});
assert.match(noValidGoalHtml, /<details class="planner-edit-details[^"]*"[^>]*open>/, "A 1-to-1 placeholder plan must expose the first setup step");
assert.match(noValidGoalHtml, /<summary>添加规划目标<\/summary>/, "The first setup step must be named as adding a planning goal");
assert.match(noValidGoalHtml, /当前礼物可贡献好感（期望）/);

console.log("planner view tests passed");
