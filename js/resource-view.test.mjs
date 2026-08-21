import assert from "node:assert/strict";
import fs from "node:fs";
import { renderResourcesWorkspace } from "./resource-view.js";

const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const html = renderResourcesWorkspace({
  data: {
    giftBoxes: [],
    unlimitedAssaultRewards: null,
    assetManifest: { entries: {
      "ui:kivo-home-button": { local: "./assets/ui/kivo-home-button.webp" },
      "ui:kivo-favor": { local: "./assets/ui/kivo-favor.webp" },
      "ui:schedule-favor": { local: "./assets/ui/schedule-favor.png" },
      "ui:kivo-options": { local: "./assets/ui/kivo-options.webp" },
      "ui:schaledb-gdd-logo": { local: "./assets/ui/schaledb-gdd-logo.png" },
    } },
  },
  state: {
    periodDays: 30,
    forecastDays: 30,
    resourceForecastDays: 30,
    students: [],
    giftBoxes: {},
    resources: [{ id: "weekly-manufacturing-stones", cadence: "weekly", unit: "manufacturing_stone", amount: 17 }, {
      id: "monthly-synthesis-stones",
      cadence: "monthly",
      unit: "synthesis_stone_gold",
      amount: 50,
    }, {
      id: "monthly-total-assault-gift-boxes",
      cadence: "monthly",
      unit: "gift_box",
      gift_box_id: "100008",
      amount: 3,
    }, {
      id: "monthly-grand-assault-gold-gift-boxes",
      cadence: "monthly",
      unit: "gift_box",
      gift_box_id: "100008",
      amount: 4.5,
    }, {
      id: "monthly-grand-assault-purple-gift-boxes",
      cadence: "monthly",
      unit: "gift_box",
      gift_box_id: "100009",
      amount: 1.5,
    }, {
      id: "daily-schedule-exp",
      cadence: "daily",
      unit: "relationship_exp",
      input_kind: "daily_count",
      amount: null,
      expected_per_count: 31.25,
    }, {
      id: "daily-cafe-exp",
      cadence: "daily",
      unit: "relationship_exp",
      input_kind: "daily_count",
      amount: null,
      expected_per_count: 15,
    }],
  },
  locale: "zh",
  evidence: {
    rows: [{
      resource_id: "monthly-total-assault-gift-boxes",
      status: "user_confirmed",
      candidate_value: 3,
      candidate_unit_zh_cn: "个/月",
      candidate_text_zh_cn: "每月约 3 个金色礼物自选盒（100008）。",
      candidate_note_zh_cn: "随机盒 100000 与紫色随机盒 100009 不应在普通界面展示。",
      official_source_ids: [],
    }],
    sources: [],
  },
});

assert.match(html, /免费资源/);
assert.match(html, /制造启动石/);
assert.match(html, /aria-label="制造启动石 · 数量"/);
assert.doesNotMatch(html, /每周制造启动石/);
assert.match(html, />50</);
assert.doesNotMatch(html, /50\.00/);
assert.match(html, />3</);
assert.doesNotMatch(html, /3\.00/);
assert.match(html, /待填写/);
assert.match(html, /日程：每天次数/);
assert.match(html, /咖啡厅：每天次数/);
assert.doesNotMatch(html, /随机盒 100000 与紫色随机盒 100009/);
assert.doesNotMatch(html, /resource-art-strip/);
assert.doesNotMatch(html, /schaledb-gdd-logo\.png|kivo-logo/);
assert.match(html, /resource-toolbar/);
assert.match(html, /data-resource-period-days value="30"/);
assert.doesNotMatch(html, /100000|100008|100009/);
assert.match(html, /class="icon-frame resource-icon"/);
assert.match(styles, /\.gift-box-inventory\s*\{/);
assert.match(styles, /\.gift-box-input\s*\{/);
assert.match(styles, /\.resource-reward-summary\s*\{[^}]*display:\s*grid/s, "Assault rewards must render as separate blocks");
assert.equal((html.match(/data-resource-icon="schedule"/g) ?? []).length, 2, "Schedule and cafe relationship resources must share the schedule icon marker");
assert.equal((html.match(/src="\.\/assets\/ui\/schedule-favor\.png"/g) ?? []).length, 2, "Schedule and cafe relationship resources must share the schedule icon asset");
assert.doesNotMatch(html, /data-resource-icon="cafe"/);
assert.doesNotMatch(styles, /\.resource-icon img\[data-resource-icon="cafe"\]/);
assert.match(html, /大决战金色礼物自选盒/);
assert.match(html, /大决战紫色礼物随机盒/);
assert.match(html, /data-resource-amount="monthly-grand-assault-gold-gift-boxes" value="4\.5"/);
assert.match(html, /data-resource-amount="monthly-grand-assault-purple-gift-boxes" value="1\.5"/);
assert.doesNotMatch(html, /大决战礼物/);
assert.doesNotMatch(html, /大决战.*(?:共|合计|总计).*6/);
assert.doesNotMatch(html, /monthly-grand-assault-gift-boxes/);
assert.doesNotMatch(html, /已确认|用户确认/);

const independentResourcePreviewHtml = renderResourcesWorkspace({
  data: { giftBoxes: [], unlimitedAssaultRewards: null },
  state: {
    periodDays: 60,
    forecastDays: 90,
    resourceForecastDays: 30,
    students: [],
    giftBoxes: {},
    resources: [{
      id: "monthly-synthesis-stones",
      cadence: "monthly",
      unit: "synthesis_stone_gold",
      amount: 70,
      value_source: "default",
    }],
  },
  locale: "zh_cn",
  evidence: { sources: [], rows: [] },
});
assert.match(independentResourcePreviewHtml, /data-resource-period-days value="30"/, "resource preview must not mirror the 90-day planning forecast");
assert.doesNotMatch(independentResourcePreviewHtml, /value="90"/, "resource page must not show the planning forecast as its own period");

const customFloorHtml = renderResourcesWorkspace({
  data: { giftBoxes: [], unlimitedAssaultRewards: null },
  state: {
    periodDays: 30,
    forecastDays: 30,
    students: [],
    giftBoxes: {},
    resources: [{
      id: "monthly-unlimited-assault-gift-boxes",
      cadence: "monthly",
      unit: "gift_box",
      input_kind: "floor",
      amount: 107,
      floor_mode: "custom",
      floor_options: [24, 49, 74, 99, 106, 124],
      max_floor: 124,
    }],
  },
  locale: "zh",
  evidence: { sources: [], rows: [] },
  openResourceId: "monthly-unlimited-assault-gift-boxes",
});
assert.match(customFloorHtml, /<option value="custom" selected>/, "custom floor mode must keep the custom option selected after rerender");
assert.match(customFloorHtml, /data-resource-amount="monthly-unlimited-assault-gift-boxes" value="107"/, "custom floor input must remain visible with the entered value");
assert.match(customFloorHtml, /<details class="resource-details" open>/, "the configured resource section must stay open while editing a custom floor");

const evidenceExplanationHtml = renderResourcesWorkspace({
  data: { giftBoxes: [], unlimitedAssaultRewards: null },
  state: {
    periodDays: 30,
    forecastDays: 30,
    students: [],
    giftBoxes: {},
    resources: [{
      id: "monthly-event-shop-purple-gift-boxes",
      cadence: "monthly",
      unit: "gift_box",
      amount: 4,
    }],
  },
  locale: "zh_cn",
  evidence: {
    sources: [{ id: "lead", url: "https://example.com" }],
    rows: [{
      resource_id: "monthly-event-shop-purple-gift-boxes",
      status: "user_confirmed",
      candidate_value: 4,
      candidate_unit_zh_cn: "个随机紫色礼物盒/月",
      candidate_text_zh_cn: "用户确认：活动商店按每月约2次活动折算，每个活动可获得2个随机紫色礼物盒，合计4个/月。",
      source_id: "lead",
    }],
  },
});
assert.match(evidenceExplanationHtml, /活动商店按每月约2次活动折算，每个活动可获得2个随机紫色礼物盒，合计4个\/月/);
assert.match(evidenceExplanationHtml, /来源 ↗/);
assert.doesNotMatch(evidenceExplanationHtml, /已确认|用户确认|已计入|预填值/);

const naturalConfirmedExplanationHtml = renderResourcesWorkspace({
  data: { giftBoxes: [], unlimitedAssaultRewards: null },
  state: {
    periodDays: 30,
    forecastDays: 30,
    students: [],
    giftBoxes: {},
    resources: [{
      id: "monthly-synthesis-stones",
      cadence: "monthly",
      unit: "synthesis_stone_gold",
      amount: 70,
    }],
  },
  locale: "zh_cn",
  evidence: {
    sources: [],
    rows: [{
      resource_id: "monthly-synthesis-stones",
      status: "user_confirmed",
      candidate_value: 70,
      candidate_unit_zh_cn: "个/月",
      candidate_text_zh_cn: "每月70个：商店兑换50个，爬塔奖励20个。",
    }],
  },
});
assert.match(naturalConfirmedExplanationHtml, /每月70个：商店兑换50个，爬塔奖励20个/);
assert.doesNotMatch(naturalConfirmedExplanationHtml, /商店 50 \+ 制约解除决战 20/);
assert.doesNotMatch(naturalConfirmedExplanationHtml, /商店50 \+ 爬塔20|盒子 ID|用户确认/);

const unreleasedTargetResourceHtml = renderResourcesWorkspace({
  data: {
    giftBoxes: [],
    unlimitedAssaultRewards: null,
    studentById: new Map([["10122", { student_id: 10122, name_zh_cn: "未花（泳装）" }]]),
    releaseTimeline: [{ studentId: 10122, jpRank: 180 }],
  },
  state: {
    mainTargetStudentId: 10122,
    cnProgress: { cutoffRank: 100 },
    periodDays: 60,
    resourceForecastDays: 60,
    students: [{ studentId: 10122 }],
    giftBoxes: {},
    resources: [{ id: "daily-schedule-exp", cadence: "daily", unit: "relationship_exp", input_kind: "daily_count", amount: 1, expected_per_count: 31.25 }, { id: "daily-cafe-exp", cadence: "daily", unit: "relationship_exp", input_kind: "daily_count", amount: 1, expected_per_count: 15 }],
  },
  locale: "zh_cn",
  evidence: { sources: [], rows: [] },
});
assert.match(unreleasedTargetResourceHtml, /当前目标：未花（泳装）/);
assert.match(unreleasedTargetResourceHtml, /未实装.*日程.*咖啡厅.*不计入/);
assert.match(unreleasedTargetResourceHtml, /当前目标可计入好感/);
assert.match(unreleasedTargetResourceHtml, /不计入当前目标/);
assert.doesNotMatch(unreleasedTargetResourceHtml, /有效好感/);
assert.doesNotMatch(unreleasedTargetResourceHtml, />1,387\.50</);

console.log("resource view tests passed");
