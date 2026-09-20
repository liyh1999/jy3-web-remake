# D4-5F 白马 / 碧血 / 倚天主线 + 飞狐最终收尾

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本批继续直接执行原 `p_book_story.lua`，补齐《飞狐外传》结局，并收掉三条中等长度天书主线。

## 1. 《飞狐外传》最终流程

此前 D4-5D 已连续覆盖 0 → 1 → 2 → 3，本批从同一原流程的 3 验证最终完美结局：

```text
流程 3
→ get_point(32) >= 100
→ 程灵素解毒
→ role 40 join
→ role 393 join
→ 完美 = 1
→ 完成 = 1
```

至此《飞狐外传》完整主线已经从流程 0 覆盖到最终完成。

## 2. 《白马啸西风》

这是本批专门覆盖的“无 battle 多阶段剧情”：

```text
流程 0
→ organ 机关成功
→ 流程 = 1

流程 1
→ 原 math.random 生成四位暗号
→ menu 开始猜测
→ input 输入正确暗号
→ 流程 = 2

流程 2
→ puzzle 成功
→ 计时器进入原完美分支
→ set_note
→ 流程 = 4

流程 4
→ role 396 join
→ money +100000
→ item 344 +1
→ 完成 = 1
→ 完美 = 1
```

测试固定 `math.random` 每次选择第一个剩余数字，因此原脚本生成 0/1/2/3，对应 numeric code 123；input 仍走原接口。

拼图计时使用 1000 秒，使原条件 `1800 - timer <= 600` 为 false，进入流程 4 完美奖励。最初测试误用了 1300 秒并正确进入流程 3，后修正测试条件，没有改原剧情逻辑。

## 3. 《碧血剑》

连续执行：

```text
流程 0
→ 皇宫剧情
→ 流程 = 1

流程 1
→ item 22 +1
→ 华山连续两战
→ 流程 = 2

流程 2
→ 战斗木桑
→ 原脚本 add_itme(245, 1)
→ 原脚本 add_itme(129, 1)
→ 完美 = 1
→ 完成 = 1
```

原脚本历史拼写 `add_itme` 没有修改；通用 runtime 已有 `add_itme → add_item` alias，本回归确认该兼容路径正常。

## 4. 《倚天屠龙记》

连续执行：

```text
流程 0
→ role 406 属性满足原条件
→ role 406 join
→ 战玄冥二老
→ 流程 = 1

流程 1
→ 灵蛇岛 / 波斯明教
→ 张无忌队伍战斗
→ set_friend_skill(4, 2, 245, 500)
→ 流程 = 2

流程 2
→ achievement progress 10 已完成
→ item 118 九阴真经 +1
→ item 104 武穆遗书 +1
→ role 28 join
→ role 406 仍在队
→ 完美 = 1
→ 完成 = 1
```

覆盖角色属性条件、队伍状态、好友武功、成就条件和双物品奖励。

## 5. 新增回归

- `tools/smoke-book-sixth-batch.mjs`

CI 加入：

- source sixth-batch book smoke
- offline dist sixth-batch book smoke

## 6. CI

最终功能 CI：

- run #677 / `35502222952`
- 结果：success

确认：

- sixth-batch book source PASS
- sixth-batch book offline PASS
- fifth-batch 及之前全部天书 / 聚贤庄回归继续通过
- 门派剧情继续通过
- 五小游戏继续通过
- disconnected runtime PASS
- offline HTTP smoke PASS

## 7. 当前结果

D4-5F 已完成：

- 《飞狐外传》最终完美结局补齐；
- 《白马啸西风》完整 0 → 1 → 2 → 4 → 完美；
- 《碧血剑》完整 0 → 1 → 2 → 完美；
- 《倚天屠龙记》完整 0 → 1 → 2 → 完美；
- source / offline 全量 CI 通过。

下一批主要剩余天书集中在《鹿鼎记》《侠客行》《天龙八部》，其中《天龙八部》原流程明显更长，继续单独拆批处理。
