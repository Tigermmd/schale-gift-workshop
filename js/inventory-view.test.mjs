import assert from "node:assert/strict";
import fs from "node:fs";
import { firstTargetStudent, mappedPreview, renderInventoryWorkspace, renderPeriodicResources } from "./inventory-view.js";

const inventoryStyles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
assert.match(inventoryStyles, /\.inventory-gift-image\.gift-rarity-sr,\s*\.inventory-gift-image\.gift-rarity-ssr[\s\S]*?background-image:\s*none/, "Inventory gift icons must not inherit pixel rarity backgrounds");
const resourceIconStyles = inventoryStyles.slice(inventoryStyles.lastIndexOf("/* v62:"));
assert.match(resourceIconStyles, /\.icon-frame[\s\S]*background:\s*var\(--paper\)/, "Icon frames must use the shared paper background");
assert.match(resourceIconStyles, /\.icon-frame[\s\S]*border:\s*1px solid var\(--line\)/, "Resource icons must share the standard border");
assert.doesNotMatch(resourceIconStyles, /linear-gradient/, "Inventory resource icons must not use the dark gradient background");
assert.match(resourceIconStyles, /\.inventory-gift-image\.icon-frame\.gift-rarity-sr,[\s\S]*background:\s*var\(--paper\)[\s\S]*border:\s*1px solid var\(--line\)/, "Inventory gift icons must restore the shared frame after rarity overrides");
assert.match(resourceIconStyles, /\.inventory-box-image\s*\{[^}]*width:\s*2\.5rem[^}]*height:\s*2\.5rem[^}]*\}/s, "Gift-box icons must have a fixed frame size");
assert.match(resourceIconStyles, /\.inventory-box-image\s+img\s*\{[^}]*display:\s*block[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*contain[^}]*\}/s, "Gift-box images must stay contained inside their fixed frame");
assert.match(resourceIconStyles, /\.inventory-box-identity\s+strong,[\s\S]*?white-space:\s*normal/, "Gift-box names must remain readable instead of being ellipsized");
assert.match(inventoryStyles, /\.node-option-copy\s+\.node-option-gifts\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere[^}]*\}/s, "Related gift names must wrap on narrow screens");
assert.match(inventoryStyles, /\.inventory-gift-image\s*>\s*span\[aria-hidden=\"true\"\]\s*\{\s*display:\s*none/, "Inventory gift fallback letters must stay hidden while the image loads");
assert.match(inventoryStyles, /\.inventory-gift-image\.is-broken\s*>\s*span\[aria-hidden=\"true\"\]\s*\{\s*display:\s*block/, "Inventory gift fallback letters must remain available after both image sources fail");

const boxPreview = mappedPreview({
  stockResources: {},
  giftBoxes: { "100008": 3, "100009": 1.5 },
  equivalentGiftPools: { "random-gold": 80 },
  relationshipExp: {},
}, "zh");
assert.match(boxPreview, /\+3 金色礼物自选盒/);
assert.match(boxPreview, /\+1\.50 紫色礼物随机盒/);
assert.match(boxPreview, /\+80 金色随机礼物池（等效）/);
assert.doesNotMatch(boxPreview, /100008|100009/);

const targetData = {
  studentById: new Map([["1", { student_id: 1 }], ["2", { student_id: 2 }]]),
};
assert.equal(firstTargetStudent(targetData, { mainTargetStudentId: 2, students: [{ studentId: 1 }, { studentId: 2 }] }).student_id, 2);

const periodicHtml = renderPeriodicResources({
  data: { unlimitedAssaultRewards: null },
  state: {
    periodDays: 30,
    resources: [{
      id: "weekly-manufacturing-stones",
      cadence: "weekly",
      unit: "manufacturing_stone",
      amount: 17,
    }, {
      id: "monthly-total-assault-gift-boxes",
      cadence: "monthly",
      unit: "gift_box",
      gift_box_id: "100008",
      amount: 3,
    }],
    resourcePostingHistory: [],
  },
  locale: "zh",
});
assert.match(periodicHtml, /本期/);
assert.match(periodicHtml, /\+72\.86 制造启动石/);
assert.match(periodicHtml, /\+3 金色礼物自选盒/);
assert.doesNotMatch(periodicHtml, /输入数值/);
assert.doesNotMatch(periodicHtml, /礼物盒 100008/);

const unreleasedPeriodicHtml = renderPeriodicResources({
  data: {
    unlimitedAssaultRewards: null,
    studentById: new Map([["10122", { student_id: 10122, name_zh_cn: "未花（泳装）" }]]),
    releaseTimeline: [{ studentId: 10122, jpRank: 180 }],
  },
  state: {
    mainTargetStudentId: 10122,
    cnProgress: { cutoffRank: 100 },
    resourceForecastDays: 30,
    students: [{ studentId: 10122 }],
    resources: [{ id: "daily-schedule-exp", cadence: "daily", unit: "relationship_exp", amount: 1, expected_per_count: 31.25 }, { id: "daily-cafe-exp", cadence: "daily", unit: "relationship_exp", amount: 1, expected_per_count: 15 }],
    resourcePostingHistory: [],
  },
  locale: "zh_cn",
});
assert.match(unreleasedPeriodicHtml, /当前目标：未花（泳装）/);
assert.match(unreleasedPeriodicHtml, /本期预计/);
assert.match(unreleasedPeriodicHtml, /当前目标可计入/);
assert.equal((unreleasedPeriodicHtml.match(/不计入当前目标/g) ?? []).length, 2, "schedule and cafe must be marked unavailable for an unreleased target");

const reservationHtml = renderInventoryWorkspace({
  data: {
    gifts: [{ id: 5000, name_zh_cn: "测试礼物", name_en: "Test Gift", rarity: "SSR", base_exp: 60 }],
    giftById: new Map([["5000", { id: 5000, name_zh_cn: "测试礼物", name_en: "Test Gift", rarity: "SSR", base_exp: 60 }]]),
    giftBoxes: [],
  },
  state: {
    periodDays: 30,
    students: [],
    giftBoxes: {},
    resources: [],
    inventory: { "5000": 2 },
    giftReservations: { "5000": 1 },
    stockResources: { manufacturing_stone: 0, synthesis_stone_gold: 0, gold_manufacturing_stone: 0 },
    incomingResources: { stockResources: {}, giftBoxes: {}, equivalentGiftPools: {}, relationshipExp: {} },
    equivalentGiftPools: {},
    resourcePostingHistory: [],
  },
  locale: "zh_cn",
  filters: { query: "", rarity: "all", exp: "all", onlyOwned: true },
  evidence: { rows: [], sources: [] },
});
assert.match(reservationHtml, /测试礼物 ×1/);
assert.doesNotMatch(reservationHtml, /礼物 5000/);
assert.match(reservationHtml, /<details class="inventory-reservation-panel">/);
assert.match(reservationHtml, /<summary>[\s\S]*1 种/);

const emptyInventoryHtml = renderInventoryWorkspace({
  data: {
    gifts: [{ id: 5000, name_zh_cn: "测试礼物", name_en: "Test Gift", rarity: "SSR", base_exp: 60 }],
    giftById: new Map([["5000", { id: 5000, name_zh_cn: "测试礼物", name_en: "Test Gift", rarity: "SSR", base_exp: 60 }]]),
    giftBoxes: [
      { id: "100008", name_zh_cn: "金色礼物自选盒", name_en: "Gold Gift Choice Box", name_ja: "金色の贈り物選択ボックス", pool: "choice", rarity: "SSR" },
      { id: "100009", name_zh_cn: "紫色礼物随机盒", name_en: "Purple Gift Random Box", name_ja: "紫色の贈り物ランダムボックス", pool: "random", rarity: "SR" },
    ],
  },
  state: {
    periodDays: 30,
    students: [],
    giftBoxes: {},
    resources: [],
    inventory: {},
    giftReservations: {},
    stockResources: { manufacturing_stone: 0, synthesis_stone_gold: 0, gold_manufacturing_stone: 0 },
    incomingResources: { stockResources: {}, giftBoxes: {}, equivalentGiftPools: {}, relationshipExp: {} },
    equivalentGiftPools: {},
    resourcePostingHistory: [],
  },
  locale: "zh_cn",
  filters: { query: "", rarity: "all", exp: "all", onlyOwned: true },
  evidence: { rows: [], sources: [] },
});
assert.doesNotMatch(emptyInventoryHtml, /inventory-page-hero|inventory-hero-art/, "Inventory must not render a decorative hero");
assert.match(emptyInventoryHtml, /data-inventory-filter="onlyOwned"(?![^>]*checked)/, "An empty inventory must expose all gifts by default");
assert.match(emptyInventoryHtml, /金色礼物自选盒/);
assert.match(emptyInventoryHtml, /紫色礼物随机盒/);
assert.match(emptyInventoryHtml, /金色随机礼物池（等效）/);
assert.ok(
  emptyInventoryHtml.indexOf('id="inventory-box-title"') < emptyInventoryHtml.indexOf('class="inventory-more-details"'),
  "Gift boxes must be visible before the collapsed secondary inventory tools",
);
assert.doesNotMatch(emptyInventoryHtml, /金色制造石/, "Inventory must not show unused gold manufacturing stones");
assert.doesNotMatch(emptyInventoryHtml, /class="icon-frame inventory-resource-icon"/, "Stone resources must not wrap a framed icon in another framed icon");
assert.equal((emptyInventoryHtml.match(/class="inventory-resource-card"/g) ?? []).length, 2, "Inventory should render only the two usable stone resources");
assert.match(emptyInventoryHtml, /inventory-heading-actions/);
assert.equal((emptyInventoryHtml.match(/class="inventory-overview"/g) ?? []).length, 1);
const overviewHtml = emptyInventoryHtml.slice(emptyInventoryHtml.indexOf("class=\"inventory-overview\""), emptyInventoryHtml.indexOf("class=\"inventory-section\""));
assert.equal((overviewHtml.match(/<article/g) ?? []).length, 2, "Inventory overview should keep only current and remaining totals");
assert.doesNotMatch(overviewHtml, /金色礼物自选盒|紫色礼物随机盒|金色随机礼物池/);

const synthesisHtml = renderInventoryWorkspace({
  data: {
    gifts: [
      { id: 5000, name_zh_cn: "金礼物", name_en: "Gold gift", rarity: "SR", base_exp: 20 },
      { id: 5100, name_zh_cn: "紫礼物", name_en: "Purple gift", rarity: "SSR", base_exp: 60 },
    ],
    giftById: new Map([["5000", { id: 5000, name_zh_cn: "金礼物", rarity: "SR" }], ["5100", { id: 5100, name_zh_cn: "紫礼物", rarity: "SSR" }]]),
    giftBoxes: [],
  },
  state: { periodDays: 30, students: [], giftBoxes: {}, resources: [], inventory: {}, giftReservations: {}, stockResources: { manufacturing_stone: 0, synthesis_stone_gold: 0 }, incomingResources: { stockResources: {}, giftBoxes: {}, equivalentGiftPools: {}, relationshipExp: {} }, equivalentGiftPools: {}, resourcePostingHistory: [] },
  locale: "zh_cn",
  filters: { query: "", rarity: "all", exp: "all", onlyOwned: false },
});
assert.match(synthesisHtml, /option value="5000"/);
assert.doesNotMatch(synthesisHtml, /option value="5100"/);

const expandedEmptyInventoryHtml = renderInventoryWorkspace({
  data: {
    gifts: [{ id: 5000, name_zh_cn: "测试礼物", name_en: "Test Gift", rarity: "SSR", base_exp: 60 }],
    giftById: new Map([["5000", { id: 5000, name_zh_cn: "测试礼物", name_en: "Test Gift", rarity: "SSR", base_exp: 60 }]]),
    giftBoxes: [],
  },
  state: {
    periodDays: 30,
    students: [],
    giftBoxes: {},
    resources: [],
    inventory: {},
    giftReservations: {},
    stockResources: { manufacturing_stone: 0, synthesis_stone_gold: 0, gold_manufacturing_stone: 0 },
    incomingResources: { stockResources: {}, giftBoxes: {}, equivalentGiftPools: {}, relationshipExp: {} },
    equivalentGiftPools: {},
    resourcePostingHistory: [],
  },
  locale: "zh_cn",
  filters: { query: "", rarity: "all", exp: "all", onlyOwned: false },
});
assert.doesNotMatch(expandedEmptyInventoryHtml, /礼物数据已经加载/);
assert.doesNotMatch(expandedEmptyInventoryHtml, /data-inventory-show-all/);

const canonicalGiftBoxNameHtml = renderInventoryWorkspace({
  data: {
    gifts: [],
    giftById: new Map(),
    giftBoxes: [
      { id: "100008", name_zh_cn: "礼物盒", name_en: "Gift box", name_ja: "ギフトボックス", pool: "choice", rarity: "SSR" },
      { id: "100009", name_zh_cn: "高级礼物盒", name_en: "Premium gift box", name_ja: "高級ギフトボックス", pool: "random", rarity: "SR" },
    ],
  },
  state: {
    periodDays: 30,
    students: [],
    giftBoxes: { "100008": 1, "100009": 1 },
    resources: [],
    inventory: {},
    giftReservations: {},
    stockResources: { manufacturing_stone: 0, synthesis_stone_gold: 0 },
    incomingResources: { stockResources: {}, giftBoxes: {}, equivalentGiftPools: {}, relationshipExp: {} },
    equivalentGiftPools: {},
    resourcePostingHistory: [],
  },
  locale: "zh_cn",
  filters: { query: "", rarity: "all", exp: "all", onlyOwned: true },
  evidence: { rows: [], sources: [] },
});
assert.match(canonicalGiftBoxNameHtml, /金色礼物自选盒/);
assert.match(canonicalGiftBoxNameHtml, /紫色礼物随机盒/);
assert.doesNotMatch(canonicalGiftBoxNameHtml, /<strong>礼物盒<\/strong>|<strong>高级礼物盒<\/strong>/);

console.log("inventory view tests passed");
