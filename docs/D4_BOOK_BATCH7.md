# D4-5G 鹿鼎记 + 侠客行连续主线收口

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本批继续直接执行原 `p_book_story.lua`，收掉《鹿鼎记》和《侠客行》两条主要天书主线。

## 1. 《鹿鼎记》

主连续路径：

```text
流程 0
→ 丽春院 / 官兵战
→ 流程 = 1

流程 1
→ 皇宫战鳌拜
→ 天牢剧情
→ 流程 = 2

流程 2
→ 天地会
→ 战陈近南
→ set_friend_skill(13, 3, 124, 500)
→ 流程 = 3

流程 3
→ 战郑克爽
→ menu 选择“阉了郑克爽”
→ item 273 +1
→ 流程 = 5

流程 5
→ 郑王府最终战
→ 完成 = 1
→ 完美 = 1
```

额外回归原合法分支：

```text
流程 3
→ menu 选择“饶过郑克爽”
→ role 20 阿珂 join
→ 流程 = 4

流程 4
→ 韦小宝 + 阿珂组队战斗
→ 完成 = 1
→ 完美 = 0
```

因此同时验证了 battle / team / item / friend skill / menu / completion 状态，而不是只检查流程数字。

## 2. 《侠客行》

原 Lua 的代码分支顺序是 0、1、3、2、4，但运行时状态仍连续按：

```text
0 → 1 → 2 → 3 → 4
```

完整回归：

```text
流程 0
→ 石破天 role 402 join
→ 流程 = 1

流程 1
→ 雪山派战白自在
→ 流程 = 2

流程 2
→ 长乐帮战贝海石
→ item 262 赏善罚恶令 +1
→ 流程 = 3

流程 3
→ 战张三李四
→ item 262 再 +1
→ 流程 = 4

流程 4
→ 因 item 262 数量 > 1
→ item 238 腊八粥 +2
→ set_friend_skill(402, 2, 146, 500)
→ 战侠客岛龙木岛主
→ 完美 = 1
→ 完成 = 1
```

覆盖：

- 石破天持续在队；
- 两枚赏善罚恶令累计；
- 双令牌分支获得两碗腊八粥；
- 太玄经好友武功；
- 最终完美完成。

## 3. 新增回归

- `tools/smoke-book-seventh-batch.mjs`

CI 加入：

- seventh-batch source smoke
- seventh-batch offline dist smoke

## 4. CI

最终功能 CI：

- run #680 / `35502510199`
- 结果：success

确认：

- seventh-batch source PASS
- seventh-batch offline PASS
- sixth-batch 及此前全部天书回归继续通过
- 聚贤庄、门派、五小游戏继续通过
- disconnected runtime PASS
- offline HTTP smoke PASS

## 5. 当前结果

D4-5G 已完成：

- 《鹿鼎记》完整主线和阿珂替代分支；
- 《侠客行》完整主线；
- source / offline 全量 CI 通过。

当前主要天书中，只剩体量最大的《天龙八部》还没有做完整连续主线收口。
