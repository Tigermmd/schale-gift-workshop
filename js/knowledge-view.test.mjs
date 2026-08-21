import assert from "node:assert/strict";
import { renderKnowledgeWorkspace } from "./knowledge-view.js";

const thresholds = {
  relationship_level_cap: 100,
  gift_exp: {
    normal: { "小": 20, "中": 40, "大": 60, "特大": 80 },
    premium: { "小": null, "中": 120, "大": 180, "特大": 240 },
  },
  other_exp: { cafe_touch: 15, schedule_min: 15, schedule_max: 25, schedule_bonus_multiplier: 2 },
  source: { relationship_table_source: "https://example.test/relationship" },
  levels: [
    { level: 1, next_level_exp: 15, cumulative_exp_to_reach_level: 0 },
    { level: 50, next_level_exp: 1800, cumulative_exp_to_reach_level: 50000 },
    { level: 99, next_level_exp: 7215, cumulative_exp_to_reach_level: 233010 },
    { level: 100, next_level_exp: 7365, cumulative_exp_to_reach_level: 240225, can_advance_in_simulator: false },
  ],
};

const data = { snapshots: { thresholds }, localization: {} };

const zh = renderKnowledgeWorkspace({ data, locale: "zh_cn", localization: {} });
assert.match(zh, /好感知识/);
assert.match(zh, /好感速查/);
assert.match(zh, /1→100级/);
assert.match(zh, /99→100级/);
assert.match(zh, /knowledge-quick-answers/);
assert.match(zh, /data-knowledge-gift="normal"/);
assert.match(zh, /data-knowledge-gift="premium"/);
assert.match(zh, /金色礼物从中档开始/);
assert.match(zh, /240(?:,)?225/);
assert.match(zh, /7(?:,)?215/);
assert.match(zh, /100级/);
assert.match(zh, /完整等级表/);
assert.match(zh, /咖啡厅/);
assert.match(zh, /未实装学生/);
assert.match(zh, /<th scope="row">100<\/th>[\s\S]*?<td>—<\/td>/);
assert.doesNotMatch(zh, /240225\.00/);

for (const locale of ["en", "ja"]) {
  const html = renderKnowledgeWorkspace({ data, locale, localization: {} });
  assert.match(html, /240(?:,)?225/);
  assert.match(html, /<details class="knowledge-level-details(?: knowledge-panel)?">/);
}

console.log("knowledge view tests passed");
