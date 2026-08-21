# 好感知识页重构实施计划

## 任务 1：补充速查数据与礼物视觉锚点

**验收：** 渲染结果包含 1→100、99→100、金色礼物最高值；缺失数据不抛异常；代表礼物图标有本地 fallback。

**文件：** `js/knowledge-view.js`、`js/knowledge-view.test.mjs`

## 任务 2：重排知识页结构与折叠层级

**验收：** 首屏按速查、礼物、日常顺序展示；完整等级表和数据说明默认折叠；中英日键值齐全。

**文件：** `js/knowledge-view.js`、`js/i18n.js`

## 任务 3：调整响应式样式并做浏览器验收

**验收：** 1440px、768px、390px 无横向溢出；控制台无错误；截图确认页面不再窄列空旷。

**文件：** `styles.css`

## 检查点

- `node --test js/knowledge-view.test.mjs`
- `node --test js/*.test.mjs`
- 中文、英文、日文页面截图与控制台检查
- `git diff --check`
