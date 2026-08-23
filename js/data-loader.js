import { FUTURE_STUDENTS, LIMITED_OR_FES_STUDENT_TYPES } from "./future-students.js?v=dashboard-20260824-synthesis-accounting-v112";
import { buildReleaseTimeline } from "./release-state.js?v=dashboard-20260824-synthesis-accounting-v112";

import { getCnGiftPackageCatalog } from "./package-catalog.js?v=dashboard-20260824-synthesis-accounting-v112";

const DATA_ROOT = "./relationship_data";

export function buildStudentCatalog(students = [], overrides = FUTURE_STUDENTS) {
  const overrideById = new Map((overrides ?? []).map((student) => [String(student.student_id), student]));
  const buildStudentRecord = (student, override) => {
    const cnReleased = student.cn_released ?? Boolean(student.is_released?.[2]);
    const studentId = Number(student.student_id);
    const limitedType = student.is_limited
      ?? override?.is_limited
      ?? (LIMITED_OR_FES_STUDENT_TYPES[studentId] ? [
        LIMITED_OR_FES_STUDENT_TYPES[studentId],
        LIMITED_OR_FES_STUDENT_TYPES[studentId],
        LIMITED_OR_FES_STUDENT_TYPES[studentId],
      ] : undefined);
    const launchPackageEligibility = student.launch_package_eligibility
      ?? override?.launch_package_eligibility
      ?? (!cnReleased && LIMITED_OR_FES_STUDENT_TYPES[studentId] ? "limited_or_fes" : undefined);
    return {
      ...student,
      ...(override ?? {}),
      // The snapshot's release flags are authoritative. An override may add
      // gift reactions and package metadata, but cannot release a CN student.
      is_released: student.is_released ?? override?.is_released ?? [false, false, false],
      cn_released: cnReleased,
      future_only: !cnReleased,
      release_status: cnReleased ? "released" : "unreleased",
      ...(limitedType ? { is_limited: limitedType } : {}),
      ...(launchPackageEligibility ? { launch_package_eligibility: launchPackageEligibility } : {}),
    };
  };
  const catalog = (students ?? []).map((student) => {
    return buildStudentRecord(student, overrideById.get(String(student.student_id)));
  });
  const catalogIds = new Set(catalog.map((student) => String(student.student_id)));
  // Backward compatibility for an old local snapshot.  This is only a
  // migration fallback; the normal source is the complete SchaleDB snapshot.
  return [
    ...catalog,
    ...(overrides ?? [])
      .filter((student) => !catalogIds.has(String(student.student_id)))
      .map((student) => buildStudentRecord(student, undefined)),
  ];
}

export const DATA_PATHS = Object.freeze({
  gifts: `${DATA_ROOT}/gifts.json?v=dashboard-20260824-synthesis-accounting-v112`,
  preferences: `${DATA_ROOT}/student_gift_preferences.json?v=dashboard-20260824-synthesis-accounting-v112`,
  crafting: `${DATA_ROOT}/crafting_expected_relationship.json?v=dashboard-20260824-synthesis-accounting-v112`,
  thresholds: `${DATA_ROOT}/relationship_thresholds.json?v=dashboard-20260824-synthesis-accounting-v112`,
  packages: `${DATA_ROOT}/paid_packages_cn.json?v=dashboard-20260824-synthesis-accounting-v112`,
  giftBoxes: `${DATA_ROOT}/gift_boxes_cn.json?v=dashboard-20260824-synthesis-accounting-v112`,
  unlimitedAssaultRewards: `${DATA_ROOT}/unlimited_assault_rewards_cn.json?v=dashboard-20260824-synthesis-accounting-v112`,
  resourceEvidence: `${DATA_ROOT}/resource_evidence_cn.json?v=dashboard-20260824-synthesis-accounting-v112`,
  localization: `${DATA_ROOT}/localization.json?v=dashboard-20260824-synthesis-accounting-v112`,
  releaseTimeline: `${DATA_ROOT}/jp_release_timeline.json?v=dashboard-20260824-synthesis-accounting-v112`,
});

async function fetchJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchOptionalJson(path) {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export async function loadDashboardData() {
  const [giftSnapshot, preferenceSnapshot, craftingSnapshot, thresholdSnapshot, packageSnapshot, giftBoxSnapshot, unlimitedAssaultRewards, resourceEvidence, localization, releaseTimelineSnapshot, assetManifest] = await Promise.all([
    fetchJson(DATA_PATHS.gifts),
    fetchJson(DATA_PATHS.preferences),
    fetchJson(DATA_PATHS.crafting),
    fetchJson(DATA_PATHS.thresholds),
    fetchJson(DATA_PATHS.packages),
    fetchJson(DATA_PATHS.giftBoxes),
    fetchJson(DATA_PATHS.unlimitedAssaultRewards),
    fetchJson(DATA_PATHS.resourceEvidence),
    fetchJson(DATA_PATHS.localization),
    fetchJson(DATA_PATHS.releaseTimeline),
    fetchOptionalJson("./assets/manifest.json?v=dashboard-20260824-synthesis-accounting-v112"),
  ]);

  const gifts = giftSnapshot.gifts;
  const plannerStudents = buildStudentCatalog(preferenceSnapshot.students);
  const students = plannerStudents;
  const releaseTimeline = (releaseTimelineSnapshot?.students ?? []).map((entry) => ({
    ...entry,
    studentId: Number(entry.studentId),
    jpRank: Number(entry.jpRank),
    jpReleaseDate: entry.jpReleaseDate ?? null,
    sources: Array.isArray(entry.sources) ? entry.sources : [releaseTimelineSnapshot?.source ?? "SchaleDB JP student order snapshot"],
    asOf: entry.asOf ?? releaseTimelineSnapshot?.asOf ?? null,
  }));
  const plannerStudentById = new Map(plannerStudents.map((student) => [String(student.student_id), student]));
  const cutoffStudents = releaseTimeline.map((entry) => plannerStudentById.get(String(entry.studentId)) ?? {
    student_id: entry.studentId,
    name_zh_cn: entry.name_ja ?? "未知学生",
    name_en: entry.name_ja ?? "Unknown student",
    name_ja: entry.name_ja ?? "不明な生徒",
    timeline_only: true,
  });
  const craftingStudents = craftingSnapshot.students;
  const craftingById = new Map(
    craftingStudents.map((student) => [String(student.student_id), student]),
  );
  // SchaleDB stores costume variants such as Swimsuit Mika under the base
  // student's crafting row. Keep the future variant addressable by its own
  // student ID so the planner does not fall back to a generic estimate.
  for (const student of plannerStudents) {
    const sourceId = student.preference_source_student_id;
    if (sourceId && !craftingById.has(String(student.student_id)) && craftingById.has(String(sourceId))) {
      craftingById.set(String(student.student_id), craftingById.get(String(sourceId)));
    }
  }

  return {
    gifts,
    giftBoxes: giftBoxSnapshot.boxes,
    giftById: new Map(gifts.map((gift) => [String(gift.id), gift])),
    students,
    studentById: new Map(plannerStudents.map((student) => [String(student.student_id), student])),
    cutoffStudents,
    cutoffStudentById: new Map(cutoffStudents.map((student) => [String(student.student_id), student])),
    plannerStudents,
    releaseTimeline,
    packageCatalog: getCnGiftPackageCatalog(packageSnapshot),
    cnReleasedStudents: students.filter((student) => student.cn_released),
    futureStudents: students.filter((student) => student.future_only),
    craftingById,
    snapshots: {
      gift: giftSnapshot,
      preference: preferenceSnapshot,
      crafting: craftingSnapshot,
      thresholds: thresholdSnapshot,
      packages: packageSnapshot,
      giftBoxes: giftBoxSnapshot,
      unlimitedAssaultRewards,
      resourceEvidence,
      releaseTimeline: releaseTimelineSnapshot,
    },
    localization,
    assetManifest,
  };
}
