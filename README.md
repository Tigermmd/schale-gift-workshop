# 夏莱礼物工坊

[![01 开场](docs/promotion/scrapbook/opening.png?v=6e7baf6)](docs/promotion/scrapbook/opening.png?v=6e7baf6)

[![02 功能介绍](docs/promotion/scrapbook/cover.png?v=6e7baf6)](docs/promotion/scrapbook/cover.png?v=6e7baf6)

[![03 开发记录](docs/promotion/scrapbook/codex.png?v=6e7baf6)](docs/promotion/scrapbook/codex.png?v=6e7baf6)

[![04 养成规划](docs/promotion/scrapbook/planner.png?v=6e7baf6)](docs/promotion/scrapbook/planner.png?v=6e7baf6)

[![05 库存管理](docs/promotion/scrapbook/inventory.png?v=6e7baf6)](docs/promotion/scrapbook/inventory.png?v=6e7baf6)

[![06 Agent 助手](docs/promotion/scrapbook/agent.png?v=6e7baf6)](docs/promotion/scrapbook/agent.png?v=6e7baf6)

## 项目简介

面向《蔚蓝档案》玩家的国服礼物与好感规划工具。它运行在本机浏览器中，库存和规划数据保存在浏览器本地。

项目提供中文、English、日本語三种界面。学生、礼物、制造和好感相关数据，以及部分缓存图片素材，主要参考 [SchaleDB](https://schaledb.com/) 的公开数据；库存 JSON 导入/导出、养成规划和资源管理等交互参考 [arona.icu](https://arona.icu/)；国服进度与周期资源则结合 [Kivo Wiki](https://kivo.wiki/)、国服官网公告和玩家资料整理。

这是一个非官方玩家工具，与 NEXON、《蔚蓝档案》运营方、SchaleDB、arona.icu 和 Kivo Wiki 均无隶属关系。


## 功能

### 养成规划

添加一位或多位学生，填写当前好感、目标等级和规划天数。页面会显示：

- 目标好感缺口；
- 当前礼物和礼物盒的预计贡献；
- 规划周期内的免费资源贡献；
- 按平均日收益估算的达成天数。

国服未实装学生使用礼物资源规划；已实装学生可叠加日程和咖啡厅好感。礼包参考位于“礼包性价比”页面，与免费资源规划分区展示。

### 库存管理

库存页支持 52 种具体礼物、制造启动石、金色合成石、礼物盒和活动商店等效随机礼物池。

- 当前持有、周期资源、规划预留和规划后剩余分开显示；
- 规划先生成预留，确认消耗后才扣除具体礼物；
- 支持 arona.icu 兼容的库存 JSON 导入和导出；
- 金色礼物自选盒与紫色礼物随机盒独立记录；
- 随机盒和等效随机池只参与期望计算，不转换成具体礼物库存。

### 制造与周期资源

图鉴页面展示完整三阶段制造节点、候选节点和学生好感期望。资源页面支持配置每周、每月、每天的制造石、礼物盒、制约解除作战、日程和咖啡厅摸头等资源。

制约解除作战可以选择预设楼层，也可以填写实际通关楼层。周期资源的来源和计算说明都可以在页面中展开查看。

### 礼包性价比

礼包页面按当前目标学生计算预计好感和好感/元，并分别列出金礼物、紫礼物、花束、礼物盒和制造资源的贡献。该页面只提供消费参考，不修改库存或购买记录。

### 好感知识

独立页面集中展示好感等级表、100级累计好感、礼物好感值，以及日程和咖啡厅的基础数值。完整等级表默认收起，需要时再展开查看。

### Agent 助手

可选的本机 Agent 支持 OpenAI 兼容接口。填写 Base URL、模型和 API Key 后，Agent 可以读取当前规划、库存摘要、周期资源和礼包性价比结果，并用自然语言回答问题。

Agent 负责提出规划变更，玩家确认后由网页本地应用。库存、购买记录和网页代码由网页本地管理。API Key 仅保存在本机 Harness 进程内存中。启用 Agent 后，当前规划、具体库存数量、礼物盒、制造/合成石、周期资源配置、礼包计划、预留、资源计入记录、礼包快照、本地计算结果和对话会发送到你填写的第三方模型服务；网页计算结果随上下文发送，Agent 通过上下文获取规划数据。未启用 Agent 时，个人数据留在本地。

## 开始使用

运行环境：Python 3.10 或更高版本。不需要安装 npm 依赖。

```bash
git clone https://github.com/Tigermmd/schale-gift-workshop.git
cd schale-gift-workshop
python3 harness_server.py
```

打开 <http://127.0.0.1:8765/>。

macOS 可直接双击项目目录中的 `start.command`，自动启动服务并打开页面。

如果只需要静态查看页面，可以运行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

静态服务器不提供 Agent API。使用 `harness_server.py` 时，页面和本机接口由同一个服务提供：

- 页面：<http://127.0.0.1:8765/index.html?view=planner>
- 健康检查：<http://127.0.0.1:8765/api/health>

自定义端口：

```bash
SCHALE_HARNESS_PORT=8766 python3 harness_server.py
```

## 计算说明

### 制造

- 1 枚制造启动石等于 10 个制造石碎片；
- 启动石按第一阶段计算，后续阶段按各自节点的礼物产物计算；
- 每个阶段生成 5 个候选节点，从当次候选中选择目标学生期望最高的节点；
- 非礼物产物的好感贡献为 0；
- 三个阶段的期望好感相加，得到 1 枚启动石对应的完整制造期望。

### 礼物盒

- `100008`：金色礼物自选盒，可选择可制造的金色礼物；
- `100009`：紫色礼物随机盒，在可制造的紫色礼物池中等概率随机；
- `100000`：金色礼物等效随机池，用于活动商店等种类不固定的金礼物；
- 紫色礼物盒采用随机模式。

活动商店的金礼物种类不固定，因此按等效随机池计算期望，库存中仍保留为独立的等效资源。

### 国服进度

学生 ID 使用跨服务器一致的 ID。国服已实装学生叠加日程和咖啡厅好感，未实装或状态未知的学生使用礼物相关资源。共享的日程、咖啡厅和周期资源分配给当前主目标。

## 数据与图片来源

学生、礼物、好感阈值、制造数据和部分中文名称以 [SchaleDB](https://schaledb.com/) 数据为基础。中文字段使用 SchaleDB CN 区域数据，学生头像、礼物图标、反应脸和部分 UI 素材来自 SchaleDB 公开资源并缓存于本地。各 JSON 快照的时间、版本和来源 URL 记录在 `source` 字段与 `assets/manifest.json` 中。

项目参考了 [arona.icu](https://arona.icu/) 的库存 JSON 导入/导出、养成规划和资源管理交互，并保留相应格式兼容能力。参考关系不代表合作、授权或从属关系。

国服资源还使用官方公告、中文社区资料和玩家提供的规划设置。每项数据都保留来源和适用范围；页面允许修改可配置的玩家输入值。

详细字段说明见 [`relationship_data/README.md`](relationship_data/README.md)。

## 本地数据与隐私

库存、规划、语言和部分页面设置保存在浏览器本地。项目采用本地运行方式，个人库存留在浏览器本地。启用 Agent 后，发送给模型服务的数据范围见上方 Agent 说明。

使用 Agent 时，API Key 仅进入本机 Harness 进程内存。分享项目或提交代码前，请检查仓库内容，确保个人库存 JSON、日志、截图和其他凭据保持在项目外。

## 开发与测试

```bash
for test in js/*.test.mjs; do node "$test"; done
python3 -m unittest -v test_harness_server.py
python3 -m py_compile generate_dashboard_assets.py harness_server.py test_harness_server.py
git diff --check
```

## 更新学生与礼包数据

仓库内置独立更新脚本，不需要配置 Agent 或 API Key：

```bash
# 联网检查 SchaleDB 与国服官网，只显示差异
python3 scripts/update_data.py

# 校验通过后写入快照，并下载新增学生所需图片
python3 scripts/update_data.py --apply --with-assets
```

学生、礼物、制造结果、日服上线顺序和三语名称会一起生成并交叉检查。学生或礼物 ID 减少、制造结果缺少学生、礼物表不完整、三语名称缺失时，脚本会停止写入。

国服礼包从官网公开新闻接口发现。脚本会解析礼包名称、内容、价格、限购和购买时间；新公告写入 `relationship_data/paid_packages_cn_candidates.json` 等待检查。确认物品 ID 和适用学生后，再加入正式的 `paid_packages_cn.json`，因此网页不会直接采用尚未检查的公告解析结果。

GitHub Actions 每天检查一次，也可在 Actions 页手动运行。只有数据发生变化时才会更新 `data/automated-refresh` 分支并创建 Pull Request。

主要目录：

```text
index.html                         页面入口
styles.css / agent.css             工作台与 Agent 样式
js/                                状态、计算、视图和测试
relationship_data/                 国服数据快照与来源
scripts/update_data.py              学生与礼包数据更新入口
assets/                            学生、礼物、反应脸和 UI 图片缓存
harness_server.py                  本机页面服务器与 Agent 代理
generate_dashboard_assets.py       生成本地图片清单
```

欢迎提交问题、国服数据修正和功能改进。涉及数据时，请附上服务器、版本、来源链接或游戏内截图。

## 开源协议和第三方内容

本项目自行编写的 HTML、CSS、JavaScript、Python、测试代码和文档代码采用 [MIT License](LICENSE) 发布。

仓库中的游戏数据、角色内容、图片、图标、文字、美术和商标由相应权利人保留权利。SchaleDB、arona.icu、Kivo Wiki 和国服官网的来源、快照时间及使用边界见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。MIT License 仅适用于本项目自行编写的代码和文档。

本项目不代表任何官方机构，也不保证数据与游戏当前版本始终一致。公开部署或再分发缓存素材前，请自行核对相关来源的服务条款和权利要求。
