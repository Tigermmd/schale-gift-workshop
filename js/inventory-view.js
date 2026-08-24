import { calculateGiftBoxExpectedExp } from "./gift-box-state.js?v=dashboard-20260824-data-refresh-v113";
import { calculateInventorySummary, mapPeriodicResource } from "./inventory-state.js?v=dashboard-20260824-data-refresh-v113";
import { localizedName, text as t } from "./i18n.js?v=dashboard-20260824-data-refresh-v113";
import { formatExp, formatInteger, formatSmartQuantity } from "./render.js?v=dashboard-20260824-data-refresh-v113";
import { calculateRelationshipSourceForecast } from "./release-state.js?v=dashboard-20260824-data-refresh-v113";

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
  const rarity = String(gift?.rarity ?? "").toLowerCase();
  return `<span class="icon-frame inventory-gift-image ${rarity ? `gift-rarity-${rarity}` : ""}"><img src="${escapeHtml(source?.local ?? `./assets/gifts/${gift.id}.webp`)}" data-fallback="${escapeHtml(source?.remote ?? "")}" alt="${escapeHtml(name)}" loading="lazy"><span aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span></span>`;
}

function itemImage(itemId, manifest, className = "inventory-item-image") {
  const source = manifest?.entries?.[`item:${itemId}`];
  if (!source) return `<span class="icon-frame inventory-resource-glyph" aria-hidden="true">✧</span>`;
  return `<span class="icon-frame ${className}"><img src="${escapeHtml(source.local)}" data-fallback="${escapeHtml(source.remote ?? "")}" alt="" loading="lazy"></span>`;
}

function boxName(box, locale) {
  const id = String(box?.id ?? "");
  if (["100000", "100008", "100009"].includes(id)) return t(locale, "inventoryBoxName", id);
  if (locale === "en") return box?.name_en ?? box?.name_zh_cn ?? "";
  if (locale === "ja") return box?.name_ja ?? box?.name_en ?? box?.name_zh_cn ?? "";
  return box?.name_zh_cn ?? box?.name_en ?? "";
}

function boxPoolLabel(box, locale) {
  const key = locale === "en" ? "pool_label_en" : locale === "ja" ? "pool_label_ja" : "pool_label_zh_cn";
  return box?.[key] ?? box?.pool_label_zh_cn ?? "";
}

export function firstTargetStudent(data, state) {
  const plan = state.students?.find((item) => String(item.studentId) === String(state.mainTargetStudentId)) ?? state.students?.[0];
  return plan ? data.studentById.get(String(plan.studentId)) : null;
}

function studentGiftValues(student) {
  return Object.fromEntries((student?.gift_values ?? []).map((item) => [String(item.gift_id), item.relationship_exp]));
}

function expectationForBox(box, student) {
  if (!student) return null;
  const result = calculateGiftBoxExpectedExp(box, studentGiftValues(student), { policy: "best_for_student" });
  return result.status === "ready" ? result.expectedExp : null;
}

function summaryValue(summary, key) {
  return summary?.[key] ?? { current: 0, incoming: 0, reserved: 0, remaining: 0 };
}

function noticeText(locale, notice) {
  if (!notice) return "";
  if (typeof notice === "string") return t(locale, notice);
  return t(locale, notice.key, ...(notice.args ?? []));
}

function quantityColumns(value, locale, label = "") {
  const normalized = value ?? { current: 0, incoming: 0, reserved: 0, remaining: 0 };
  const accessibleLabel = label ? `${label} · ${t(locale, "inventoryRemaining")} ${formatSmartQuantity(normalized.remaining, locale)}` : `${t(locale, "inventoryRemaining")} ${formatSmartQuantity(normalized.remaining, locale)}`;
  return `<details class="inventory-quantity-details"><summary aria-label="${escapeHtml(accessibleLabel)}"><span>${escapeHtml(t(locale, "inventoryRemaining"))}</span><b>${formatSmartQuantity(normalized.remaining, locale)}</b></summary><div class="inventory-quantity-columns"><span><small>${escapeHtml(t(locale, "inventoryCurrent"))}</small><b>${formatSmartQuantity(normalized.current, locale)}</b></span><span><small>${escapeHtml(t(locale, "inventoryIncoming"))}</small><b>${formatSmartQuantity(normalized.incoming, locale)}</b></span><span><small>${escapeHtml(t(locale, "inventoryReserved"))}</small><b>${formatSmartQuantity(normalized.reserved, locale)}</b></span></div></details>`;
}

function renderStockResources({ data, state, summary, locale }) {
  const ids = ["manufacturing_stone", "synthesis_stone_gold"];
  const itemIds = { manufacturing_stone: 3, synthesis_stone_gold: 82 };
  return `<section class="inventory-section" aria-labelledby="inventory-stock-title"><div class="section-heading compact"><h2 id="inventory-stock-title">${escapeHtml(t(locale, "inventoryStockTitle"))}</h2></div><div class="inventory-resource-list">${ids.map((id) => {
    const value = summary.stocks[id];
    return `<article class="inventory-resource-card"><div class="inventory-resource-icon">${itemIds[id] ? itemImage(itemIds[id], data.assetManifest) : "<span class=\"icon-frame inventory-resource-glyph\" aria-hidden=\"true\">✧</span>"}</div><div class="inventory-resource-copy"><strong>${escapeHtml(t(locale, "inventoryStockName", id))}</strong></div><label class="inventory-current-input"><input type="number" min="0" step="1" inputmode="numeric" data-stock-resource="${escapeHtml(id)}" value="${value.current || ""}" placeholder="0" aria-label="${escapeHtml(`${t(locale, "inventoryCurrent")} ${t(locale, "inventoryStockName", id)}`)}"></label>${quantityColumns(value, locale, t(locale, "inventoryStockName", id))}</article>`;
  }).join("")}</div></section>`;
}

export function mappedPreview(mapped, locale) {
  if (!mapped) return `<span class="inventory-preview-unavailable">${escapeHtml(t(locale, "inventoryPeriodicMissing"))}</span>`;
  const parts = [];
  for (const [id, value] of Object.entries(mapped.stockResources ?? {})) if (value > 0) parts.push(`+${formatSmartQuantity(value, locale)} ${t(locale, "inventoryStockName", id)}`);
  for (const [id, value] of Object.entries(mapped.giftBoxes ?? {})) if (value > 0) parts.push(`+${formatSmartQuantity(value, locale)} ${t(locale, "inventoryBoxName", id)}`);
  for (const [id, value] of Object.entries(mapped.equivalentGiftPools ?? {})) if (value > 0) parts.push(`+${formatSmartQuantity(value, locale)} ${t(locale, "inventoryPoolName", id)}`);
  for (const [id, value] of Object.entries(mapped.relationshipExp ?? {})) if (value > 0) parts.push(`+${formatExp(value, locale)} ${t(locale, "inventoryRelationshipExp", id)}`);
  if (!parts.length) return `<span class="inventory-preview-unavailable">${escapeHtml(t(locale, "inventoryPeriodicMissing"))}</span>`;
  return `<div class="inventory-preview-items">${parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("")}</div>`;
}

function periodicInputText(resource, locale) {
  if (resource.amount === null || resource.amount === undefined || resource.amount === "") return t(locale, "inventoryPeriodicNotSet");
  const value = formatSmartQuantity(resource.amount, locale);
  if (resource.input_kind === "floor") return t(locale, "inventoryPeriodicFloor", formatSmartQuantity(resource.amount, locale));
  if (resource.input_kind === "daily_count") return t(locale, "inventoryPeriodicDailyCount", value);
  return t(locale, "inventoryPeriodicBase", formatSmartQuantity(resource.amount, locale));
}

function periodicTarget({ data, state }) {
  const target = firstTargetStudent(data, state);
  if (!target) return null;
  const release = calculateRelationshipSourceForecast({
    state,
    studentId: target.student_id,
    cnProgress: state?.cnProgress,
    timeline: data?.releaseTimeline ?? [],
    periodDays: Number(state?.resourceForecastDays ?? state?.periodDays ?? 30),
  });
  return { student: target, release };
}

function periodicTargetPreview(mapped, resource, target, locale) {
  if (resource?.unit !== "relationship_exp") return mappedPreview(mapped, locale);
  if (!target) return `<span>${escapeHtml(t(locale, "resourceTargetNotSelected"))}</span>`;
  if (target.release?.giftOnly) return `<span>${escapeHtml(t(locale, "resourceTargetExcluded"))}</span>`;
  return mappedPreview(mapped, locale);
}

export function renderPeriodicResources({ data, state, locale }) {
  const rewardSnapshot = data.unlimitedAssaultRewards;
  const previewDays = Number.isFinite(Number(state.resourceForecastDays)) ? Math.max(0, Math.floor(Number(state.resourceForecastDays))) : Number(state.periodDays ?? 30);
  const target = periodicTarget({ data, state });
  const targetName = target ? localizedName(target.student, "student", locale) : t(locale, "resourceTargetNotSelected");
  const targetSummary = target
    ? t(locale, target.release?.giftOnly ? "resourceTargetGiftOnly" : "resourceTargetReleased")
    : t(locale, "resourceTargetChooseHint");
  return `<section class="inventory-section" aria-labelledby="inventory-periodic-title"><div class="section-heading compact"><div><h2 id="inventory-periodic-title">${escapeHtml(t(locale, "inventoryPeriodicTitle"))}</h2><span class="inventory-section-caption">${escapeHtml(t(locale, "resourceTargetTitle", targetName))} · ${escapeHtml(targetSummary)}</span></div><span class="inventory-periodic-period">${escapeHtml(t(locale, "inventoryPeriodicPeriod", previewDays))}</span></div><details class="inventory-details"><summary>${escapeHtml(t(locale, "inventoryShowPeriodic"))} · ${formatSmartQuantity(state.resources.length, locale)}</summary><div class="inventory-periodic-list"><div class="inventory-periodic-list-head"><span>${escapeHtml(t(locale, "inventoryPeriodicResource"))}</span><span>${escapeHtml(t(locale, "inventoryPeriodicPreview"))}</span><span>${escapeHtml(t(locale, "inventoryPeriodicTargetPreview"))}</span><span class="sr-only">${escapeHtml(t(locale, "inventoryPeriodicActions"))}</span></div>${state.resources.map((resource) => {
    const mapped = mapPeriodicResource(resource, { periodDays: previewDays, rewardSnapshot, resources: state.resources });
    const postingKey = `${resource.id}:${previewDays}`;
    const active = state.resourcePostingHistory.find((item) => item.active !== false && item.postingKey === postingKey);
    return `<article class="inventory-periodic-row ${active ? "is-posted" : ""}"><div class="inventory-periodic-copy"><div class="inventory-periodic-title"><strong>${escapeHtml(t(locale, "inventoryPeriodicName", resource.id))}</strong><span>${escapeHtml(t(locale, "resourceCadence", resource.cadence))}</span></div><small>${escapeHtml(periodicInputText(resource, locale))}</small></div><div class="inventory-periodic-preview">${mappedPreview(mapped, locale)}</div><div class="inventory-periodic-preview inventory-periodic-target-preview">${periodicTargetPreview(mapped, resource, target, locale)}</div><div class="inventory-periodic-actions">${active ? `<span class="inventory-posted-badge">${escapeHtml(t(locale, "inventoryPosted"))}</span><button type="button" class="text-button" data-undo-posting="${escapeHtml(active.id)}">${escapeHtml(t(locale, "inventoryUndoPost"))}</button>` : `<button type="button" class="secondary-button" data-post-resource="${escapeHtml(resource.id)}" ${mapped ? "" : "disabled"}>${escapeHtml(t(locale, "inventoryPostResource"))}</button>`}</div></article>`;
  }).join("")}</div></details></section>`;
}

function renderGiftBoxes({ data, state, summary, locale, localization }) {
  const boxes = data.giftBoxes ?? [];
  const target = firstTargetStudent(data, state);
  const total = boxes.reduce((sum, box) => sum + Number(summaryValue(summary.giftBoxes, box.id).current || 0), 0);
  return `<section class="inventory-section" aria-labelledby="inventory-box-title"><div class="section-heading compact"><div><h2 id="inventory-box-title">${escapeHtml(t(locale, "inventoryBoxTitle"))}</h2><span class="inventory-section-caption">${escapeHtml(t(locale, "inventoryShowBoxes"))} · ${formatSmartQuantity(total, locale)}</span></div></div><div class="inventory-box-grid">${boxes.map((box) => {
    const value = summaryValue(summary.giftBoxes, box.id);
    const expected = expectationForBox(box, target);
    const targetName = target ? localizedName(target, "student", locale, localization) : "";
    return `<article class="inventory-box-card"><div class="inventory-box-head"><div class="inventory-box-identity">${itemImage(box.id, data.assetManifest, "inventory-box-image")}<strong>${escapeHtml(boxName(box, locale))}</strong></div><span>${escapeHtml(boxPoolLabel(box, locale))}</span></div><label class="inventory-current-input"><span>${escapeHtml(t(locale, "inventoryCurrent"))}</span><input type="number" min="0" step="1" inputmode="numeric" data-gift-box-count="${escapeHtml(box.id)}" value="${value.current || ""}" placeholder="0" aria-label="${escapeHtml(`${t(locale, "inventoryCurrent")} ${boxName(box, locale)}`)}"></label>${quantityColumns(value, locale, boxName(box, locale))}<div class="inventory-box-expectation">${expected === null ? escapeHtml(t(locale, "inventoryNoTarget")) : `${escapeHtml(t(locale, "inventoryTargetExpectation", targetName))} <b>${formatExp(expected, locale)}</b>`}<small>${escapeHtml(t(locale, "inventoryExpectedOnly"))}</small></div></article>`;
  }).join("")}</div></section>`;
}

function renderEquivalentPools({ data, state, summary, locale, localization }) {
  const randomGold = summary.equivalentGiftPools["random-gold"] ?? { current: 0, incoming: 0, reserved: 0, remaining: 0 };
  const box = data.giftBoxes?.find((item) => String(item.id) === "100000");
  const target = firstTargetStudent(data, state);
  const expected = expectationForBox(box, target);
  const targetName = target ? localizedName(target, "student", locale, localization) : "";
    return `<section class="inventory-section" aria-labelledby="inventory-pool-title"><div class="section-heading compact"><h2 id="inventory-pool-title">${escapeHtml(t(locale, "inventoryPoolTitle"))}</h2></div><details class="inventory-details"><summary>${escapeHtml(t(locale, "inventoryShowPools"))} · ${formatSmartQuantity(randomGold.current, locale)}</summary><article class="inventory-pool-card"><div class="inventory-pool-copy"><div class="inventory-pool-heading">${itemImage("100000", data.assetManifest, "inventory-box-image")}<strong>${escapeHtml(t(locale, "inventoryPoolName", "random-gold"))}</strong></div><small>${escapeHtml(t(locale, "inventoryActivityPoolHint"))}</small></div><label class="inventory-current-input"><span>${escapeHtml(t(locale, "inventoryCurrent"))}</span><input type="number" min="0" step="1" inputmode="numeric" data-equivalent-pool="random-gold" value="${randomGold.current || ""}" placeholder="0" aria-label="${escapeHtml(`${t(locale, "inventoryCurrent")} ${t(locale, "inventoryPoolName", "random-gold")}`)}"></label>${quantityColumns(randomGold, locale, t(locale, "inventoryPoolName", "random-gold"))}<div class="inventory-box-expectation">${expected === null ? escapeHtml(t(locale, "inventoryNoTarget")) : `${escapeHtml(t(locale, "inventoryTargetExpectation", targetName))} <b>${formatExp(expected, locale)}</b>`}<small>${escapeHtml(t(locale, "inventoryExpectedOnly"))}</small></div></article></details></section>`;
}

function renderGiftRows({ data, state, summary, locale, localization, filters }) {
  const query = String(filters?.query ?? "").trim().toLocaleLowerCase();
  const rarity = filters?.rarity ?? "all";
  const exp = filters?.exp ?? "all";
  const onlyOwned = filters?.onlyOwned === true;
  const gifts = data.gifts.filter((gift) => {
    const name = localizedName(gift, "gift", locale, localization).toLocaleLowerCase();
    const owned = Number(summaryValue(summary.gifts, gift.id).current) > 0;
    return (!query || name.includes(query) || String(gift.id).includes(query)) && (rarity === "all" || gift.rarity === rarity) && (exp === "all" || String(gift.base_exp) === exp) && (!onlyOwned || owned);
  });
  return `<div class="inventory-gift-list">${gifts.length ? gifts.map((gift) => {
    const value = summaryValue(summary.gifts, gift.id);
    const giftName = localizedName(gift, "gift", locale, localization);
    return `<article class="inventory-gift-row"><div class="inventory-gift-identity">${giftImage(gift, data.assetManifest, locale, localization)}<div><strong>${escapeHtml(giftName)}</strong><small>${escapeHtml(gift.rarity)} · ${formatInteger(gift.base_exp, locale)} ${escapeHtml(t(locale, "inventoryGiftExp"))}</small></div></div><label class="inventory-current-input"><span>${escapeHtml(t(locale, "inventoryCurrent"))}</span><input type="number" min="0" step="1" inputmode="numeric" data-inventory-gift="${escapeHtml(gift.id)}" value="${value.current || ""}" placeholder="0" aria-label="${escapeHtml(`${t(locale, "inventoryCurrent")} ${giftName}`)}"></label>${quantityColumns(value, locale, giftName)}</article>`;
  }).join("") : `<p class="inventory-empty">${escapeHtml(t(locale, "inventoryNoFilteredGifts"))}</p>`}</div>`;
}

function renderGifts({ data, state, summary, locale, localization, filters }) {
  const model = giftFilterModel({ data, summary, filters, locale });
  return renderGiftSection({ data, state, summary, locale, localization, filters, model });
}

function giftFilterModel({ data, summary, filters, locale }) {
  const options = [...new Set(data.gifts.map((gift) => gift.base_exp))].sort((a, b) => a - b);
  const hasFilters = Boolean(filters?.query || filters?.rarity !== "all" || filters?.exp !== "all" || filters?.onlyOwned === false);
  const ownedCount = data.gifts.filter((gift) => Number(summaryValue(summary.gifts, gift.id).current) > 0).length;
  const effectiveFilters = ownedCount === 0
    ? { ...filters, onlyOwned: false }
    : hasFilters ? filters : { ...filters, onlyOwned: true };
  const summaryText = hasFilters ? t(locale, "inventoryShowAllGifts") : ownedCount ? `${t(locale, "inventoryOnlyOwned")} · ${ownedCount}/${data.gifts.length}` : t(locale, "inventoryNoOwnedGifts");
  const detailsOpen = hasFilters || ownedCount > 0;
  return { options, ownedCount, effectiveFilters, summaryText, detailsOpen };
}

function renderGiftSection({ data, state, summary, locale, localization, filters, model }) {
  const showAllAction = model.ownedCount === 0 && filters?.onlyOwned !== false && !filters?.query && filters?.rarity === "all" && filters?.exp === "all"
    ? `<button type="button" class="secondary-button inventory-show-all" data-inventory-show-all>${escapeHtml(t(locale, "inventoryShowAllGifts"))}</button>`
    : "";
  const emptyHint = model.ownedCount === 0 && !model.detailsOpen ? `<p class="inventory-empty-hint">${escapeHtml(t(locale, "inventoryNoOwnedGiftsHint"))}</p>` : "";
  return `<section class="inventory-section inventory-gifts-main" aria-labelledby="inventory-gifts-title"><div class="section-heading compact"><div><h2 id="inventory-gifts-title">${escapeHtml(t(locale, "inventoryGiftsTitle"))}</h2><span class="inventory-section-caption">${escapeHtml(t(locale, "inventoryGiftsCaption"))}</span></div><span class="inventory-section-count">${model.ownedCount}/${data.gifts.length}</span></div><div class="inventory-filters"><label><span>${escapeHtml(t(locale, "inventorySearch"))}</span><input type="search" data-inventory-filter="query" value="${escapeHtml(filters?.query ?? "")}" placeholder="${escapeHtml(t(locale, "inventorySearchPlaceholder"))}"></label><label><span>${escapeHtml(t(locale, "inventoryRarity"))}</span><select data-inventory-filter="rarity"><option value="all" ${filters?.rarity === "all" ? "selected" : ""}>${escapeHtml(t(locale, "inventoryAll"))}</option><option value="SR" ${filters?.rarity === "SR" ? "selected" : ""}>SR</option><option value="SSR" ${filters?.rarity === "SSR" ? "selected" : ""}>SSR</option></select></label><label><span>${escapeHtml(t(locale, "inventoryGiftExpFilter"))}</span><select data-inventory-filter="exp"><option value="all" ${String(filters?.exp) === "all" ? "selected" : ""}>${escapeHtml(t(locale, "inventoryAll"))}</option>${model.options.map((value) => `<option value="${value}" ${String(value) === String(filters?.exp) ? "selected" : ""}>${formatInteger(value, locale)}</option>`).join("")}</select></label><label class="inventory-owned-toggle"><input type="checkbox" data-inventory-filter="onlyOwned" ${model.effectiveFilters?.onlyOwned ? "checked" : ""}><span>${escapeHtml(t(locale, "inventoryOnlyOwned"))}</span></label></div>${emptyHint}${showAllAction}<details class="inventory-details" ${model.detailsOpen ? "open" : ""}><summary>${escapeHtml(model.summaryText)}</summary>${renderGiftRows({ data, state, summary, locale, localization, filters: model.effectiveFilters })}</details></section>`;
}

export function refreshInventoryGiftRows({ container, data, state, locale, localization, filters }) {
  const section = container.querySelector(".inventory-gifts-main");
  const list = section?.querySelector(".inventory-gift-list");
  const details = section?.querySelector(".inventory-details");
  const summaryNode = details?.querySelector(":scope > summary");
  if (!section || !list || !details || !summaryNode) return;
  const summary = calculateInventorySummary(state);
  const model = giftFilterModel({ data, summary, filters, locale });
  details.open = model.detailsOpen;
  summaryNode.textContent = model.summaryText;
  list.outerHTML = renderGiftRows({ data, state, summary, locale, localization, filters: model.effectiveFilters });
  const nextList = section.querySelector(".inventory-gift-list");
  if (nextList) wireInventoryImageFallbacks(nextList);
}

function renderSynthesis({ data, state, locale, localization }) {
  const goldGifts = data.gifts.filter((gift) => gift.rarity === "SR");
  const options = goldGifts.map((gift) => `<option value="${gift.id}">${escapeHtml(localizedName(gift, "gift", locale, localization))} · ${formatSmartQuantity(state.inventory[String(gift.id)] ?? 0, locale)}</option>`).join("");
  return `<section class="inventory-section inventory-synthesis" aria-labelledby="inventory-synthesis-title"><div class="section-heading compact"><h2 id="inventory-synthesis-title">${escapeHtml(t(locale, "inventorySynthesisTitle"))}</h2></div><details class="inventory-details"><summary>${escapeHtml(t(locale, "inventoryShowSynthesis"))}</summary><form id="inventory-synthesis-form" class="inventory-synthesis-form"><label><span>${escapeHtml(t(locale, "inventoryFirstGift"))}</span><select name="firstGiftId" required>${options}</select></label><span class="inventory-plus" aria-hidden="true">+</span><label><span>${escapeHtml(t(locale, "inventorySecondGift"))}</span><select name="secondGiftId" required>${options}</select></label><span class="inventory-synthesis-cost">${escapeHtml(t(locale, "inventorySynthesisCost", formatSmartQuantity(state.stockResources.synthesis_stone_gold, locale)))}</span><button type="submit" class="primary-button">${escapeHtml(t(locale, "inventorySynthesize"))}</button></form></details></section>`;
}

function renderReservationPanel({ data, state, summary, locale, localization }) {
  const entries = Object.entries(state.giftReservations ?? {}).filter(([, quantity]) => quantity > 0);
  if (!entries.length) return "";
  return `<details class="inventory-reservation-panel"><summary><span>${escapeHtml(t(locale, "inventoryReservationTitle"))}</span><b>${escapeHtml(t(locale, "inventoryReservationCount", entries.length))}</b></summary><div class="inventory-reservation-content" aria-labelledby="inventory-reservation-title"><div><p class="eyebrow">${escapeHtml(t(locale, "inventoryReservationKicker"))}</p><h2 id="inventory-reservation-title">${escapeHtml(t(locale, "inventoryReservationTitle"))}</h2><p>${escapeHtml(t(locale, "inventoryReservationHint"))}</p></div><div class="inventory-reservation-list">${entries.map(([giftId, quantity]) => { const gift = data.giftById?.get(String(giftId)); const giftLabel = gift ? localizedName(gift, "gift", locale, localization) : t(locale, "unknown"); return `<span>${escapeHtml(giftLabel)} ×${formatSmartQuantity(quantity, locale)} · ${escapeHtml(t(locale, "inventoryRemaining"))} ${formatSmartQuantity(summary.gifts[giftId]?.remaining ?? 0, locale)}</span>`; }).join("")}</div><div class="inventory-reservation-actions"><button type="button" class="secondary-button" data-release-reservations>${escapeHtml(t(locale, "inventoryReleaseReservation"))}</button><button type="button" class="primary-button" data-confirm-reservations>${escapeHtml(t(locale, "inventoryConfirmReservation"))}</button></div></div></details>`;
}

export function renderInventoryWorkspace({ data, state, locale, localization, filters = {}, notice = "" }) {
  const inventoryHint = t(locale, "inventoryHint");
  const summary = calculateInventorySummary(state);
  const message = noticeText(locale, notice);
  const currentGiftTotal = Object.values(summary.gifts ?? {}).reduce((sum, value) => sum + Number(value.current || 0), 0);
  const remainingGiftTotal = Object.values(summary.gifts ?? {}).reduce((sum, value) => sum + Number(value.remaining || 0), 0);
  const transferPanel = `<div class="inventory-heading-actions" aria-label="${escapeHtml(t(locale, "inventoryTransferTitle"))}"><button type="button" class="secondary-button" data-export-inventory>${escapeHtml(t(locale, "inventoryExport"))}</button><button type="button" class="primary-button" data-import-inventory>${escapeHtml(t(locale, "inventoryImport"))}</button><input id="inventory-import-file" type="file" accept="application/json,.json" hidden></div>`;
  const secondaryTools = `${renderPeriodicResources({ data, state, locale })}${renderEquivalentPools({ data, state, summary, locale, localization })}${renderSynthesis({ data, state, locale, localization })}`;
  return `<section class="inventory-workspace" aria-labelledby="inventory-title"><div class="inventory-page-heading"><div><span class="workspace-kicker">${escapeHtml(t(locale, "workbenchInventory"))}</span><h2 id="inventory-title">${escapeHtml(t(locale, "inventoryManagementTitle"))}</h2>${inventoryHint ? `<p>${escapeHtml(inventoryHint)}</p>` : ""}</div>${transferPanel}</div><div class="inventory-overview"><article><span>${escapeHtml(t(locale, "inventoryCurrent"))}</span><strong>${formatSmartQuantity(currentGiftTotal, locale)}</strong><small>${escapeHtml(t(locale, "inventoryGiftsTitle"))}</small></article><article><span>${escapeHtml(t(locale, "inventoryRemaining"))}</span><strong>${formatSmartQuantity(remainingGiftTotal, locale)}</strong><small>${escapeHtml(t(locale, "inventoryGiftsTitle"))}</small></article></div>${message ? `<div class="inventory-notice" role="status">${escapeHtml(message)}</div>` : ""}${renderReservationPanel({ data, state, summary, locale, localization })}${renderStockResources({ data, state, summary, locale })}${renderGiftBoxes({ data, state, summary, locale, localization })}${renderGifts({ data, state, summary, locale, localization, filters })}<details class="inventory-more-details"><summary>${escapeHtml(t(locale, "inventoryMoreTitle"))}</summary><div class="inventory-more-content">${secondaryTools}</div></details></section>`;
}

export function wireInventoryImageFallbacks(container) {
  container.querySelectorAll("img[data-fallback]").forEach((image) => image.addEventListener("error", () => {
    if (image.dataset.remoteTried !== "true" && image.dataset.fallback) {
      image.dataset.remoteTried = "true";
      image.src = image.dataset.fallback;
      return;
    }
    image.hidden = true;
    image.closest(".inventory-gift-image")?.classList.add("is-broken");
  }));
}
