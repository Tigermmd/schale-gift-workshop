import { calculatePackageEfficiency } from "./planning-summary.js?v=dashboard-20260824-data-refresh-v113";
import { resolveStudentFavoriteGiftId } from "./gift-only-planner.js?v=dashboard-20260824-data-refresh-v113";
import { localizedName, text as t } from "./i18n.js?v=dashboard-20260824-data-refresh-v113";
import { formatExp, formatInteger, formatQuantity } from "./render.js?v=dashboard-20260824-data-refresh-v113";
import { safeExternalUrl } from "./url-safety.js?v=dashboard-20260824-data-refresh-v113";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function packageName(item, locale) {
  if (locale === "en") return item?.name_en ?? item?.name_zh_cn ?? "";
  if (locale === "ja") return item?.name_ja ?? item?.name_en ?? item?.name_zh_cn ?? "";
  return item?.name_zh_cn ?? item?.name_en ?? "";
}

function contentName(item, locale) {
  if (locale === "en") return item?.name_en ?? item?.name_zh_cn ?? "";
  if (locale === "ja") return item?.name_ja ?? item?.name_en ?? item?.name_zh_cn ?? "";
  return item?.name_zh_cn ?? item?.name_en ?? "";
}

function resolveStudentFavoriteContents(item, student, data) {
  const packageFavorites = student?.package_favorite_gifts ?? {};
  const giftById = data?.giftById;
  return (item?.contents ?? []).map((content) => {
    if (content?.kind !== "student_favorite_gift") return content;
    const resolvedId = packageFavorites[content.gift_color]
      ?? resolveStudentFavoriteGiftId(student, content.gift_color)
      ?? content.item_id;
    const gift = giftById?.get?.(String(resolvedId));
    if (!gift) return { ...content, item_id: resolvedId };
    return {
      ...content,
      item_id: gift.id,
      name_zh_cn: gift.name_zh_cn ?? content.name_zh_cn,
      name_en: gift.name_en ?? content.name_en,
      name_ja: gift.name_ja ?? content.name_ja,
    };
  });
}

function packageNote(item, locale) {
  const suffix = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh_cn";
  return item?.gift_binding?.[`note_${suffix}`] ?? item?.gift_binding?.note_zh_cn ?? item?.note ?? "";
}

export function catalogPackageDraft(item, locale) {
  return {
    name: packageName(item, locale),
    price: Number(item?.price_cny || 0),
    limit: Number(item?.purchase_limit || 0),
    contents: (item?.contents ?? []).map((content) => `${contentName(content, locale)} ×${content.quantity}`).join("；"),
  };
}

function selectedStudentLabel(student, locale, localization) {
  if (!student) return t(locale, "packageNoTarget");
  return localizedName(student, "student", locale, localization);
}

function targetStudentOptions({ students = [], selectedId, locale, localization }) {
  return students.map((plan) => {
    const student = plan?.student ?? plan;
    if (!student?.student_id) return "";
    const label = selectedStudentLabel(student, locale, localization);
    return `<option value="${escapeHtml(student.student_id)}" ${String(student.student_id) === String(selectedId) ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function phaseLabel(row, locale) {
  return row.timelineId === "mika-launch" ? t(locale, "packageLaunchPhase") : t(locale, "packageCurrentPhase");
}

function contentIcon(content, data) {
  const gift = data?.giftById?.get(String(content?.item_id));
  if (gift) {
    const source = data?.assetManifest?.entries?.[`gift:${gift.id}`];
    return `<img src="${escapeHtml(source?.local ?? `./assets/gifts/${gift.id}.webp`)}" data-fallback="${escapeHtml(source?.remote ?? "")}" alt="" loading="lazy">`;
  }
  const itemSource = data?.assetManifest?.entries?.[`item:${content?.item_id}`];
  if (itemSource) {
    return `<img src="${escapeHtml(itemSource.local)}" data-fallback="${escapeHtml(itemSource.remote ?? "")}" alt="" loading="lazy">`;
  }
  if (content?.kind === "student_favorite_gift") {
    return `<span class="package-content-glyph package-favorite-glyph" aria-hidden="true">♡</span>`;
  }
  return `<span class="package-content-glyph" aria-hidden="true">▧</span>`;
}

function contentsHtml(item, locale, data) {
  const contents = item?.contents ?? [];
  if (!contents.length) return `<span class="package-content-muted">${escapeHtml(t(locale, "packageContentsUnknown"))}</span>`;
  return contents.map((content) => `<span class="package-content-item">${contentIcon(content, data)}<span>${escapeHtml(contentName(content, locale))} ×${escapeHtml(formatQuantity(content.quantity, locale))}</span></span>`).join("");
}

function breakdownHtml(row, locale) {
  const values = [
    ["packageGoldExp", row.goldGiftExp],
    ["packagePurpleExp", row.purpleGiftExp],
    ["packageBouquetExp", row.bouquetExp],
    ["packageChoiceBoxExp", row.choiceBoxExp],
    ["packageRandomBoxExp", row.randomBoxExp],
    ["packageManufacturingExp", row.manufacturingExp],
    ["packageSynthesisExp", row.synthesisExp],
  ].filter(([, value]) => Number(value) > 0);
  return values.length
    ? values.map(([key, value]) => `<span>${escapeHtml(t(locale, key))} ${formatExp(value, locale)}</span>`).join("")
    : `<span>${escapeHtml(t(locale, "packageNoGiftExp"))}</span>`;
}

function packageRow({ row, item, locale, rank = null, data, student }) {
  const displayItem = {
    ...item,
    contents: resolveStudentFavoriteContents(item, student, data),
    name_zh_cn: row.name_zh_cn ?? item?.name_zh_cn,
    name_en: row.name_en ?? item?.name_en,
    name_ja: row.name_ja ?? item?.name_ja,
  };
  const available = Number(row.availablePurchases ?? 0);
  const limit = Number(row.purchaseLimit ?? 0);
  const purchased = Number(row.purchasedCount ?? 0);
  const efficiency = row.expPerYuan === null ? t(locale, "unknown") : formatExp(row.expPerYuan, locale);
  const sourceUrl = safeExternalUrl(displayItem?.source);
  return `<article class="package-efficiency-row">
    <div class="package-efficiency-head">
      ${rank ? `<span class="package-rank" aria-label="#${rank}">#${rank}</span>` : ""}
      <div><strong>${escapeHtml(packageName(displayItem, locale) || row.name)}</strong><small>${escapeHtml(phaseLabel(row, locale))} · ${escapeHtml(t(locale, "packageCategoryName", displayItem?.category ?? "gifts"))}</small></div>
      <span class="package-efficiency-rate"><b>${escapeHtml(efficiency)}</b><small>${escapeHtml(t(locale, "packageExpPerYuan"))}</small></span>
    </div>
    <div class="package-efficiency-kpis" aria-label="${escapeHtml(t(locale, "packageDetails"))}">
      <div><span>${escapeHtml(t(locale, "packagePrice"))}</span><b>¥${formatInteger(row.price || 0, locale)}</b></div>
      <div><span>${escapeHtml(t(locale, "packageExpectedExp"))}</span><b>${formatExp(row.expectedExp, locale)}</b></div>
      <div><span>${escapeHtml(t(locale, "packageAvailable"))}</span><b>${formatQuantity(available, locale)}</b></div>
      <div><span>${escapeHtml(t(locale, "packagePurchased"))}</span><b>${formatQuantity(purchased, locale)}</b></div>
      <div><span>${escapeHtml(t(locale, "packageLimit"))}</span><b>${formatQuantity(limit, locale)}</b></div>
    </div>
    <details class="package-details"><summary>${escapeHtml(t(locale, "packageDetails"))}</summary><div class="package-contents">${contentsHtml(displayItem, locale, data)}</div><div class="package-efficiency-breakdown">${breakdownHtml(row, locale)}</div>
    ${packageNote(displayItem, locale) ? `<p class="package-catalog-note">${escapeHtml(packageNote(displayItem, locale))}</p>` : ""}
    <div class="package-catalog-actions">${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(t(locale, "packageSource"))} ↗</a>` : ""}<span class="package-snapshot-date">${escapeHtml(t(locale, "packageAsOf", row.asOf ?? "—"))}</span></div></details>
  </article>`;
}

function renderPackageGroup({ title, rows, catalogItems, locale, data, student, launchForecast = false }) {
  if (!rows.length) return "";
  const topRows = rows.slice(0, 3);
  const remainingRows = rows.slice(3);
  const targetName = localizedName(student, "student", locale, data?.localization);
  return `<section class="package-efficiency-section package-group" aria-label="${escapeHtml(title)}"><div class="package-section-heading"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(t(locale, "packageTopTitle"))}</span></div>${launchForecast ? `<p class="package-forecast-notice" role="note"><strong>${escapeHtml(t(locale, "packageLaunchForecastNotice", targetName))}</strong></p>` : ""}<div class="package-efficiency-list">${topRows.map((row, index) => packageRow({ row, item: catalogItems.get(String(row.packageId)), locale, rank: index + 1, data, student })).join("")}</div>${remainingRows.length ? `<details class="package-all-details"><summary>${escapeHtml(t(locale, "packageAllTitle"))} · ${remainingRows.length}</summary><div class="package-efficiency-list">${remainingRows.map((row, index) => packageRow({ row, item: catalogItems.get(String(row.packageId)), locale, rank: index + 4, data, student })).join("")}</div></details>` : ""}</section>`;
}

export function renderPackagesWorkspace({ data = {}, state = {}, locale, localization, selectedStudentId = null }) {
  const catalog = data.packageCatalog ?? data.snapshots?.packages ?? {};
  const plannedStudents = (state.students ?? []).map((plan) => ({ plan, student: data.studentById?.get(String(plan.studentId)) })).filter(({ student }) => student);
  const targetId = selectedStudentId ?? state.mainTargetStudentId;
  const target = plannedStudents.find(({ student }) => String(student.student_id) === String(targetId)) ?? plannedStudents[0];
  const targetStudent = target?.student ?? null;
  const rows = targetStudent
    ? calculatePackageEfficiency({
      student: targetStudent,
      packageCatalog: catalog,
      packagePlans: state.packagePlans,
      giftBoxes: data.giftBoxes ?? data.snapshots?.giftBoxes?.boxes ?? [],
      manufacturingData: data.craftingById?.get(String(targetStudent.student_id)),
      periodDays: state.forecastDays,
    })
    : [];
  const catalogItems = new Map((catalog.packages ?? []).map((item) => [String(item.id), item]));
  const rankedRows = [...rows].sort((left, right) => (right.expPerYuan ?? -1) - (left.expPerYuan ?? -1));
  const currentRows = rankedRows.filter((row) => row.timelineId !== "mika-launch");
  const launchRows = rankedRows.filter((row) => row.timelineId === "mika-launch");
  const targetPicker = plannedStudents.length
    ? `<label class="package-target-picker"><span>${escapeHtml(t(locale, "packageTarget"))}</span><select data-package-target-student aria-label="${escapeHtml(t(locale, "packageTarget"))}">${targetStudentOptions({ students: plannedStudents, selectedId: targetStudent?.student_id, locale, localization })}</select></label>`
    : "";
  return `<section class="package-workspace panel" aria-labelledby="package-title">
    <div class="section-heading package-page-heading"><div><h2 id="package-title">${escapeHtml(t(locale, "packagesTitle"))}</h2>${targetPicker}</div></div>
    ${!targetStudent ? `<div class="planner-empty" role="status"><div class="planner-empty-copy"><strong>${escapeHtml(t(locale, "packageNoTarget"))}</strong></div><button type="button" class="primary-button" data-go-planner>${escapeHtml(t(locale, "packageGoPlanner"))}</button></div>` : `${renderPackageGroup({ title: t(locale, "packageCurrentPhase"), rows: currentRows, catalogItems, locale, data, student: targetStudent })}${renderPackageGroup({ title: t(locale, "packageLaunchPhase"), rows: launchRows, catalogItems, locale, data, student: targetStudent, launchForecast: true })}`}
    ${targetStudent && !rows.length ? `<div class="planner-empty" role="status">${escapeHtml(t(locale, "packageNoRows"))}</div>` : ""}
  </section>`;
}
