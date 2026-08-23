import { localizedName, text as t } from "./i18n.js?v=dashboard-20260824-synthesis-accounting-v112";
import { formatExp, formatInteger, formatSmartQuantity } from "./render.js?v=dashboard-20260824-synthesis-accounting-v112";
import { calculateGiftBoxExpectedExp, calculateGiftBoxesExpectedExp } from "./gift-box-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import { calculateResourceForecast } from "./resource-model.js?v=dashboard-20260824-synthesis-accounting-v112";
import { calculateRelationshipSourceForecast } from "./release-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import { safeExternalUrl } from "./url-safety.js?v=dashboard-20260824-synthesis-accounting-v112";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localizedEvidenceField(lead, field, locale) {
  const suffix = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh_cn";
  return lead?.[`${field}_${suffix}`] ?? lead?.[`${field}_zh_cn`] ?? "";
}

function publicEvidenceText(value, locale) {
  return String(value ?? "")
    .replaceAll("100000", t(locale, "inventoryBoxName", "100000"))
    .replaceAll("100008", t(locale, "inventoryBoxName", "100008"))
    .replaceAll("100009", t(locale, "inventoryBoxName", "100009"));
}

function stripEvidencePrefix(value, locale) {
  const prefixes = locale === "en"
    ? [/^user[- ]confirmed:\s*/i, /^user[- ]provided:\s*/i]
    : locale === "ja"
      ? [/^ユーザー確認：?\s*/]
      : [/^用户确认：?\s*/];
  return prefixes.reduce((text, prefix) => text.replace(prefix, ""), String(value ?? "").trim());
}

function renderEvidenceExplanation({ lead, candidateText, candidateValue, locale }) {
  const explanation = stripEvidencePrefix(publicEvidenceText(candidateText, locale), locale);
  if (!explanation) return candidateValue || t(locale, "resourceEvidenceMissing");
  const candidateNumber = Number(lead?.candidate_value);
  if (Number.isFinite(candidateNumber) && explanation.includes(String(candidateNumber))) return explanation;
  return candidateValue ? `${candidateValue}：${explanation}` : explanation;
}

function renderResourceEvidence({ lead, source, locale, candidateUnit }) {
  if (!["lead", "user_confirmed"].includes(lead?.status)) {
    return `<div class="resource-evidence is-empty"><span>${escapeHtml(t(locale, "resourceEvidenceMissing"))}</span></div>`;
  }
  const candidateText = publicEvidenceText(localizedEvidenceField(lead, "candidate_text", locale), locale);
  const candidateValue = lead.candidate_value !== null && lead.candidate_value !== undefined && Number.isFinite(Number(lead.candidate_value))
    ? `${formatSmartQuantity(lead.candidate_value, locale)} ${candidateUnit || ""}`.trim()
    : "";
  const explanation = renderEvidenceExplanation({ lead, candidateText, candidateValue, locale });
  const sourceUrl = safeExternalUrl(source?.url);
  const sourceLink = sourceUrl
    ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noreferrer">' + escapeHtml(t(locale, "resourceEvidenceSource")) + ' ↗</a>'
    : '';
  return `<div class="resource-evidence ${lead.status === "user_confirmed" ? "is-confirmed" : "is-lead"}"><span class="resource-evidence-calculation">${escapeHtml(explanation)}</span>${sourceLink}</div>`;
}

function resourceSourceLabel(resource, lead, locale) {
  if (resource.input_kind === "floor") return t(locale, "resourceSourceFloor");
  if (resource.input_kind === "daily_count") return t(locale, "resourceSourceDailyCount", resource.id, resource.expected_per_count);
  if (resource.value_source === "user") return t(locale, "resourceSourcePlayerOverride");
  if (resource.value_source === "default" && lead?.status === "user_confirmed") return t(locale, "resourceSourceConfirmedDefault");
  return t(locale, "resourceSourceManual");
}

function periodMultiplier(resource, periodDays) {
  if (resource.cadence === "daily") return periodDays;
  if (resource.cadence === "weekly") return periodDays / 7;
  if (resource.cadence === "monthly") return periodDays / 30;
  return 0;
}

function resourcePreviewDays(state) {
  const value = Number(state?.resourceForecastDays ?? state?.periodDays ?? 30);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 30;
}

function selectedResourceTarget({ data, state }) {
  const targetId = state?.mainTargetStudentId ?? state?.students?.[0]?.studentId;
  if (targetId === null || targetId === undefined || targetId === "") return null;
  const student = data?.studentById?.get?.(String(targetId)) ?? null;
  const release = calculateRelationshipSourceForecast({
    state,
    studentId: targetId,
    cnProgress: state?.cnProgress,
    timeline: data?.releaseTimeline ?? [],
    periodDays: resourcePreviewDays(state),
  });
  return { student, release };
}

function renderResourceTargetSummary({ target, locale }) {
  if (!target) {
    return `<div class="resource-target-summary is-empty"><strong>${escapeHtml(t(locale, "resourceTargetTitle", t(locale, "resourceTargetNotSelected")))}</strong><span>${escapeHtml(t(locale, "resourceTargetChooseHint"))}</span></div>`;
  }
  const studentName = localizedName(target.student, "student", locale);
  const statusText = target.release?.giftOnly
    ? t(locale, "resourceTargetGiftOnly")
    : t(locale, "resourceTargetReleased");
  return `<div class="resource-target-summary ${target.release?.giftOnly ? "is-gift-only" : "is-released"}"><strong>${escapeHtml(t(locale, "resourceTargetTitle", studentName || t(locale, "unknown")))}</strong><span>${escapeHtml(statusText)}</span></div>`;
}

function renderResourceInput(resource, state, locale, lead) {
  const isConfigured = resource.amount !== null;
  if (resource.input_kind === "floor") {
    const resourceLabel = t(locale, "resourceName", resource.id);
    const floorLabel = `${resourceLabel} · ${t(locale, "resourceFloorSelect")}`;
    const customFloorLabel = `${resourceLabel} · ${t(locale, "resourceCustomFloor")}`;
    const options = resource.floor_options ?? [];
    const selectedFloor = Number(resource.amount);
    const isStandardFloor = Number.isInteger(selectedFloor) && options.includes(selectedFloor);
    const isCustomFloor = resource.floor_mode === "custom" || (resource.amount !== null && !isStandardFloor);
    const selectValue = isCustomFloor ? "custom" : isStandardFloor ? String(selectedFloor) : "";
    return `<div class="resource-input resource-floor-input">
      <label>
        <span>${escapeHtml(t(locale, "resourceFloorSelect"))}</span>
        <select data-resource-floor="${escapeHtml(resource.id)}" aria-label="${escapeHtml(floorLabel)}">
          <option value="">${escapeHtml(t(locale, "resourceFloorSelect"))}</option>
          ${options.map((floor) => `<option value="${floor}" ${selectValue === String(floor) ? "selected" : ""}>${escapeHtml(t(locale, "resourceFloorSummary", floor))}</option>`).join("")}
          <option value="custom" ${selectValue === "custom" ? "selected" : ""}>${escapeHtml(t(locale, "resourceCustomFloor"))}</option>
        </select>
      </label>
      ${selectValue === "custom" ? `<label class="resource-custom-floor"><span>${escapeHtml(t(locale, "resourceCustomFloor"))}</span><input type="number" min="1" max="${resource.max_floor ?? 124}" step="1" data-resource-amount="${escapeHtml(resource.id)}" value="${isConfigured ? resource.amount : ""}" placeholder="1–${resource.max_floor ?? 124}" inputmode="numeric" aria-label="${escapeHtml(customFloorLabel)}"></label>` : ""}
    </div>`;
  }
  const inputLabel = resource.input_kind
    ? t(locale, "resourceInputLabel", resource.input_kind, resource.id)
    : `${t(locale, "resourceName", resource.id)} · ${t(locale, "resourceValue")}`;
  const inputTitle = resource.value_source === "user"
    ? t(locale, "resourceSourcePlayerOverride")
    : t(locale, "resourceValue");
  const integerInput = Boolean(resource.input_kind) || resource.unit !== "relationship_exp";
  return `<label class="resource-input"><span>${escapeHtml(inputLabel)}</span><input type="number" min="0" step="${integerInput ? "1" : "0.01"}" inputmode="${integerInput ? "numeric" : "decimal"}" data-resource-amount="${escapeHtml(resource.id)}" value="${isConfigured ? resource.amount : ""}" placeholder="${escapeHtml(resource.input_kind ? t(locale, "resourceInputPlaceholder", resource.input_kind) : "—")}" aria-label="${escapeHtml(inputLabel)}" title="${escapeHtml(inputTitle)}"></label>`;
}

function renderUnlimitedRewardSummary(summary, locale) {
  if (!summary) return `<strong>${escapeHtml(t(locale, "resourceWaitingInput"))}</strong>`;
  const rewards = [
    t(locale, "resourceGoldSelectableGifts", formatInteger(summary.goldSelectableGifts, locale)),
    t(locale, "resourcePurpleRandomGifts", formatInteger(summary.purpleRandomGifts, locale)),
    ...(summary.synthesisStones > 0 ? [t(locale, "resourceSynthesisStones", formatInteger(summary.synthesisStones, locale))] : []),
  ];
  return `<div class="resource-reward-summary"><strong>${escapeHtml(t(locale, "resourceFloorSummary", summary.floor))}</strong>${rewards.map((reward) => `<span>${escapeHtml(reward)}</span>`).join("")}</div>`;
}

function renderResourceForecast(resource, forecast, locale, previewDays, target) {
  if (!forecast) return `<strong>${escapeHtml(t(locale, "resourceWaitingInput"))}</strong>`;
  if (forecast.kind === "unlimited_assault") return `${renderUnlimitedRewardSummary(forecast.summary, locale)}<small>${escapeHtml(t(locale, "resourceForecastLabel", resource.input_kind))} · ${escapeHtml(t(locale, "resourceForecastWindow", previewDays))}</small>`;
  if (forecast.kind === "relationship_exp") {
    const total = formatExp(forecast.value, locale);
    const targetValue = !target ? "—" : target.release?.giftOnly ? formatExp(0, locale) : total;
    const targetStatus = !target ? t(locale, "resourceTargetNotSelected") : target.release?.giftOnly ? t(locale, "resourceTargetExcluded") : t(locale, "resourceTargetReleased");
    return `<div class="resource-forecast-split"><div><small>${escapeHtml(t(locale, "resourceTotalPreview"))}</small><strong>${escapeHtml(total)}</strong></div><div><small>${escapeHtml(t(locale, "resourceTargetPreview"))}</small><strong>${escapeHtml(targetValue)}</strong></div></div><small>${escapeHtml(targetStatus)} · ${escapeHtml(t(locale, "resourceForecastWindow", previewDays))}</small>`;
  }
  const value = forecast.kind === "relationship_exp" ? formatExp(forecast.value, locale) : formatSmartQuantity(forecast.value, locale);
  return `<strong>${escapeHtml(value)}</strong><small>${escapeHtml(t(locale, "resourceForecastLabel", resource.input_kind))} · ${escapeHtml(t(locale, "resourceForecastWindow", previewDays))}</small>`;
}

function resourceMeta(resource, locale) {
  if (resource.id === "monthly-synthesis-stones") {
    return t(locale, resource.value_source === "user" ? "resourceSynthesisManualMeta" : "resourceSynthesisMeta", resource.amount);
  }
  return t(locale, "resourceCadence", resource.cadence);
}

function resourceIcon(resource, data) {
  const assetKey = {
    "weekly-manufacturing-stones": "item:3",
    "monthly-synthesis-stones": "item:82",
    "monthly-total-assault-gift-boxes": "item:100008",
    "monthly-grand-assault-gold-gift-boxes": "item:100008",
    "monthly-grand-assault-purple-gift-boxes": "item:100009",
    "monthly-unlimited-assault-gift-boxes": "item:100000",
    "daily-schedule-exp": "ui:schedule-favor",
    "daily-cafe-exp": "ui:schedule-favor",
  }[resource.id];
  const source = assetKey ? data?.assetManifest?.entries?.[assetKey] : null;
  const iconVariant = resource.id === "daily-schedule-exp" || resource.id === "daily-cafe-exp" ? "schedule" : "resource";
  return source ? `<img src="${escapeHtml(source.local)}" data-resource-icon="${iconVariant}" data-fallback="${escapeHtml(source.remote ?? "")}" alt="" loading="lazy">` : (resource.cadence === "daily" ? "D" : resource.cadence === "weekly" ? "W" : "M");
}

function renderResourceRow({ resource, state, data, locale, evidenceById, sourceById, target }) {
  const isConfigured = resource.amount !== null;
  const previewDays = resourcePreviewDays(state);
  const forecast = calculateResourceForecast(resource, resource.amount, previewDays, data.unlimitedAssaultRewards, { resources: state.resources });
  const lead = evidenceById.get(resource.id);
  const source = lead?.source_id ? sourceById.get(lead.source_id) : null;
  const candidateUnit = locale === "en" ? lead?.candidate_unit_en : locale === "ja" ? lead?.candidate_unit_ja : lead?.candidate_unit_zh_cn;
  const detailsContent = resource.input_kind
    ? `<p class="resource-source">${t(locale, "resourceSource")}：${escapeHtml(resourceSourceLabel(resource, lead, locale))}</p>`
    : renderResourceEvidence({ lead, source, locale, candidateUnit });
  return `<article class="resource-row ${isConfigured ? "is-configured" : "is-missing"}">
    <div class="icon-frame resource-icon" aria-hidden="true">${resourceIcon(resource, data)}</div>
    <div class="resource-copy"><strong><span class="resource-name">${escapeHtml(t(locale, "resourceName", resource.id))}</span><em class="resource-status ${isConfigured ? "is-configured" : "is-missing"}">${escapeHtml(t(locale, isConfigured ? "resourceConfigured" : "resourceMissing"))}</em></strong><small>${escapeHtml(resourceMeta(resource, locale))}</small></div>
    ${renderResourceInput(resource, state, locale, lead)}
    <div class="resource-forecast ${resource.input_kind === "floor" ? "is-reward-forecast" : ""}">${renderResourceForecast(resource, forecast, locale, previewDays, target)}</div>
    <details class="resource-row-details"><summary aria-label="${escapeHtml(`${t(locale, "resourceName", resource.id)} · ${t(locale, "resourceEvidenceDetails")}`)}">${escapeHtml(t(locale, "resourceName", resource.id))} · ${escapeHtml(t(locale, "resourceEvidenceDetails"))}</summary>${detailsContent}</details>
  </article>`;
}

function renderManufacturingProjection({ data, state, locale, localization }) {
  const previewDays = resourcePreviewDays(state);
  const stoneResource = state.resources.find((resource) => resource.id === "weekly-manufacturing-stones");
  const projectedStones = stoneResource?.amount === null || stoneResource?.amount === undefined
    ? null
    : stoneResource.amount * periodMultiplier(stoneResource, previewDays);
  const plans = Array.isArray(state.students) ? state.students : [];
  const cards = plans.length
    ? plans.map((plan) => {
      const student = data.studentById?.get(String(plan.studentId));
      const crafting = data.craftingById?.get(String(plan.studentId));
      const perStone = Number(crafting?.relationship_exp_per_manufacturing_stone);
      const hasPerStone = Number.isFinite(perStone) && perStone >= 0;
      const expected = projectedStones !== null && hasPerStone ? projectedStones * perStone : null;
      const stages = ["1", "2", "3"].map((stage) => Number(crafting?.stage_expected_relationship_exp?.[stage])).filter((value) => Number.isFinite(value));
      const studentName = student ? localizedName(student, "student", locale, localization) : t(locale, "unknown");
      return `<article class="manufacturing-resource-card">
        <div class="manufacturing-resource-head"><strong>${escapeHtml(studentName)}</strong><span>${escapeHtml(t(locale, "manufacturingExpected"))}：${expected === null ? escapeHtml(t(locale, "unknown")) : formatExp(expected, locale)}</span></div>
        <div class="manufacturing-resource-meta"><span>${escapeHtml(t(locale, "manufacturingStonesPeriod"))}：${projectedStones === null ? escapeHtml(t(locale, "unknown")) : formatSmartQuantity(projectedStones, locale)}</span><span>${escapeHtml(t(locale, "manufacturingPerStone"))}：${hasPerStone ? formatExp(perStone, locale) : escapeHtml(t(locale, "unknown"))}</span></div>
        <small>${stages.length === 3 ? `${escapeHtml(t(locale, "manufacturingStages"))}：${stages.map((value) => formatExp(value, locale)).join(" / ")}` : escapeHtml(t(locale, "manufacturingDataMissing"))}</small>
      </article>`;
    }).join("")
    : `<p class="gift-box-muted" role="status">${escapeHtml(t(locale, "manufacturingNoStudents"))}</p>`;

  return `<section class="manufacturing-resource-workspace" aria-labelledby="manufacturing-resource-title">
    <div class="section-heading compact"><h2 id="manufacturing-resource-title">${escapeHtml(t(locale, "manufacturingProjectionTitle"))}</h2></div>
    <div class="manufacturing-resource-list">${cards}</div>
  </section>`;
}

function renderRelationshipSourceProjection({ data, state, locale, localization }) {
  const plans = Array.isArray(state.students) ? state.students : [];
  if (!plans.length) return "";
  const previewDays = resourcePreviewDays(state);
  const rows = plans.map((plan) => {
    const student = data.studentById?.get(String(plan.studentId));
    const isMainTarget = Number(plan.studentId) === Number(state.mainTargetStudentId);
    const forecast = calculateRelationshipSourceForecast({
      state,
      studentId: plan.studentId,
      cnProgress: state.cnProgress,
      timeline: data.releaseTimeline ?? [],
      periodDays: previewDays,
    });
    const label = student ? localizedName(student, "student", locale, localization) : t(locale, "unknown");
    const value = !isMainTarget
      ? t(locale, "relationshipSourcesSharedMain")
      : forecast.giftOnly
      ? t(locale, "relationshipSourcesGiftOnly")
      : t(locale, "relationshipSourcesIncluded", formatExp(forecast.totalExp, locale));
    return `<article class="relationship-source-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></article>`;
  }).join("");
  return `<section class="relationship-source-workspace" aria-labelledby="relationship-source-title"><div class="section-heading compact"><h2 id="relationship-source-title">${escapeHtml(t(locale, "relationshipSourcesTitle"))}</h2></div><div class="relationship-source-list">${rows}</div></section>`;
}

function giftBoxName(box, locale) {
  const id = String(box?.id ?? "");
  if (["100000", "100008", "100009"].includes(id)) return t(locale, "inventoryBoxName", id);
  if (locale === "en") return box?.name_en ?? box?.name_zh_cn ?? "";
  if (locale === "ja") return box?.name_ja ?? box?.name_en ?? box?.name_zh_cn ?? "";
  return box?.name_zh_cn ?? box?.name_en ?? "";
}

function giftBoxPoolLabel(box, locale) {
  if (locale === "en") return box?.pool_label_en ?? box?.pool_label_zh_cn ?? "";
  if (locale === "ja") return box?.pool_label_ja ?? box?.pool_label_en ?? box?.pool_label_zh_cn ?? "";
  return box?.pool_label_zh_cn ?? box?.pool_label_en ?? "";
}

function renderGiftBoxWorkspace({ data, state, locale, localization }) {
  const boxes = Array.isArray(data?.giftBoxes) ? data.giftBoxes : [];
  const plans = Array.isArray(state.students) ? state.students : [];
  const entries = boxes
    .map((box) => ({
      box,
      quantity: Number(state.giftBoxes?.[String(box.id)] ?? 0),
      options: { policy: "best_for_student" },
    }))
    .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0);

  const studentCards = plans.length
    ? plans.map((plan) => {
      const student = data.studentById?.get(String(plan.studentId));
      const giftValues = Object.fromEntries((student?.gift_values ?? []).map((gift) => [String(gift.gift_id), gift.relationship_exp]));
      const total = entries.length
        ? calculateGiftBoxesExpectedExp(entries, giftValues)
        : { status: "no_box_quantity", expectedExp: null };
      const perBox = boxes.map((box) => {
        const quantity = Number(state.giftBoxes?.[String(box.id)] ?? 0);
        if (!(quantity > 0)) return null;
        return { box, quantity, result: calculateGiftBoxExpectedExp(box, giftValues, { policy: "best_for_student" }) };
      }).filter(Boolean);
      const studentName = student ? localizedName(student, "student", locale, localization) : t(locale, "unknown");
      return `<article class="gift-box-student-card">
        <div class="gift-box-student-head"><strong>${escapeHtml(studentName)}</strong><span>${escapeHtml(t(locale, "giftBoxExpectedTotal"))}：${total.status === "ready" ? formatExp(total.expectedExp, locale) : "—"}</span></div>
        <div class="gift-box-results">${perBox.length ? perBox.map(({ box, quantity, result }) => `<div class="gift-box-result"><span>${escapeHtml(giftBoxName(box, locale))} ×${formatSmartQuantity(quantity, locale)}</span><span>${result.status === "ready" ? `${escapeHtml(t(locale, "giftBoxPerBox"))} ${formatExp(result.expectedExp, locale)} · ${formatExp(result.expectedExp * quantity, locale)}` : escapeHtml(t(locale, "giftBoxStatus", result.status))}</span></div>`).join("") : `<p class="gift-box-muted">${escapeHtml(t(locale, "giftBoxNoQuantity"))}</p>`}</div>
      </article>`;
    }).join("")
    : `<p class="gift-box-muted" role="status">${escapeHtml(t(locale, "giftBoxNoStudents"))}</p>`;

  return `<section class="gift-box-workspace" aria-labelledby="gift-box-title">
    <div class="section-heading compact"><h2 id="gift-box-title">${escapeHtml(t(locale, "giftBoxTitle"))}</h2></div>
    <div class="gift-box-inventory">${boxes.length ? boxes.map((box) => `<label class="gift-box-input"><span>${escapeHtml(giftBoxName(box, locale))}<small>${escapeHtml(t(locale, "giftBoxStatus", box.status))}${giftBoxPoolLabel(box, locale) ? ` · ${escapeHtml(giftBoxPoolLabel(box, locale))}` : ""}</small></span><input type="number" min="0" step="1" inputmode="numeric" data-gift-box-count="${escapeHtml(box.id)}" value="${Number(state.giftBoxes?.[String(box.id)] ?? 0) || ""}" placeholder="0" aria-label="${escapeHtml(`${t(locale, "giftBoxInput")} ${giftBoxName(box, locale)}`)}"></label>`).join("") : `<p class="gift-box-muted">${escapeHtml(t(locale, "giftBoxNoDefinitions"))}</p>`}</div>
    <p class="gift-box-note">${escapeHtml(t(locale, "giftBoxUnknownNote"))}</p>
    <div class="gift-box-student-list">${studentCards}</div>
  </section>`;
}

export function renderResourcesWorkspace({ data = {}, state, locale, localization, evidence, openResourceId = null }) {
  const previewDays = resourcePreviewDays(state);
  const target = selectedResourceTarget({ data, state });
  const resourcesCaption = t(locale, "resourcesCaption");
  const evidenceById = new Map((evidence?.rows ?? []).map((row) => [row.resource_id, row]));
  const sourceById = new Map((evidence?.sources ?? []).map((source) => [source.id, source]));
  const configured = state.resources.filter((resource) => resource.amount !== null);
  const missing = state.resources.filter((resource) => resource.amount === null);
  const shouldKeepConfiguredOpen = Boolean(openResourceId && configured.some((resource) => resource.id === openResourceId));
  const projected = target?.release?.totalExp ?? 0;
  return `<section class="resource-workspace panel" aria-labelledby="resource-title">
    <div class="section-heading"><div class="resource-heading-copy"><h2 id="resource-title">${t(locale, "resourcesTitle")}</h2>${resourcesCaption ? `<p class="section-caption">${escapeHtml(resourcesCaption)}</p>` : ""}</div></div>
    <div class="resource-toolbar"><label><span>${t(locale, "resourcePreviewDays")}</span><input type="number" min="0" max="366" step="1" data-resource-period-days value="${previewDays}"></label><a class="template-link" href="./relationship_data/cn_planner_data_to_fill.md" target="_blank" rel="noreferrer">${t(locale, "fillDataTemplate")}</a></div>
    ${renderResourceTargetSummary({ target, locale })}
    <div class="resource-kpi-grid"><article><span>${t(locale, "resourceConfigured")}</span><strong>${configured.length}/${state.resources.length}</strong></article><article><span>${t(locale, "resourceTargetExp")}</span><strong>${formatExp(projected, locale)}</strong></article><article><span>${t(locale, "resourceMissing")}</span><strong>${state.resources.length - configured.length}</strong></article></div>
    ${missing.length ? `<section class="resource-missing-panel" aria-labelledby="resource-missing-title"><div class="resource-missing-heading"><div><span class="resource-missing-kicker">${escapeHtml(t(locale, "resourceMissing"))}</span><h2 id="resource-missing-title">${escapeHtml(t(locale, "resourceMissingTitle"))}</h2></div><span>${missing.length}</span></div><div class="resource-list">${missing.map((resource) => renderResourceRow({ resource, state, data, locale, evidenceById, sourceById, target })).join("")}</div></section>` : ""}
    ${configured.length ? `<details class="resource-details"${shouldKeepConfiguredOpen ? " open" : ""}><summary>${escapeHtml(t(locale, "resourceInputDetails"))} · ${configured.length}</summary><div class="resource-list">${configured.map((resource) => renderResourceRow({ resource, state, data, locale, evidenceById, sourceById, target })).join("")}</div></details>` : ""}
    <details class="resource-details"><summary>${escapeHtml(t(locale, "resourceProjectionDetails"))}</summary>${renderManufacturingProjection({ data, state, locale, localization })}${renderRelationshipSourceProjection({ data, state, locale, localization })}${renderGiftBoxWorkspace({ data, state, locale, localization })}</details>
  </section>`;
}
