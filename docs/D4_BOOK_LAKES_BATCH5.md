# D4-5E 神雕 / 笑傲连续主线 + 聚贤庄第五批复杂任务

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本批继续直接执行原 `p_book_story.lua` 与 `p_lakes_notice.lua`，不复制剧情状态机，不增加单剧情 Web 特判。

## 1. 《神雕侠侣》

保持同一个 `0x101c000a` 天书对象连续执行：

```text
流程 0
→ 杨过两场战斗
→ 打狗棒法好友武功变化
→ item 342 +1
→ 程英 role 391 入队
→ 流程 = 1

流程 1
→ 杨过 + 程英战斗
→ role 405 属性满足原条件后入队
→ 流程 = 2

流程 2
→ 昆仑山战斗
→ 杨过头像变更
→ 流程 = 3

流程 3
→ 襄阳战斗
→ role 405 仍在队
→ 完成 = 1
→ 完美 = 1
```

验证了程英入队、好友武功、item 342、角色属性判断、头像变更和跨阶段队伍状态持续。

## 2. 《笑傲江湖》

保持同一个 `0x101c0008` 天书对象：

```text
流程 0
→ 战斗费彬
→ item 259 笑傲江湖曲谱 +1
→ 流程 = 1

流程 1
→ 绿竹巷
→ 任盈盈好友武功 skill 242
→ 流程 = 2

流程 2
→ 林家老宅两场战斗
→ 岳不群 skill 34
→ 流程 = 3

流程 3
→ 少林寺战斗
→ 任盈盈 / 令狐冲获得冲盈剑法 skill 243
→ 流程 = 4

流程 4
→ 完成 = 1
→ 完美 = 1
```

覆盖 battle / item / friend skill 的连续状态持续，并验证正常分支 item 93 在完美路径下不会误发。

## 3. 聚贤庄：三件礼物

同一条原任务分别覆盖两个合法菜单结果。

共同前半段：

```text
任务完成 / 进度 18 完成
→ 连续 4 场战斗全部胜利
→ 进入打狗棒处理菜单
```

分支 A：归还打狗棒

```text
menu = 1
→ 丐帮好感增加
→ 善恶点变化
→ team_full = false
→ 郭襄好感 > 70
→ role 39 郭襄入队
```

分支 B：私吞打狗棒

```text
menu = 2
→ 善恶点下降
→ item 59 打狗棒 +1
```

因此同一条“三件礼物”任务回归覆盖了连续多战斗 + menu，并分别验证 team 与 item 两种原菜单结果。

## 4. 聚贤庄：擂鼓山棋局

选择合法的“玩家本人破珍珑棋局”路径：

```text
任务完成 / 进度 37 完成
→ 战斗丁春秋
→ set_note
→ 指令_重铸
→ 玩家身份变更为逍遥派掌门
→ item 261 七星宝戒 +1
→ learnmagic 148
→ learnmagic 236
→ set_magic_lv(236, 5)
→ set_magicexp(236, 999)
→ learnmagic 248
→ learnmagic 129
→ 指令_存储属性
→ 出师-增加被动
```

同时验证保存属性 217/218 向 44/46 的原数据转移。

## 5. 新增回归

- `tools/smoke-book-fifth-batch.mjs`
- `tools/smoke-lakes-fifth-batch.mjs`

CI 同时加入：

- source smoke
- offline dist smoke

## 6. CI

天书接入 CI：

- run #670 / `35501849445`
- 结果：success

第五批完整功能 CI：

- run #672 / `35501918584`
- 结果：success

其中确认：

- fifth-batch book source PASS
- fifth-batch lakes source PASS
- fifth-batch book offline PASS
- fifth-batch lakes offline PASS
- disconnected runtime PASS
- offline HTTP smoke PASS
- 既有战斗 / 门派 / 天书 / 聚贤庄 / 五小游戏回归继续通过

## 7. 当前结果

D4-5E 已完成：

- 《神雕侠侣》连续 0 → 1 → 2 → 3 → 完美完成；
- 《笑傲江湖》连续 0 → 1 → 2 → 3 → 4 → 完美完成；
- “三件礼物”覆盖 4 连战以及两个菜单结果；
- “擂鼓山棋局”覆盖玩家重铸、掌门身份、物品与多武功传承；
- source / offline 全量 CI 通过。

下一批继续收剩余天书主线和复杂支线，并逐步转向“从新建角色到主要结局”的连续长流程。
