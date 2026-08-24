# 礼物与好感数据

本目录保存礼物养成规划器使用的中国服数据快照。中文字段来自 SchaleDB CN，英文和日文名称用于页面语言切换。每个 JSON 文件的 `source` 字段记录快照时间、版本和来源。

## 文件

- `gifts.json`：52 种礼物的名称、描述、稀有度、基础好感 EXP 和标签。
- `student_gift_preferences.json`：完整学生目录、三语名称、52 种礼物对每位学生的好感值和偏好礼物。
- `relationship_thresholds.json`：好感 1–100 级的单级需求、累计 EXP、反应标签和礼物/日程相关 EXP。
- `crafting_expected_relationship.json`：完整三阶段制造中，每位学生的节点期望、礼物产出和每枚制造启动石的期望好感。
- `paid_packages_cn.json`：国服礼包目录、价格、限购、内容、适用学生和来源快照。
- `paid_packages_cn_candidates.json`：更新脚本发现但尚未加入正式目录的新礼包公告；没有候选时不会生成。
- `gift_boxes_cn.json`：礼物盒类型、礼物池、随机规则和物品 ID。
- `resource_evidence_cn.json`：国服周期资源的来源、计算方式和可配置值。
- `unlimited_assault_rewards_cn.json`：制约解除作战 1–124 层奖励快照及礼物盒、金色合成石汇总。
- `schedule_rank_rewards_cn.json`：日程地区 Rank、每日券数和好感奖励模型。
- `jp_release_timeline.json`：日服学生上线顺序，用于推算国服学生进度。
- `student_crafting_expectations.csv`：面向查看和二次处理的学生制造期望汇总。
- `cn_planner_data_to_fill.md`：玩家可直接填写的国服数据问卷。
- `generate_relationship_data.py`：从 SchaleDB 快照重新生成学生、礼物和偏好数据。
- `crafting_expected_relationship.py`：读取制造数据并计算三阶段节点期望。
- `../scripts/update_data.py`：统一更新入口，同时生成学生、礼物、制造、三语名称、上线顺序和礼包公告候选。

## 礼物匹配

学生礼物偏好按照 SchaleDB `StudentGifts` 页面使用的标签匹配规则生成：

1. 合并学生的普通偏好标签、专属偏好标签和通用高级礼物标签；
2. 计算礼物标签与学生标签的交集，最多计 3 个匹配；
3. 反应等级为匹配数加 1；
4. 好感 EXP 为 `gift.ExpValue × (1 + min(匹配数, 3))`。

数据中的 `relationship_exp` 是计算使用的实际好感值。`reaction_grade=2/3/4` 对应游戏中的中、大、特大反应；`most_favorite_gifts` 保存特大反应礼物 ID。`is_premium` 表示礼物属于 SSR 高级礼物，`is_universal` 表示命中通用高级礼物标签。

普通 SR 礼物在没有额外偏好标签时记录基础 20 EXP；普通高级礼物在没有额外偏好标签时记录基础 120 EXP。这样页面可以直接按 240、180、120、80、60、40、20 分值筛选。

## 三阶段制造

制造启动石按第一阶段计算：1 枚启动石等于 10 个制造石碎片；后续阶段按各自节点的礼物产物计算。

每个阶段按 SchaleDB 的节点权重独立生成 5 个候选节点，玩家从当次候选中选择目标学生期望好感最高的节点。被选节点再按 Groups、Items 和数量范围计算产出期望，三个阶段结果相加。

节点产出按数据层级计算：

- 组概率 = 组权重 / 节点组权重总和；
- 物品概率 = 物品权重 / 组内物品权重总和；
- 数量期望 =（最小数量 + 最大数量）/ 2。

非礼物产物的好感和礼物数量贡献均为 0。阶段 1、2、3 的可产礼物节点以制造快照中的 `Groups` 和 `Items` 为准，页面不会根据节点名称推断产物。

## 礼物盒

- `100000`：35 种可制造金色礼物 `5000`–`5034` 等概率随机；
- `100008`：从 35 种可制造金色礼物中选择 1 件；
- `100009`：13 种可制造紫色礼物 `5100`–`5112` 等概率随机。

活动商店中种类不固定的金礼物记录为 `100000` 等效随机池，库存页保留独立数量。随机盒只提供期望好感，规划器不会把它展开成具体礼物库存。

## 好感阈值

好感等级数据来自公开玩家验证表，`relationship_level_cap=100` 表示好感等级上限。当前 SchaleDB 配置中的属性加成上限另记为 `stat_bonus_level_cap=50`，两者分别用于好感等级和属性加成展示。

日程和咖啡厅的具体次数由玩家在页面填写。未按国服进度实装或状态未知的学生只使用礼物相关资源；已实装学生的共享日程、咖啡厅和周期资源只分配给当前主目标。

## 服务器与学生状态

学生 ID 使用跨服务器一致的 ID。目录保留完整学生快照，`cn_released`、`future_only` 和 `release_status` 记录国服状态。没有匹配到偏好标签的学生仍保留在目录中，并通过 `no_matching_gift_in_source=true` 标记数据状态。

中文字段固定使用 SchaleDB `data/cn` 区域数据。生成脚本使用 `--server cn`。

## 来源

- [SchaleDB CN 礼物数据](https://schaledb.com/data/cn/items.min.json)
- [SchaleDB CN 学生数据](https://schaledb.com/data/cn/students.min.json)
- [SchaleDB 制造数据](https://raw.githubusercontent.com/SchaleDB/SchaleDB/main/data/crafting_cn.json)
- [SchaleDB 制造页面](https://schaledb.com/crafting)
- [SchaleDB StudentGifts 匹配代码](https://schaledb.com/assets/StudentGifts-8fad62db.js)
- [Blue Archive Wikiru：制造](https://bluearchive.wikiru.jp/?%E8%A3%BD%E9%80%A0)
- [Blue Archive Wikiru：礼物](https://bluearchive.wikiru.jp/?%E8%B4%88%E3%82%8A%E7%89%A9)
- [Blue Archive Wikiru：好感等级验证表](https://bluearchive.wikiru.jp/?SandBox/%E7%B5%86%E3%83%A9%E3%83%B3%E3%82%AF)

国服公告、中文社区资料和玩家填写值的来源与适用范围保存在对应 JSON 的 `source`、`evidence` 或 `notes` 字段中。
