import { boostedGiftGroups, giftValuesForFilter } from "./dashboard-state.js?v=dashboard-20260824-synthesis-accounting-v112";
import {
  localizedName,
  localizedReactionLabel,
  localeTag,
  text as t,
} from "./i18n.js?v=dashboard-20260824-synthesis-accounting-v112";

const STAGES = ["1", "2", "3"];

const GIFT_FILTERS = [
  { id: "preferred", label: "对应喜欢的礼物" },
  { id: "exp-240", label: "240 EXP" },
  { id: "exp-180", label: "180 EXP" },
  { id: "exp-120", label: "120 EXP" },
  { id: "exp-80", label: "80 EXP" },
  { id: "exp-60", label: "60 EXP" },
  { id: "exp-40", label: "40 EXP" },
  { id: "exp-20", label: "20 EXP" },
  { id: "all", label: "全部 52" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatExp(value, locale = "zh_cn") {
  return Number(value ?? 0).toLocaleString(localeTag(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatQuantity(value, locale = "zh_cn") {
  const number = Number(value ?? 0);
  return Number.isInteger(number)
    ? formatInteger(number, locale)
    : number.toLocaleString(localeTag(locale), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
}

export function formatInteger(value, locale = "zh_cn") {
  return Number(value ?? 0).toLocaleString(localeTag(locale), {
    maximumFractionDigits: 0,
  });
}

export function formatSmartQuantity(value, locale = "zh_cn") {
  const number = Number(value ?? 0);
  return Number.isInteger(number) ? formatInteger(number, locale) : formatQuantity(number, locale);
}

export function formatPercent(value, locale = "zh_cn") {
  return `${(Number(value ?? 0) * 100).toLocaleString(localeTag(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function probabilityOfNodeAppearing(probability, optionCount = 5) {
  const p = Math.min(1, Math.max(0, Number(probability) || 0));
  const n = Math.max(0, Math.floor(Number(optionCount) || 0));
  return 1 - Math.pow(1 - p, n);
}

function getImageSource(manifest, key, fallbackLocal, fallbackRemote) {
  const record = manifest?.entries?.[key];
  return {
    local: record?.local ?? fallbackLocal,
    remote: record?.remote ?? fallbackRemote,
  };
}

function imageMarkup({ manifest, key, local, remote, alt, className = "", loading = "lazy" }) {
  const source = getImageSource(manifest, key, local, remote);
  return `<div class="icon-frame image-frame ${className}" data-image-frame>
    <img src="${escapeHtml(source.local)}" data-fallback="${escapeHtml(source.remote)}" alt="${escapeHtml(alt)}" loading="${escapeHtml(loading)}" />
    <span class="image-fallback" aria-hidden="true">${escapeHtml(String(alt).slice(0, 1))}</span>
  </div>`;
}

function studentImage(student, manifest, locale, localization, className = "student-avatar") {
  return imageMarkup({
    manifest,
    key: `student:${student.student_id}`,
    local: `./assets/students/${student.student_id}.webp`,
    remote: `https://schaledb.com/images/student/icon/${student.student_id}.webp`,
    alt: localizedName(student, "student", locale, localization),
    className,
  });
}

function giftImage(gift, manifest, locale, localization) {
  const rarity = String(gift?.rarity ?? "").toLowerCase();
  return imageMarkup({
    manifest,
    key: `gift:${gift.id}`,
    local: `./assets/gifts/${gift.id}.webp`,
    remote: `https://schaledb.com/images/item/icon/${gift.icon}.webp`,
    alt: localizedName(gift, "gift", locale, localization),
    className: `gift-image ${rarity ? `gift-rarity-${rarity}` : ""}`.trim(),
  });
}

function studentPortraitImage(student, manifest, locale, localization) {
  return imageMarkup({
    manifest,
    key: `student-portrait:${student.student_id}`,
    local: `./assets/students/portrait/${student.student_id}.webp`,
    remote: `https://schaledb.com/images/student/portrait/${student.student_id}.webp`,
    alt: localizedName(student, "student", locale, localization),
    className: "profile-portrait-image",
  });
}

function reactionImage(value, manifest, locale) {
  const grade = Number(value?.reaction_grade) || 1;
  const label = localizedReactionLabel(grade, locale);
  return imageMarkup({
    manifest,
    key: `reaction:${grade}`,
    local: `./assets/reactions/gift-0${grade}.png`,
    remote: `https://schaledb.com/images/ui/Cafe_Interaction_Gift_0${grade}.png`,
    alt: label,
    className: "reaction-face",
  });
}

function nodeImage(node, manifest, locale, localization) {
  return imageMarkup({
    manifest,
    key: `node:${node.id}`,
    local: `./assets/nodes/${node.id}.png`,
    remote: node.icon_url ?? "",
    alt: localizedName(node, "node", locale, localization),
    className: "node-image",
    loading: "eager",
  });
}

export function renderStudentList({ container, students, selectedId, manifest, locale = "zh_cn", localization }) {
  if (!students.length) {
    container.innerHTML = `<div class="list-empty" role="status"><strong>${t(locale, "noMatchTitle")}</strong><span>${t(locale, "noMatchHint")}</span></div>`;
    return;
  }

  container.innerHTML = students.map((student) => `
    <button class="student-row ${String(student.student_id) === selectedId ? "is-selected" : ""}" type="button" role="option" data-student-id="${student.student_id}" aria-selected="${String(student.student_id) === selectedId}">
      ${studentImage(student, manifest, locale, localization)}
      <span class="student-row-copy"><strong>${escapeHtml(localizedName(student, "student", locale, localization))}</strong></span>
      <span class="student-row-arrow" aria-hidden="true">›</span>
    </button>
  `).join("");
}

export function renderBrandStudentOptions({ students = [], selectedId = "", manifest, locale = "zh_cn", localization }) {
  if (!students.length) {
    return `<div class="brand-avatar-empty" role="status">${escapeHtml(t(locale, "noMatchHint"))}</div>`;
  }
  return students.map((student) => {
    const id = String(student.student_id);
    const name = localizedName(student, "student", locale, localization);
    const secondaryName = locale === "en"
      ? student.name_zh_cn
      : student.name_en;
    const isSelected = id === String(selectedId);
    return `<button type="button" class="brand-avatar-option" data-brand-student-id="${escapeHtml(id)}" role="option" aria-pressed="${isSelected}">
      ${studentImage(student, manifest, locale, localization)}
      <span class="brand-avatar-option-copy"><strong>${escapeHtml(name)}</strong>${secondaryName && secondaryName !== name ? `<small>${escapeHtml(secondaryName)}</small>` : ""}</span>
      ${isSelected ? `<span class="brand-avatar-option-state">${escapeHtml(t(locale, "brandAvatarSelected"))}</span>` : ""}
    </button>`;
  }).join("");
}

function renderProfileGift(value, gift, manifest, locale, localization) {
  if (!gift) return "";
  const giftName = localizedName(gift, "gift", locale, localization);
  return `<li class="profile-gift-item" title="${escapeHtml(`${giftName} · +${formatExp(value.relationship_exp, locale)} EXP`)}">
    ${giftImage(gift, manifest, locale, localization)}
    <span class="profile-gift-copy"><strong>${escapeHtml(giftName)}</strong><span>+${formatExp(value.relationship_exp, locale)} EXP</span></span>
  </li>`;
}

function renderProfileGifts(student, giftsById, manifest, locale, localization) {
  const groups = boostedGiftGroups(student);
  if (!groups.length) return "";
  const giftCount = groups.reduce((sum, group) => sum + group.gifts.length, 0);
  return `<details class="profile-gifts-details"><summary><span>${escapeHtml(t(locale, "bonusGifts"))}</span><small>${escapeHtml(t(locale, "giftCount", giftCount))}</small></summary><div class="profile-gifts" aria-labelledby="profile-gifts-title">
    <p class="profile-gifts-title" id="profile-gifts-title">${t(locale, "bonusGifts")}</p>
    <ul class="profile-gift-groups">
      ${groups.map((group) => `<li class="profile-gift-row">
        <div class="profile-gift-reaction" role="img" aria-label="${escapeHtml(localizedReactionLabel(group.reaction_grade, locale))}" title="${escapeHtml(localizedReactionLabel(group.reaction_grade, locale))}">${reactionImage(group, manifest, locale)}</div>
        <ul class="profile-gift-row-list">
          ${group.gifts.map((value) => renderProfileGift(value, giftsById?.get(String(value.gift_id)), manifest, locale, localization)).join("")}
        </ul>
      </li>`).join("")}
    </ul>
  </div></details>`;
}

function renderHero(student, crafting, mechanism, giftsById, manifest, locale, localization) {
  const total = crafting.full_three_stage_expected_relationship_exp;
  return `<section class="profile-panel panel" aria-labelledby="student-title">
    <div class="profile-portrait-art" aria-hidden="true">${studentPortraitImage(student, manifest, locale, localization)}<span></span></div>
    <div class="profile-identity">
      <div class="hero-avatar-slot" data-student-avatar></div>
      <div class="profile-copy">
      <p class="eyebrow">${t(locale, "selectedStudent")}</p>
        <h2 id="student-title" tabindex="-1">${escapeHtml(localizedName(student, "student", locale, localization))}</h2>
        ${renderProfileGifts(student, giftsById, manifest, locale, localization)}
      </div>
    </div>
    <div class="hero-result">
      <div class="hero-reaction-stack" aria-hidden="true">
        ${[4, 3, 2].map((grade) => reactionImage({ reaction_grade: grade }, manifest, locale)).join("")}
      </div>
      <span class="result-label">${t(locale, "resultLabel")}</span>
      <strong>${formatExp(total, locale)}</strong>
      <span>${t(locale, "expUnit")}</span>
    </div>
  </section>`;
}

function renderStatCards(crafting, locale) {
  const stats = [
    { label: t(locale, "stage", 1), value: crafting.stage_expected_relationship_exp["1"], tone: "blue", detail: t(locale, "expectedIncreaseStone") },
    { label: t(locale, "stage", 2), value: crafting.stage_expected_relationship_exp["2"], tone: "yellow", detail: t(locale, "expectedIncrease") },
    { label: t(locale, "stage", 3), value: crafting.stage_expected_relationship_exp["3"], tone: "rose", detail: t(locale, "expectedIncrease") },
  ];
  return `<section class="stat-grid" aria-label="${t(locale, "expectedIncrease")}">
    ${stats.map((stat) => `<article class="stat-card tone-${stat.tone}"><span>${stat.label}</span><strong>${formatExp(stat.value, locale)}</strong><small>${stat.detail}</small></article>`).join("")}
  </section>`;
}

function localizedNodeGiftNames(node, locale, localization, giftsById) {
  if (locale === "en") return node.gift_names_en ?? [];
  if (locale === "zh_cn") return node.gift_names_zh_cn ?? [];
  const japaneseByEnglish = new Map(
    [...(giftsById?.values?.() ?? [])].map((gift) => [gift.name_en, localizedName(gift, "gift", locale, localization)]),
  );
  return (node.gift_names_en ?? []).map((name) => japaneseByEnglish.get(name) ?? name);
}

export function renderNodeOptionRows(stageModel, manifest, optionCount, locale, localization, giftsById) {
  const options = [...(stageModel.nodeExpectations ?? [])]
    .sort((a, b) => b.expected_relationship_exp - a.expected_relationship_exp || b.probability - a.probability || a.node_id - b.node_id)
    .slice(0, 5);
  if (!options.length) {
    return `<p class="node-options-empty">${t(locale, "nodeNoData")}</p>`;
  }
  const renderOption = (node, index) => {
      const nodeName = localizedName(node, "node", locale, localization);
      const giftNames = localizedNodeGiftNames(node, locale, localization, giftsById);
      const ordinaryFlowerName = locale === "en" ? "Flower" : locale === "ja" ? "花弁" : "花";
      const giftLine = stageModel.id === "2" && nodeName !== ordinaryFlowerName && giftNames.length
        ? `<small class="node-option-gifts" title="${escapeHtml(giftNames.join("、"))}">${t(locale, "relatedGift")}${giftNames.map(escapeHtml).join("、")}</small>`
        : "";
      const appearanceProbability = probabilityOfNodeAppearing(node.probability, optionCount);
      const noPositiveProbability = node.no_positive_relationship_probability ?? 1;
      return `<div class="node-option-row">
      <span class="node-option-rank">${String(index + 1).padStart(2, "0")}</span>
      ${nodeImage({ id: node.node_id, node_id: node.node_id, name_en: node.name_en, name_zh_cn: node.name_zh_cn }, manifest, locale, localization)}
      <span class="node-option-copy"><strong>${escapeHtml(nodeName)}</strong><small>${t(locale, "nodeAppearance", formatPercent(appearanceProbability, locale))}</small><small class="node-option-zero">${t(locale, "nodeNoPositive", formatPercent(noPositiveProbability, locale))}</small>${giftLine}</span>
      <span class="node-option-exp"><strong>${formatExp(node.expected_relationship_exp, locale)}</strong><small>${t(locale, "expectedExp")}</small></span>
    </div>`;
    };
  return `<ol class="node-option-list" aria-label="${t(locale, "nodeListAria")}">${options.map((node, index) => `<li class="node-option-primary">${renderOption(node, index)}</li>`).join("")}</ol>`;
}

function renderNodeProbabilityRows(stageModel, optionCount, locale, localization) {
  return [...(stageModel.nodeDistribution ?? [])]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4)
    .map((node) => {
      const appearanceProbability = probabilityOfNodeAppearing(node.probability, optionCount);
      const nodeName = localizedName({ id: node.id, node_id: node.id, name_en: node.name_en, name_zh_cn: node.name_zh_cn }, "node", locale, localization);
      return `<div class="probability-row"><span>${escapeHtml(nodeName)}</span><div class="probability-track"><i style="width: ${Math.max(2, appearanceProbability * 100)}%"></i></div><b>${formatPercent(appearanceProbability, locale)}</b></div>`;
    })
    .join("");
}

export function renderCraftingPath(crafting, mechanism, manifest, locale, localization, giftsById) {
  return `<section class="panel crafting-panel" aria-labelledby="crafting-title">
    <div class="section-heading"><h2 id="crafting-title">${t(locale, "craftingTitle")}</h2></div>
    <div class="stage-path">
      ${STAGES.map((stageId, index) => {
        const stageModel = mechanism.stages.find((entry) => entry.id === stageId);
        const nodeCount = stageModel.nodeCount;
        const giftNodes = stageModel.giftCapableNodes ?? [];
        const stageNote = stageId === "1" ? t(locale, "stageStart") : stageId === "2" ? t(locale, "stageMiddle") : t(locale, "stageEnd");
        const stageCost = stageId === "1" ? t(locale, "stageStone") : t(locale, "stageContinue");
        return `<article class="stage-card stage-card-${stageId}">
          <div class="stage-card-top"><span class="stage-index">0${stageId}</span><div><strong>${t(locale, "stage", stageId)}</strong><small>${stageNote} · ${stageCost}</small></div></div>
          <div class="stage-card-visual" aria-hidden="true"><img class="stage-card-visual-border" src="./assets/ui/craft-node-border.png" alt=""><span>${stageModel.nodeExpectations?.[0] ? nodeImage({ id: stageModel.nodeExpectations[0].node_id, node_id: stageModel.nodeExpectations[0].node_id, name_en: stageModel.nodeExpectations[0].name_en, name_zh_cn: stageModel.nodeExpectations[0].name_zh_cn }, manifest, locale, localization) : ""}</span></div>
          <div class="node-copy"><h3>${escapeHtml(t(locale, "availableNodes"))}</h3><span>${escapeHtml(t(locale, "nodeCount", nodeCount))}</span></div>
          ${renderNodeOptionRows(stageModel, manifest, mechanism.optionCount, locale, localization, giftsById)}
          <dl class="node-stats"><div><dt>${t(locale, "expectedIncrease")}</dt><dd>${formatExp(stageModel.expectedExp, locale)}</dd></div><div><dt>${t(locale, "expectedGiftQuantity")}</dt><dd>${formatQuantity(stageModel.expectedGiftQuantity, locale)}</dd></div><div><dt>${t(locale, "noPositiveGift")}</dt><dd>${formatPercent(stageModel.noPositiveProbability, locale)}</dd></div></dl>
          <details class="stage-details"><summary>${escapeHtml(t(locale, "stageDetails"))}</summary><div class="stage-pool-details"><div><span>${t(locale, "giftNodePool")}</span><strong>${giftNodes.length}/${nodeCount}</strong><p>${giftNodes.length ? giftNodes.map((node) => escapeHtml(localizedName(node, "node", locale, localization))).join("、") : t(locale, "noGiftNode")}</p></div><div><span>${t(locale, "appearanceTop")}</span>${renderNodeProbabilityRows(stageModel, mechanism.optionCount, locale, localization)}</div></div></details>
          ${index < STAGES.length - 1 ? `<span class="stage-connector" aria-hidden="true">→</span>` : ""}
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

function renderGiftCard(value, gift, manifest, locale, localization) {
  if (!gift) return "";
  return `<article class="gift-card gift-card-rarity-${escapeHtml(String(gift.rarity ?? "").toLowerCase())}">
    ${giftImage(gift, manifest, locale, localization)}
    <div class="gift-card-body"><div class="gift-card-title"><h3>${escapeHtml(localizedName(gift, "gift", locale, localization))}</h3><span class="gift-rarity">${escapeHtml(gift.rarity)}</span></div>
      <div class="gift-card-meta"><div class="reaction" title="${escapeHtml(localizedReactionLabel(value.reaction_grade, locale))}">${reactionImage(value, manifest, locale)}</div><strong>+${formatExp(value.relationship_exp, locale)} EXP</strong></div>
    </div>
  </article>`;
}

export function renderGiftSection({ student, giftsById, manifest, filter, locale, localization }) {
  const values = [...giftValuesForFilter(student, filter)].sort((a, b) => b.relationship_exp - a.relationship_exp || b.reaction_grade - a.reaction_grade || a.gift_id - b.gift_id);
  const isEmpty = values.length === 0;
  const isPreferredFilter = filter === "preferred";
  const isExpFilter = String(filter).startsWith("exp-");
  const emptyTitle = isPreferredFilter
    ? t(locale, "noPreferredGifts")
    : isExpFilter
      ? t(locale, "noExpGifts", escapeHtml(String(filter).slice(4)))
      : t(locale, "noGifts");
  const emptyDescription = isPreferredFilter
    ? t(locale, "preferredDescription")
    : t(locale, "changeGiftExp");
  return `<section class="panel gifts-panel" aria-labelledby="gifts-title">
    <div class="section-heading gift-heading"><div><p class="eyebrow">${t(locale, "giftExpEyebrow")}</p><h2 id="gifts-title">${filter === "preferred" ? t(locale, "preferredGifts") : t(locale, "giftValueTitle")}</h2></div><span class="section-caption">${t(locale, "giftCount", values.length)}</span></div>
    <div class="filter-tabs" role="group" aria-label="${t(locale, "giftFilterAria")}">
      ${GIFT_FILTERS.map((item) => `<button type="button" class="filter-tab ${filter === item.id ? "is-active" : ""}" data-gift-filter="${item.id}" aria-pressed="${filter === item.id}">${item.id === "preferred" ? t(locale, "preferredGifts") : item.id === "all" ? t(locale, "allGifts") : `${item.id.slice(4)} EXP`}</button>`).join("")}
    </div>
    ${isEmpty ? `<div class="gift-empty" role="status"><span aria-hidden="true">◎</span><div><strong>${emptyTitle}</strong><p>${emptyDescription}</p></div></div>` : `<div class="gift-grid">${values.map((value) => renderGiftCard(value, giftsById.get(String(value.gift_id)), manifest, locale, localization)).join("")}</div>`}
  </section>`;
}

export function renderStudentDetails({ student, crafting, craftingSnapshot, giftsById, manifest, giftFilter, mechanism, locale = "zh_cn", localization }) {
  if (!student || !crafting) return `<div class="empty-surface"><h2>${t(locale, "noMatchTitle")}</h2><p>${t(locale, "noMatchHint")}</p></div>`;
  const currentMechanism = mechanism ?? { optionCount: craftingSnapshot?.scope?.node_option_count ?? 5, stages: [] };
  return `${renderHero(student, crafting, currentMechanism, giftsById, manifest, locale, localization)}${renderStatCards(crafting, locale)}${renderCraftingPath(crafting, currentMechanism, manifest, locale, localization, giftsById)}${renderGiftSection({ student, giftsById, manifest, filter: giftFilter, locale, localization })}`;
}

export function wireImageFallbacks(container) {
  container.querySelectorAll("img[data-fallback]").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.dataset.remoteTried !== "true" && image.dataset.fallback) {
        image.dataset.remoteTried = "true";
        image.src = image.dataset.fallback;
        return;
      }
      image.hidden = true;
      image.closest("[data-image-frame]")?.classList.add("is-broken");
    }, { once: false });
  });
}
