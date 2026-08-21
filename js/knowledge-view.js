import { localeTag, localizedName, text as t } from "./i18n.js?v=dashboard-20260819-schale-alchemy-workshop-agent-chat-v111&ui=v113";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value, locale, fallback = "—") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 0 }).format(numeric);
}

function thresholdsFrom(data) {
  return data?.snapshots?.thresholds ?? data?.thresholds ?? {};
}

function levelRows(thresholds) {
  return Array.isArray(thresholds?.levels)
    ? [...thresholds.levels].filter((row) => Number.isFinite(Number(row?.level))).sort((a, b) => Number(a.level) - Number(b.level))
    : [];
}

function representativeGift(data, kind) {
  const gifts = Array.isArray(data?.gifts) ? data.gifts : [];
  const desiredExp = kind === "premium" ? 60 : 20;
  return gifts.find((gift) => Number(gift.base_exp) === desiredExp)
    ?? gifts.find((gift) => kind === "premium" ? gift.rarity === "SSR" : gift.rarity === "SR")
    ?? { id: kind === "premium" ? 5100 : 5000, name_zh_cn: kind === "premium" ? "金色礼物" : "普通礼物" };
}

function giftImage(gift, data, locale) {
  const source = data?.assetManifest?.entries?.[`gift:${gift.id}`];
  const name = localizedName(gift, "gift", locale, data?.localization);
  return `<img class="knowledge-gift-image" src="${escapeHtml(source?.local ?? `./assets/gifts/${gift.id}.webp`)}" data-fallback="${escapeHtml(source?.remote ?? "")}" alt="${escapeHtml(name)}" loading="lazy">`;
}

function renderQuickAnswers(rows, thresholds, locale) {
  const cap = Number(thresholds?.relationship_level_cap) || 100;
  const capRow = rows.find((row) => Number(row.level) === cap) ?? rows.at(-1);
  const previousRow = rows.find((row) => Number(row.level) === cap - 1);
  const finalStep = previousRow && capRow
    ? Number(capRow.cumulative_exp_to_reach_level) - Number(previousRow.cumulative_exp_to_reach_level)
    : capRow?.next_level_exp;
  const premiumHuge = thresholds?.gift_exp?.premium?.["特大"] ?? thresholds?.gift_exp_bilingual?.[locale === "en" ? "en" : "zh_cn"]?.premium?.Huge;
  return `<section class="knowledge-panel knowledge-quick-answers" aria-labelledby="knowledge-quick-title">
    <div class="knowledge-section-heading"><span>${escapeHtml(t(locale, "knowledgeQuickEyebrow"))}</span><h2 id="knowledge-quick-title">${escapeHtml(t(locale, "knowledgeQuickTitle"))}</h2></div>
    <div class="knowledge-answer-grid">
      <article class="knowledge-answer-card is-total"><span>${escapeHtml(t(locale, "knowledgeQuickTotalLabel", cap))}</span><strong>${escapeHtml(number(capRow?.cumulative_exp_to_reach_level, locale))}</strong><small>${escapeHtml(t(locale, "knowledgeCumulative"))}</small></article>
      <article class="knowledge-answer-card is-final"><span>${escapeHtml(t(locale, "knowledgeQuickFinalLabel", cap - 1, cap))}</span><strong>${escapeHtml(number(finalStep, locale))}</strong><small>${escapeHtml(t(locale, "knowledgeQuickFinalHint"))}</small></article>
      <article class="knowledge-answer-card is-gift"><span>${escapeHtml(t(locale, "knowledgeQuickGiftLabel"))}</span><strong>${escapeHtml(number(premiumHuge, locale))}</strong><small>${escapeHtml(t(locale, "knowledgeQuickGiftHint"))}</small></article>
    </div>
  </section>`;
}

function renderGiftTable(values, title, tone, locale, data, kind) {
  const tiers = [
    ["small", values?.["小"] ?? values?.Small],
    ["medium", values?.["中"] ?? values?.Medium],
    ["large", values?.["大"] ?? values?.Large],
    ["huge", values?.["特大"] ?? values?.Huge],
  ];
  const gift = representativeGift(data, kind);
  return `<article class="knowledge-gift-card ${tone}" data-knowledge-gift="${escapeHtml(kind)}">
    <div class="knowledge-gift-card-head">${giftImage(gift, data, locale)}<div><h3>${escapeHtml(title)}</h3><small>${escapeHtml(t(locale, kind === "premium" ? "knowledgePremiumGiftHint" : "knowledgeNormalGiftHint"))}</small></div></div>
    <div class="knowledge-gift-values">${tiers.map(([tier, value]) => `<div><span>${escapeHtml(t(locale, `knowledgeTier${tier[0].toUpperCase()}${tier.slice(1)}`))}</span><strong>${value == null ? "—" : escapeHtml(number(value, locale))}</strong></div>`).join("")}</div>
    <small class="knowledge-exp-unit">${escapeHtml(t(locale, "knowledgeExpUnit"))}</small>
  </article>`;
}

function renderLevelTable(rows, thresholds, locale) {
  const cap = Number(thresholds?.relationship_level_cap) || 100;
  const body = rows.map((row) => `<tr>
    <th scope="row">${escapeHtml(number(row.level, locale))}</th>
    <td>${Number(row.level) >= cap || row.can_advance_in_simulator === false ? "—" : escapeHtml(number(row.next_level_exp, locale))}</td>
    <td>${escapeHtml(number(row.cumulative_exp_to_reach_level, locale))}</td>
  </tr>`).join("");
  return `<details class="knowledge-level-details knowledge-panel">
    <summary>${escapeHtml(t(locale, "knowledgeFullTable"))}<span>${escapeHtml(t(locale, "knowledgeFullTableHint", rows.length, cap))}</span></summary>
    <div class="knowledge-table-wrap"><table class="knowledge-level-table"><thead><tr><th scope="col">${escapeHtml(t(locale, "knowledgeLevel"))}</th><th scope="col">${escapeHtml(t(locale, "knowledgeNextLevel"))}</th><th scope="col">${escapeHtml(t(locale, "knowledgeCumulative"))}</th></tr></thead><tbody>${body}</tbody></table></div>
  </details>`;
}

function renderSources(thresholds, locale) {
  const other = thresholds?.other_exp ?? {};
  const cafe = other.cafe_touch;
  const scheduleMin = other.schedule_min;
  const scheduleMax = other.schedule_max;
  const multiplier = other.schedule_bonus_multiplier;
  return `<section class="knowledge-panel knowledge-sources"><div class="knowledge-section-heading"><span>${escapeHtml(t(locale, "knowledgeSourcesEyebrow"))}</span><h2>${escapeHtml(t(locale, "knowledgeSourcesTitle"))}</h2></div><div class="knowledge-source-list">
    <article class="knowledge-source-row"><span class="knowledge-source-mark">☕</span><div><strong>${escapeHtml(t(locale, "knowledgeCafe"))}</strong><small>${escapeHtml(t(locale, "knowledgeCafeValue", number(cafe, locale)))}</small></div></article>
    <article class="knowledge-source-row"><span class="knowledge-source-mark">▣</span><div><strong>${escapeHtml(t(locale, "knowledgeSchedule"))}</strong><small>${escapeHtml(t(locale, "knowledgeScheduleValue", number(scheduleMin, locale), number(scheduleMax, locale), number(multiplier, locale)))}</small></div></article>
  </div><div class="knowledge-rule-list"><p><span class="knowledge-rule-dot is-blue"></span>${escapeHtml(t(locale, "knowledgeReleasedRule"))}</p><p><span class="knowledge-rule-dot is-rose"></span>${escapeHtml(t(locale, "knowledgeUnreleasedRule"))}</p></div></section>`;
}

export function renderKnowledgeWorkspace({ data = {}, locale = "zh_cn" } = {}) {
  const thresholds = thresholdsFrom(data);
  const rows = levelRows(thresholds);
  const cap = Number(thresholds.relationship_level_cap) || 100;
  const normal = thresholds.gift_exp?.normal ?? {};
  const premium = thresholds.gift_exp?.premium ?? {};
  const retrievedAt = thresholds.source?.retrieved_at?.slice?.(0, 10) ?? "—";
  return `<section class="knowledge-workspace">
    <header class="knowledge-hero"><div><span class="knowledge-eyebrow">${escapeHtml(t(locale, "knowledgeEyebrow"))}</span><h2>${escapeHtml(t(locale, "knowledgeTitle"))}</h2><p>${escapeHtml(t(locale, "knowledgeCaption"))}</p></div><span class="knowledge-hero-tag">${escapeHtml(t(locale, "knowledgeHeroTag", cap))}</span></header>
    ${renderQuickAnswers(rows, thresholds, locale)}
    <section class="knowledge-panel knowledge-gifts"><div class="knowledge-section-heading"><span>${escapeHtml(t(locale, "knowledgeGiftsEyebrow"))}</span><h2>${escapeHtml(t(locale, "knowledgeGiftsTitle"))}</h2></div><div class="knowledge-gift-grid">${renderGiftTable(normal, t(locale, "knowledgeNormalGift"), "is-normal", locale, data, "normal")}${renderGiftTable(premium, t(locale, "knowledgeGoldGift"), "is-gold", locale, data, "premium")}</div></section>
    ${renderSources(thresholds, locale)}
    ${renderLevelTable(rows, thresholds, locale)}
    <details class="knowledge-notes knowledge-panel"><summary>${escapeHtml(t(locale, "knowledgeNotes"))}<span>${escapeHtml(t(locale, "knowledgeSnapshotDate", retrievedAt))}</span></summary><div><p>${escapeHtml(t(locale, "knowledgeNoteLevelCap", cap))}</p><p>${escapeHtml(t(locale, "knowledgeNoteSource"))}</p></div></details>
  </section>`;
}
