import { normalizePlannerState } from "./planner-state.js?v=dashboard-20260824-data-refresh-v113";

export const CN_PROGRESS_VERSION = 1;

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integerOr(value, fallback = 0) {
  return Math.max(0, Math.floor(numberOr(value, fallback)));
}

export function buildReleaseTimeline(students = []) {
  const sorted = [...students]
    .filter((student) => student?.student_id)
    .sort((left, right) => {
      const leftOrder = Number.isFinite(Number(left.default_order)) ? Number(left.default_order) : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(Number(right.default_order)) ? Number(right.default_order) : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || Number(left.student_id) - Number(right.student_id);
    });
  return sorted.map((student, index) => ({
    studentId: Number(student.student_id),
    jpReleaseDate: student.jp_release_date ?? null,
    jpRank: Number.isFinite(Number(student.default_order)) ? Number(student.default_order) + 1 : index + 1,
    sources: student.release_sources ?? ["SchaleDB student order snapshot"],
    asOf: student.release_as_of ?? null,
  }));
}

export function getDefaultCnProgress(timeline = [], students = []) {
  const releasedIds = new Set((students ?? [])
    .filter((student) => student.cn_released ?? !student.future_only)
    .map((student) => Number(student.student_id)));
  const released = timeline.filter((entry) => releasedIds.has(Number(entry.studentId)));
  const last = released.at(-1) ?? timeline.at(-1);
  return {
    version: CN_PROGRESS_VERSION,
    server: "cn",
    cutoffStudentId: last?.studentId ?? null,
    cutoffRank: last?.jpRank ?? null,
    asOf: last?.asOf ?? timeline.find((entry) => entry?.asOf)?.asOf ?? null,
    source: "schaledb_cn_release_snapshot",
  };
}

export function normalizeCnProgress(input, timeline = [], students = []) {
  const fallback = getDefaultCnProgress(timeline, students);
  const source = input && typeof input === "object" ? input : {};
  const cutoffStudentId = integerOr(source.cutoffStudentId, fallback.cutoffStudentId ?? 0) || null;
  const timelineEntry = timeline.find((entry) => Number(entry.studentId) === cutoffStudentId);
  const asOf = source.asOf || fallback.asOf;
  return {
    version: CN_PROGRESS_VERSION,
    server: "cn",
    cutoffStudentId,
    cutoffRank: timelineEntry?.jpRank ?? (Number.isFinite(Number(source.cutoffRank)) ? Number(source.cutoffRank) : fallback.cutoffRank),
    asOf: asOf ? String(asOf) : null,
    source: String(source.source || (input && typeof input === "object" ? "user_selected_cn_cutoff" : fallback.source)),
  };
}

export function setCnProgress(state, progress, timeline = [], students = []) {
  const normalizedState = normalizePlannerState(state);
  return { ...normalizedState, cnProgress: normalizeCnProgress(progress, timeline, students) };
}

export function getStudentReleaseStatus(studentId, cnProgress, timeline = []) {
  const entry = timeline.find((candidate) => Number(candidate.studentId) === Number(studentId));
  if (!entry) return { status: "unknown", studentId: Number(studentId), rank: null, cutoffRank: cnProgress?.cutoffRank ?? null };
  const cutoffRank = Number(cnProgress?.cutoffRank);
  if (!Number.isFinite(cutoffRank)) return { status: "unknown", studentId: Number(studentId), rank: entry.jpRank, cutoffRank: null };
  return {
    status: entry.jpRank <= cutoffRank ? "released" : "unreleased",
    studentId: Number(studentId),
    rank: entry.jpRank,
    cutoffRank,
  };
}

export function getEligibleRelationshipSources(studentId, cnProgress, timeline = []) {
  const release = getStudentReleaseStatus(studentId, cnProgress, timeline);
  return {
    ...release,
    includeSchedule: release.status === "released",
    includeCafe: release.status === "released",
    giftOnly: release.status !== "released",
  };
}

export function calculateRelationshipSourceForecast({ state, studentId, cnProgress, timeline = [], periodDays = 60 } = {}) {
  const release = getEligibleRelationshipSources(studentId, cnProgress, timeline);
  const days = Math.min(366, Math.max(0, integerOr(periodDays, 60)));
  const result = { ...release, periodDays: days, scheduleExp: 0, cafeExp: 0, totalExp: 0 };
  if (!release.includeSchedule && !release.includeCafe) return result;
  for (const resource of state?.resources ?? []) {
    if (resource?.cadence !== "daily" || resource?.amount === null || resource?.amount === undefined || resource?.amount === "") continue;
    const amount = numberOr(resource.amount) * days * numberOr(resource.expected_per_count);
    if (resource.id === "daily-schedule-exp" && release.includeSchedule) result.scheduleExp += amount;
    if (resource.id === "daily-cafe-exp" && release.includeCafe) result.cafeExp += amount;
  }
  result.totalExp = result.scheduleExp + result.cafeExp;
  return result;
}
