import { calculatePlanningSummary } from "./planning-summary.js?v=dashboard-20260824-data-refresh-v113";
import { localizedName, text as t } from "./i18n.js?v=dashboard-20260824-data-refresh-v113&knowledge=v3";
import { formatExp, formatInteger } from "./render.js?v=dashboard-20260824-data-refresh-v113";
import { getEligibleRelationshipSources } from "./release-state.js?v=dashboard-20260824-data-refresh-v113";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function giftImage(gift, manifest, locale, localization) {
  const name = localizedName(gift, "gift", locale, localization);
  const source = manifest?.entries?.[`gift:${gift.id}`];
  return `<span class="planner-gift-image icon-frame"><img src="${escapeHtml(source?.local ?? `./assets/gifts/${gift.id}.webp`)}" data-fallback="${escapeHtml(source?.remote ?? "")}" alt="${escapeHtml(name)}" loading="lazy"><span aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span></span>`;
}

function studentImage(student, manifest, locale, localization, className = "planner-student-photo") {
  if (!student) return `<span class="${className} icon-frame is-fallback" aria-hidden="true">?</span>`;
  const name = localizedName(student, "student", locale, localization);
  const source = manifest?.entries?.[`student:${student.student_id}`]
    ?? manifest?.entries?.[`student-collection:${student.student_id}`];
  // The local asset snapshot does not contain collection art for every future
  // student. Fall back to the guaranteed icon path instead of emitting a
  // predictable 404 before the remote collection fallback is attempted.
  const fallbackLocal = `./assets/students/${student.student_id}.webp`;
  const fallbackRemote = student.future_only === true
    ? `https://schaledb.com/images/student/collection/${student.student_id}.webp`
    : `https://schaledb.com/images/student/icon/${student.student_id}.webp`;
  return `<span class="${className} icon-frame"><img src="${escapeHtml(source?.local ?? fallbackLocal)}" data-fallback="${escapeHtml(source?.remote ?? fallbackRemote)}" alt="${escapeHtml(name)}" loading="lazy"><span aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span></span>`;
}

export function plannerStudentLabel(student, locale, localization) {
  return localizedName(student, "student", locale, localization);
}

function plannerStudentSearchText(student, localization) {
  return [
    student?.student_id,
    student?.name_zh_cn,
    student?.name_zh,
    student?.name_en,
    student?.name_ja,
    ...["zh_cn", "en", "ja"].map((locale) => localizedName(student, "student", locale, localization)),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function filterPlannerStudents(students, query, localization) {
  const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...(students ?? [])];
  return (students ?? []).filter((student) => plannerStudentSearchText(student, localization).includes(normalizedQuery));
}

export function renderPlannerStudentOptions({ students, query, locale, localization }) {
  const matches = filterPlannerStudents(students, query, localization);
  if (!matches.length) return `<span class="planner-student-no-match" role="status">${escapeHtml(t(locale, "plannerStudentNoMatches"))}</span>`;
  return matches.map((student, index) => {
    const label = plannerStudentLabel(student, locale, localization);
    return `<button type="button" id="planner-student-option-${student.student_id}-${index}" class="planner-student-option" role="option" aria-selected="false" data-planner-student-option="${student.student_id}" data-planner-student-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
  }).join("");
}

export function getGiftOnlyPlanningStudents({ data = {}, state = {} } = {}) {
  const students = data?.plannerStudents ?? data?.students ?? [];
  const plans = Array.isArray(state?.students) ? state.students : [];
  return plans.map((plan) => {
    const student = data?.studentById?.get(String(plan.studentId))
      ?? students.find((item) => Number(item.student_id) === Number(plan.studentId));
    const release = getEligibleRelationshipSources(plan.studentId, state?.cnProgress, data?.releaseTimeline ?? []);
    return { plan, student, release };
  }).filter(({ release }) => release.giftOnly);
}

function studentPicker(data, state, locale, localization, editingPlan = null) {
  const firstPlan = editingPlan ?? state.students?.[0];
  const firstStudent = firstPlan ? data.studentById.get(String(firstPlan.studentId)) : null;
  const displayValue = firstStudent ? plannerStudentLabel(firstStudent, locale, localization) : "";
  const options = renderPlannerStudentOptions({ students: data.plannerStudents ?? data.students, query: "", locale, localization });
  return `<label class="planner-student-picker"><span>${t(locale, "plannerStudent")}</span><div class="planner-student-combobox"><input name="studentSearch" data-planner-student-search type="search" value="${escapeHtml(displayValue)}" placeholder="${escapeHtml(t(locale, "plannerStudentSearchPlaceholder"))}" autocomplete="off" required role="combobox" aria-controls="planner-student-options" aria-expanded="false" aria-autocomplete="list" aria-activedescendant="" aria-describedby="planner-student-search-hint"><input name="studentId" type="hidden" value="${escapeHtml(firstStudent?.student_id ?? "")}"><div id="planner-student-options" class="planner-student-options" data-planner-student-options role="listbox" hidden>${options}</div></div><small id="planner-student-search-hint">${t(locale, "plannerStudentSearchHint")}</small></label>`;
}

export function prepareAllocation(data, state, thresholds, preparedSummary = null) {
  const summary = preparedSummary ?? calculatePlanningSummary({
    state,
    targets: state.students,
    mainTargetId: state.mainTargetStudentId,
    forecastDays: state.forecastDays,
    data: { ...data, snapshots: { ...data.snapshots, thresholds } },
  });
  const plannedStudents = summary.allocation.students;
  const reservationQuantities = new Map();
  for (const assignment of summary.allocation.assignments ?? []) {
    const giftId = String(assignment.giftId);
    reservationQuantities.set(giftId, (reservationQuantities.get(giftId) ?? 0) + Number(assignment.quantity ?? 0));
  }
  return {
    students: plannedStudents,
    allocation: {
      ...summary.allocation,
      reservationAssignments: [...reservationQuantities.entries()].map(([giftId, quantity]) => ({ giftId, quantity })),
      synthesisGiftIds: summary.allocation.synthesisGiftIds ?? [],
    },
  };
}

function hasActiveGiftReservation(state) {
  return Object.values(state?.giftReservations ?? {}).some((quantity) => Number(quantity) > 0)
    || (state?.synthesisReservations ?? []).length > 0;
}

function renderReservationControl({ state, locale }) {
  if (hasActiveGiftReservation(state)) {
    return `<div class="planner-reservation-status" role="status"><strong>${escapeHtml(t(locale, "plannerReservationActive"))}</strong><span>${escapeHtml(t(locale, "plannerReservationActiveHint"))}</span></div>`;
  }
  return `<button type="button" class="primary-button planner-quick-reserve" data-reserve-allocation>${escapeHtml(t(locale, "reserveAllocation"))}</button>`;
}

function detailMetric(label, value, locale, prefix = "") {
  return `<div class="planner-detail-metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(prefix)}${formatExp(value, locale)}</b></div>`;
}

function detailSource({ title, source = {}, locale }) {
  const daily = source.daily ?? {};
  return `<div class="planner-detail-source"><div class="planner-detail-source-head"><strong>${escapeHtml(title)}</strong><b>+${formatExp(source.totalExp ?? 0, locale)}</b></div><div class="planner-detail-metric-grid">${detailMetric(t(locale, "planningDetailConcrete"), source.concreteExp, locale, "+")}${detailMetric(t(locale, "planningDetailChoiceBox"), source.choiceBoxExp, locale, "+")}${detailMetric(t(locale, "planningDetailRandomGoldBox"), source.randomGoldBoxExp, locale, "+")}${detailMetric(t(locale, "planningDetailRandomPurpleBox"), source.randomPurpleBoxExp, locale, "+")}${detailMetric(t(locale, "planningDetailManufacturing"), source.manufacturingExp, locale, "+")}${detailMetric(t(locale, "planningDetailSynthesis"), source.synthesisExp, locale, "+")}${detailMetric(t(locale, "planningDetailSchedule"), daily.scheduleExp, locale, "+")}${detailMetric(t(locale, "planningDetailCafe"), daily.cafeExp, locale, "+")}</div></div>`;
}

function renderPlannerDetails({ result, summary, resourceSummary, locale }) {
  const current = result?.sourceBreakdown?.current ?? {};
  const free = result?.sourceBreakdown?.free ?? {};
  const recurring = free.recurring ?? {};
  const incoming = free.incoming ?? {};
  const days = result?.estimatedDays === null ? t(locale, "planningDaysUnknown") : `${formatInteger(result?.estimatedDays ?? 0, locale)} ${t(locale, "planningDaysUnit")}`;
  return `<details class="planner-result-details"><summary class="planner-details-toggle"><span>${escapeHtml(t(locale, "planningDetails"))}</span><span class="planner-details-toggle-icon" aria-hidden="true"></span></summary><div class="planner-detail-sections"><section class="planner-detail-section planner-target-detail"><h3>${escapeHtml(t(locale, "planningDetailTarget"))}</h3><div class="planner-detail-metric-grid">${detailMetric(t(locale, "planningCurrentGap"), result?.immediateGap, locale)}${detailMetric(t(locale, "planningDetailConfirmed"), result?.incomingFreeExp, locale, "+")}${detailMetric(t(locale, "planningDetailRecurring"), result?.recurringFreeExp, locale, "+")}${detailMetric(t(locale, "planningTotalExp"), result?.totalExpectedExp, locale)}${detailMetric(t(locale, "planningGapAfterFree", summary.forecastDays), result?.gapWithinPeriod, locale)}<div class="planner-detail-metric"><span>${escapeHtml(t(locale, "planningEstimatedDays"))}</span><b>${escapeHtml(days)}</b></div></div><p class="planner-detail-note">${escapeHtml(t(locale, "planningDetailMethod"))}</p></section><section class="planner-detail-section planner-stock-detail"><h3>${escapeHtml(t(locale, "planningDetailStock"))}</h3><div class="planner-detail-metric-grid">${detailMetric(t(locale, "planningDetailConcrete"), current.concreteExp, locale, "+")}${detailMetric(t(locale, "planningDetailChoiceBox"), current.boxExp, locale, "+")}${detailMetric(t(locale, "planningDetailRandomGoldBox"), current.randomGoldBoxExp, locale, "+")}${detailMetric(t(locale, "planningDetailRandomPurpleBox"), current.randomPurpleBoxExp, locale, "+")}${detailMetric(t(locale, "planningDetailManufacturing"), current.manufacturingExp, locale, "+")}${detailMetric(t(locale, "planningDetailSynthesis"), current.synthesisExp, locale, "+")}</div></section><section class="planner-detail-section planner-periodic-detail"><h3>${escapeHtml(t(locale, "planningDetailPeriodic"))}</h3>${detailSource({ title: t(locale, "planningDetailConfirmed"), source: incoming, locale })}${detailSource({ title: t(locale, "planningDetailRecurring"), source: recurring, locale })}<p class="planner-detail-note">${escapeHtml(resourceSummary)}</p></section></div></details>`;
}

function workbenchIcon(id) {
  const icons = {
    planner: '<path d="M6.5 8.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"/><path d="M8 8.5V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M12 12v5M9.5 14.5h5"/>',
    inventory: '<path d="m4 8 8-4 8 4-8 4-8-4Z"/><path d="m4 8 8 4 8-4v8l-8 4-8-4V8Z"/><path d="M12 12v8M8 6l8 4"/>',
    resources: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16M9 13.5a2.8 2.8 0 1 1 5.6 0c0 1.7-2.8 3.3-2.8 3.3s-2.8-1.6-2.8-3.3Z"/>',
    packages: '<path d="M5 8.5h14l-1 11H6l-1-11Z"/><path d="M8 8.5V6a4 4 0 0 1 8 0v2.5M12 12.2l.55 1.1 1.2.17-.87.85.2 1.2-1.08-.57-1.08.57.2-1.2-.87-.85 1.2-.17.55-1.1Z"/>',
    relationship: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h8M8 10h6"/>',
    knowledge: '<path d="M12 4a8 8 0 1 0 8 8"/><path d="M12 4v4M12 12l3 2M16.5 4.5l1.2 1.2M20 12h-2"/>',
    agent: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3v-3H6.5A2.5 2.5 0 0 1 4 12.5v-7Z"/><path d="m12 6.2.55 1.45 1.55.1-1.2.98.4 1.5-1.3-.8-1.3.8.4-1.5-1.2-.98 1.55-.1L12 6.2Z"/>',
  };
  return `<svg class="workbench-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id] ?? icons.planner}</svg>`;
}

export function renderWorkbenchTabs({ locale, active, data = {} }) {
  const tabs = [
    ["planner", t(locale, "workbenchPlanner")],
    ["inventory", t(locale, "workbenchInventory")],
    ["resources", t(locale, "workbenchResources")],
    ["packages", t(locale, "workbenchPackages")],
    ["relationship", t(locale, "workbenchRelationship")],
    ["knowledge", t(locale, "workbenchKnowledge")],
    ["agent", t(locale, "workbenchAgent")],
  ];
  return `<nav class="workbench-tabs" aria-label="${escapeHtml(t(locale, "workbenchNavigation"))}"><div class="workbench-tab-list">${tabs.map(([id, label]) => `<button type="button" class="workbench-tab ${id === active ? "is-active" : ""}" data-workbench="${id}" aria-current="${id === active ? "page" : "false"}"><span class="workbench-tab-art">${workbenchIcon(id)}</span><span>${escapeHtml(label)}</span></button>`).join("")}</div><label class="workbench-mobile-picker"><span>${escapeHtml(t(locale, "mobileWorkspaceLabel"))}</span><select data-workbench-select aria-label="${escapeHtml(t(locale, "mobileWorkspaceLabel"))}">${tabs.map(([id, label]) => `<option value="${id}" ${id === active ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label></nav>`;
}

export function renderPlannerWorkspace({ data, state, locale, localization, notice = "" }) {
  const thresholds = data.snapshots.thresholds;
  const plannerCaption = t(locale, "plannerCaption");
  const mainPlan = state.students?.find((plan) => String(plan.studentId) === String(state.mainTargetStudentId)) ?? state.students?.[0] ?? null;
  const editingPlan = mainPlan;
  const mainStudent = mainPlan ? data.studentById.get(String(mainPlan.studentId)) : null;
  const hasValidGoal = state.students?.some((plan) => Number(plan.targetLevel) > Number(plan.currentLevel) || Number(plan.currentProgress) > 0);
  const summary = calculatePlanningSummary({ state, targets: state.students, mainTargetId: state.mainTargetStudentId, forecastDays: state.forecastDays, data });
  const { allocation } = prepareAllocation(data, state, thresholds, summary);
  const hasAllocation = allocation.assignments.length > 0 || (allocation.synthesisGiftIds?.length ?? 0) > 0;
  const reservationControl = renderReservationControl({ state, locale });
  const allocationWarning = allocation.searchTruncated ? `<p class="planner-result-warning">${escapeHtml(t(locale, "planningAllocationApproximate"))}</p>` : "";
  const summaryByStudent = new Map(summary.students.map((item) => [String(item.studentId), item]));
  const orderedPlans = [...state.students].sort((left, right) => Number(left.studentId) === Number(state.mainTargetStudentId) ? -1 : Number(right.studentId) === Number(state.mainTargetStudentId) ? 1 : 0);
  const plannerForm = `<details class="planner-edit-details ${state.students.length ? "" : "planner-empty-form"}"${hasValidGoal ? "" : " open"}><summary>${escapeHtml(t(locale, hasValidGoal ? "planningEdit" : "planningAddGoal"))}</summary><form class="planner-student-form" id="planner-student-form">
      ${studentPicker(data, state, locale, localization, state.students?.[0] ?? null)}
      <label><span>${t(locale, "currentLevel")}</span><input name="currentLevel" type="number" min="1" max="100" step="1" value="${editingPlan?.currentLevel ?? 1}" required></label>
      <label><span>${t(locale, "currentProgress")}</span><input name="currentProgress" type="number" min="0" step="1" value="${editingPlan?.currentProgress ?? 0}" required></label>
      <label><span>${t(locale, "targetLevel")}</span><input name="targetLevel" type="number" min="1" max="100" step="1" value="${editingPlan?.targetLevel ?? 50}" required></label>
      <button class="primary-button" type="submit">${t(locale, "addStudent")}</button>
    </form></details>`;
  return `<section class="planner-workspace panel" aria-labelledby="planner-title">
    <div class="workspace-intro"><div><span class="workspace-kicker">${escapeHtml(t(locale, "workbenchPlanner"))}</span><h2 id="planner-title">${t(locale, "plannerTitle")}</h2>${plannerCaption ? `<p>${escapeHtml(plannerCaption)}</p>` : ""}</div><label class="planner-forecast-days"><span>${escapeHtml(t(locale, "planningForecastDays"))}</span><input type="number" min="0" max="366" step="1" value="${summary.forecastDays}" data-planner-forecast-days aria-label="${escapeHtml(t(locale, "planningForecastDays"))}"></label></div>
    ${notice ? `<p class="planner-notice" role="status">${escapeHtml(t(locale, notice))}</p>` : ""}
    ${mainStudent ? `<div class="planner-target-strip">${studentImage(mainStudent, data.assetManifest, locale, localization)}<div><strong>${escapeHtml(localizedName(mainStudent, "student", locale, localization))}</strong><span>${escapeHtml(t(locale, "currentLevel"))} ${formatInteger(mainPlan.currentLevel, locale)} → ${escapeHtml(t(locale, "targetLevel"))} ${formatInteger(mainPlan.targetLevel, locale)}</span></div><span class="planner-target-status">${escapeHtml(t(locale, "planningMainTarget"))}</span></div>` : ""}
    <div class="planner-subsection"><div class="section-heading compact"><h2>${t(locale, "plannedStudents")}</h2></div>${state.students.length ? `<div class="planner-result-list">${orderedPlans.map((plan) => {
      const student = data.studentById.get(String(plan.studentId));
      const result = summaryByStudent.get(String(plan.studentId));
      const sourceNotes = [];
      if (result?.releaseStatus !== "released") sourceNotes.push(t(locale, "planningGiftOnlyShort"));
      if (!result?.isMainTarget) sourceNotes.push(t(locale, "planningNonMainNote"));
      const sourceNote = sourceNotes.join(" · ");
      const resourceSummary = result?.releaseStatus !== "released"
        ? t(locale, "planningGiftOnlyResources")
        : result?.isMainTarget
          ? t(locale, "planningSharedResourcesIncluded")
          : t(locale, "planningGiftsOnlyUntilMain");
      const daily = result?.freeExpPerDay ?? 0;
      const days = result?.estimatedDays === null ? t(locale, "planningDaysUnknown") : `${formatInteger(result?.estimatedDays ?? 0, locale)} ${t(locale, "planningDaysUnit")}`;
      const requiredExp = result?.requiredExp ?? 0;
      return `<article class="planner-result-card ${result?.isMainTarget ? "is-main" : ""}"><div class="planner-result-head"><div class="planner-result-identity">${studentImage(student, data.assetManifest, locale, localization)}<div><strong>${escapeHtml(localizedName(student, "student", locale, localization))}</strong><small>${t(locale, "currentLevel")} ${formatInteger(plan.currentLevel, locale)} → ${t(locale, "targetLevel")} ${formatInteger(plan.targetLevel, locale)}</small>${sourceNote ? `<small class="planner-result-warning">${escapeHtml(sourceNote)}</small>` : ""}</div></div><div class="planner-result-actions">${result?.isMainTarget ? `<span class="planner-main-badge">${escapeHtml(t(locale, "planningMainTarget"))}</span>` : `<button type="button" class="text-button" data-set-main-target="${escapeHtml(plan.studentId)}">${escapeHtml(t(locale, "planningSetMain"))}</button>`}</div></div><div class="planner-result-kpis"><div class="planner-result-gap"><span>${escapeHtml(t(locale, "planningGap"))}</span><strong>${formatExp(result?.gapWithinPeriod ?? 0, locale)}</strong><small>${escapeHtml(t(locale, "planningGapHint", summary.forecastDays))}</small></div><div><span>${escapeHtml(t(locale, "planningEstimatedDays"))}</span><strong>${escapeHtml(days)}</strong><small>${escapeHtml(t(locale, "planningDailyRate", formatExp(daily, locale)))}</small></div><div><span>${escapeHtml(t(locale, "planningCurrentExp"))}</span><strong>${formatExp(result?.currentExp ?? 0, locale)}</strong><small>${escapeHtml(t(locale, "planningFreeExp", formatExp(result?.freeExp ?? 0, locale)))}</small></div></div>${result?.isMainTarget && hasAllocation ? reservationControl : ""}${renderPlannerDetails({ result, summary, resourceSummary, locale })}<button type="button" class="planner-remove-button" data-remove-plan="${escapeHtml(plan.id)}"><span class="planner-remove-icon" aria-hidden="true">×</span><span>${escapeHtml(t(locale, "remove"))}</span></button></article>`;
    }).join("")}</div>` : `<div class="planner-empty" role="status"><div class="planner-empty-copy"><strong>${escapeHtml(t(locale, "noPlannedStudents"))}</strong><span>${escapeHtml(t(locale, "plannerStudentSearchHint"))}</span></div><button type="button" class="primary-button" data-planner-open-form aria-controls="planner-student-form" aria-expanded="false">${escapeHtml(t(locale, "planningAddFirst"))}</button></div>`}</div>
    ${hasAllocation ? `<details class="planner-section planner-allocation-details"><summary>${escapeHtml(t(locale, "planningAllocationDetails"))}</summary>${allocationWarning}<div class="planner-allocation-list">${allocation.students.map((student) => `<article class="planner-allocation-row"><div><strong>${escapeHtml(student.name)}</strong><small>${t(locale, "allocated")} ${formatExp(student.effectiveExp, locale)} · ${t(locale, "unmetExp")} ${formatExp(student.unmetExp, locale)}</small></div><div class="planner-assignment-tags">${student.assignments.map((assignment) => { const gift = data.giftById.get(String(assignment.giftId)); return `<span class="planner-assignment-tag">${giftImage(gift, data.assetManifest, locale, localization)} ${escapeHtml(localizedName(gift, "gift", locale, localization))} ×${assignment.quantity}</span>`; }).join("")}</div></article>`).join("")}</div><div class="planner-allocation-actions">${reservationControl}</div></details>` : ""}
    ${plannerForm}
  </section>`;
}

export function wirePlannerImageFallbacks(container) {
  container.querySelectorAll("img[data-fallback]").forEach((image) => image.addEventListener("error", () => {
    if (image.dataset.remoteTried !== "true" && image.dataset.fallback) {
      image.dataset.remoteTried = "true";
      image.src = image.dataset.fallback;
      return;
    }
    image.hidden = true;
    image.closest(".planner-gift-image, .planner-student-photo")?.classList.add("is-broken");
  }));
}
