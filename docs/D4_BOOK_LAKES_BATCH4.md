# D4-5D 剩余天书主线 / 聚贤庄复杂任务第四批回归

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本批继续直接执行固定上游 `p_book_story.lua` 与 `p_lakes_notice.lua`，重点验证多阶段状态持续，以及 menu / team / skill / story 等组合调用。

## 1. 《飞狐外传》

保持同一个 `0x101c0001` 天书对象连续执行：

```text
流程 0
→ 凤家大院连续战斗
→ 流程 = 1

流程 1
→ 苗人凤居 / 药王庄
→ 胡斐获得苗家剑法相关成长
→ item 143 +1
→ 流程 = 2

流程 2
→ 福康安府
→ 两场连续战斗
→ 胡斐 + 袁紫衣队伍
→ 流程 = 3
```

测试验证：

- 0 → 1 → 2 → 3 使用同一剧情对象；
- item 143 跨阶段持续；
- 好友武功交换只执行一次；
- 战斗次数连续累计；
- 流程 2 的胡斐 / 袁紫衣原队伍设置生效。

## 2. 《书剑恩仇录》

保持同一个 `0x101c0009` 天书对象：

```text
流程 0
→ 回族部落战斗胜利
→ 霍青桐 / 陈家洛入队
→ 流程 = 1

流程 1
→ 地牢救人
→ talk0 文泰来消息
→ 流程 = 2

流程 2
→ 六和塔战斗胜利
→ 完成 = 1
→ 完美 = 1
```

重点验证前一阶段加入的角色在后续阶段没有丢失。

## 3. 《射雕英雄传》

选择原 `get_point(8) == 6` 分支：

```text
流程 0
→ 皇宫 / 牛家村密室
→ 郭靖单人战斗
→ 流程 = 1

流程 1
→ 铁掌帮
→ 郭靖 + 黄蓉
→ 战斗胜利
→ 流程 = 2

流程 2
→ 铁掌山密洞
→ 战斗胜利
→ item 104 武穆遗书 +1
→ 完成 = 1
→ 完美 = 1
```

覆盖 `get_point` 条件、双人队伍、物品奖励与完美完成状态。

## 4. 聚贤庄：天王老子傲四方

自动选择“相助向问天”：

```text
任务完成 / 进度 33 完成
→ menu
→ 向问天加入战斗队伍
→ battle 胜利
→ item 254 黑木令牌 +1
→ set_story(18, 1)
→ set_note(...)
```

覆盖 menu + battle + item + story/note。

## 5. 聚贤庄：救治盲女

合法初始条件：游坦之 role 29 在队。

```text
任务完成 / 进度 26 完成
→ role 29 leave
→ role 19 join
→ battle 丁春秋
→ item 111 +1
→ learnmagic(3)
→ learnmagic(189)
```

覆盖队伍切换 + battle + item + 两项武功学习。

## 6. CI

新增：

- `tools/smoke-book-fourth-batch.mjs`
- `tools/smoke-lakes-fourth-batch.mjs`

最终功能 CI：

`35501519535` / run #667

结果：

- fourth-batch book source PASS
- fourth-batch lakes source PASS
- fourth-batch book offline PASS
- fourth-batch lakes offline PASS
- disconnected runtime PASS
- offline HTTP smoke PASS
- 全量 CI PASS

中间曾出现两类测试问题：

1. 射雕测试生成脚本中换行被误写为字面 `\n`，已修正；
2. 射雕合法初始条件漏设郭靖 role 37 在队，原剧情因此正常提前返回，已补齐测试初始状态。

两项均属于测试桩问题，没有修改产品剧情逻辑或增加单剧情 Web 特判。

## 7. 当前结果

D4-5D 已完成：

- 《飞狐外传》连续 0 → 1 → 2 → 3；
- 《书剑恩仇录》连续 0 → 1 → 2 → 完美完成；
- 《射雕英雄传》连续 0 → 1 → 2 → 完美完成；
- 聚贤庄复杂任务新增两条；
- source / offline 全量回归通过。

下一批继续覆盖剩余天书、复杂支线和随机事件，为最终“新建角色到主要结局”的连续长流程做准备。
