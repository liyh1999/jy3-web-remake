# D4-5B 天书 / 聚贤庄任务第二批真实路径

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

D4-5B 在 D4-5A 已完成的天书/聚贤庄运行时基础上继续增加真实剧情路径，不增加新的 JS 业务状态机。

## 1. 天书《鸳鸯刀》

自动化选择原菜单第三项，直接挑战夫妻二人。

原路径：

```text
流程 = 0
→ menu 选择“还是我更厉害”
→ call_battle(409, 410)
→ 胜利
→ item 346 +1
→ item 343 +1
→ 完成 = 1
→ 完美 = 1
→ add_time(2)
→ 返回大地图
```

这条路径覆盖原 menu、双敌 battle、物品奖励与完美完成状态。

## 2. 天书《雪山飞狐》

首批选择流程 0 的苗人凤比武胜利路径：

```text
胡斐在队
→ set_team(5)
→ 与苗人凤战斗
→ 胜利
→ 检查胡斐是否已有苗家剑法
→ set_friend_skill(...)
→ item 143 +1
→ 流程 = 1
→ add_time(2)
→ 返回大地图
```

测试验证剧情确实从 0 推进到 1，而不是只验证战斗能启动。

## 3. 聚贤庄任务：四十二章经的秘密

构造原条件“八本经书全部持有”：

```text
item 246..253 各 1
→ add_day(1)
→ 进入密室
→ 检查 8 本经书
→ money +100000
→ 8 本经书全部扣除
→ 任务对象是否完成 = true
→ 进度列表[1].完成 = 1
→ 返回大地图
```

覆盖多物品条件、批量物品消费、金钱奖励和任务进度。

## 4. 聚贤庄任务：迷途的小和尚

选择非少林角色且队伍未满路径：

```text
add_day(1)
→ 进入悦来客栈
→ 非师弟特殊奖励分支
→ team_full == false
→ role 35 加入队伍
→ 任务对象是否完成 = true
→ 进度列表[36].完成 = 1
→ 返回大地图
```

这条路径补充了聚贤庄任务中的队伍加入行为。

## 5. Source / offline

新增：

- `tools/smoke-book-second-batch.mjs`
- `tools/smoke-lakes-second-batch.mjs`

两条 smoke 同时在源码和 offline dist 下运行。

功能提交 CI：

`35499666138`

结果：

- 第二批 book story source PASS
- 第二批 lakes source PASS
- 第二批 book story offline PASS
- 第二批 lakes offline PASS
- disconnected runtime PASS
- offline HTTP smoke PASS

## 6. 当前覆盖

当前真实自动化剧情已经包括：

- 15 条天书入口安全执行基线；
- 《越女剑》完整胜利；
- 《鸳鸯刀》完美胜利；
- 《雪山飞狐》第一阶段胜利；
- 聚贤庄长期任务 dispatcher；
- 爪下白骨；
- 四十二章经的秘密；
- 迷途的小和尚。

后续 D4-5C 继续进入多阶段天书流程、更多任务类型，以及跨剧情状态连续回归。
