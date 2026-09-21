# E5 固定回归样本与 Snapshot 基线

更新时间：2026-09-21

## 目标

E5 的目的不是把测试输出全部冻结，而是把“影响原版行为判断的输入和关键结果”集中到一个版本化数据集，避免：

- 开局答案在不同测试里各写一份；
- 随机战斗只判断“能打完”，却不知道数值已经漂移；
- 地图/商店/小游戏的关键结果改变后，CI 仍然因为宽松断言而通过；
- 升级固定上游或 Web runtime 时，不知道哪些 snapshot 需要重新审阅。

统一数据集：`tools/regression-snapshots.json`。

## 固定版本

- 固定原版上游：`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`
- 当前 Web package/runtime 基线：`0.1.0`
- snapshot schema：`1`
- dataset：`e5-v1`

`tools/validate-regression-snapshots.mjs` 会在 CI 中检查 snapshot 的 upstream revision 与 `src/upstream.js` 一致、packageVersion 与 `package.json` 一致。

## 当前结构化 Snapshot

### 开局

- 固定 15 个问答选择。
- 14 次 menu。
- 37 次 UI yield。
- 最终进入固定牛家村地图状态。
- 同一份答案同时被 opening smoke、D4 长流程和真实浏览器 E2E 使用。

### 地图

- 牛家村默认可见热点数与隐藏后热点数。
- 世界地图初始可见城市数、解锁后城市数。
- 华山事件记录。
- 世界地图、牛家村、聚贤庄关键 map id。

### 商店

- 最大购买数量。
- 固定价格/数量样本与购物车总价。

### 战斗

固定随机种子 `20260918`，锁定最小原版战斗的关键结果：

- 3 次攻击。
- 总伤害 739。
- EXP：0 → 20。
- MP：5000 → 4675。
- 武功熟练度：100 → 110。
- scheduler：642 steps。
- battle result / enemy / skill 同时锁定。

这使战斗算法发生数值漂移时不再只靠“战斗成功结束”判断。

### 人物

固定人物投影样本：

- 姓名、称号、门派、身份、师父。
- HP / MP。
- 六项基本属性。
- 8 个装备槽。

### 存档

- 当前 schemaVersion。
- legacy schemaVersion。
- `slot1 / slot2 / slot3 / autosave` 槽位集合。

### 五小游戏

只锁定稳定 gameplay 结果，不冻结无意义动画内部细节：

- 伐木：进度与木材奖励。
- 采矿：单次进度和至少一个矿石奖励。
- 钓鱼：进度、贝壳、鱼饵消耗、积分。
- 打猎：捕获物品、得分、总分、进度。
- 押宝：玩家/庄家本金、下注后金额、固定骰子结果后的结算和成就进度。

## CI 消费者

以下回归必须读取 `regression-snapshots.json`：

- `smoke-original-opening-flow.mjs`
- `e2e-core-flow.mjs`
- `smoke-d4-long-flow.mjs`
- `smoke-map-runtime.mjs`
- `test-shop-model.mjs`
- `smoke-battle-1v1.mjs`
- `smoke-person-profile.mjs`
- `test-save-store.mjs`
- `smoke-logging-ui.mjs`

validator 会检查这些消费者没有脱离共享数据集。

## Snapshot 更新规则

正常功能修改不应顺手更新 snapshot 来“让 CI 变绿”。

只有以下情况允许更新：

1. 固定 upstream revision 有意升级；
2. 原版行为核对后确认旧 snapshot 本身错误；
3. runtime 版本升级且行为变化已经明确评审；
4. 新增一个需要长期锁定的核心行为样本。

更新时必须先查看 CI 差异，确认变化是预期行为，再修改 `regression-snapshots.json`。禁止在同一提交里既修改算法又无说明地同步改掉所有期望值。

## 与后续阶段的关系

- E6 / #25：把运行时诊断信息做成页面内开发者模式。
- E7 / #27：把目前 package/runtime 基线升级成正式 runtime/build/save 版本协议。
- E8 / #18：视觉 snapshot / 原版截图对照属于视觉验收，不混入当前行为数据集。

E5 负责的是**行为可重复、差异可定位**；视觉像不像原版仍由 E8 单独验收。
