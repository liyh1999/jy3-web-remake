# D4-5A 天书主线 / 聚贤庄任务运行时

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

门派阶段完成后，D4-5A 把剩余两块大剧情程序从“只缓存/编译”推进到正常 Web boot 可调用：

- `04_program/p_book_story.lua`
- `04_program/p_lakes_notice.lua`

## 1. Runtime family

`src/upstream.js` 新增：

```text
BOOK_LAKES_PROGRAMS
  p_book_story.lua
  p_lakes_notice.lua
```

`prepareBookLakesRuntime()`：

1. 复用已经完成的 `prepareXingxiuXuedaomenRuntime()`；
2. 保留已经接入的 10 个门派；
3. 再加载天书主线与聚贤庄任务程序；
4. 不依赖 `p_battle.lua`；
5. 不把 `p_cheat_system.lua` 顺带加入正常剧情启动。

正常 Web boot 现在会在世界事件运行前把基础世界、10 个门派、天书和聚贤庄任务入口准备好。战斗仍然通过 existing original-battle bridge 按需进入。

## 2. 15 条天书入口执行基线

固定 upstream 的 `p_book_story.lua` 共注册 15 个 `天书_*` 入口：

- 飞狐外传
- 雪山飞狐
- 连城诀
- 天龙八部
- 射雕英雄传
- 白马啸西风
- 鹿鼎记
- 笑傲江湖
- 书剑恩仇录
- 神雕侠侣
- 侠客行
- 倚天屠龙记
- 碧血剑
- 鸳鸯刀
- 越女剑

自动回归不只做静态字符串检查，而是：

1. 加载经过当前 normalize 的原 `p_book_story.lua`；
2. 确认 15 个入口全部注册到 `G.api`；
3. 为每一本书构造原版安全前置条件；
4. 逐个通过 `__jy_run()` 真正启动；
5. 让原脚本在“缺少必要队友 / 队伍已满”第一道条件处正常返回；
6. 要求 `__jy_missing_calls() == ''`。

这保证 15 个主线入口已经进入当前 runtime，而不是仅仅存在于 vendor 文件里。

## 3. 首条真实天书路径：越女剑

选择最短且条件稳定的 `天书_越女剑` 作为首条完整胜利路径。

测试直接运行原 Lua：

```text
流程 = 0
队伍未满
→ 进入无名冢
→ 原 call_battle
→ 胜利
→ 419 入队
→ 学习武功 249
→ 完成 = 1
→ 完美 = 1
→ misc.梦幻完成 = 1
→ 原 通用_存档 Web bridge
→ add_time(2)
→ 返回大地图
```

`通用_存档` 在 `gf_web.lua` 中属于平台副作用，由 Web compatibility layer 直接处理，所以 smoke 通过 missing-call 门禁验证该调用被桥接，而不是用测试 `G.api` 桩拦截它。

## 4. 聚贤庄任务 dispatcher

`p_lakes_notice.lua::地图系统_聚贤庄任务` 是一个长期 `wait_case` program，原脚本注册 47 个任务事件。

首批 dispatcher 回归验证两个事件：

```text
聚贤庄任务_爪下白骨
聚贤庄任务_阮姓何辜
```

测试流程：

```text
G.start_program("地图系统_聚贤庄任务")
→ status == case

trig_event(...)
→ browser pump
→ G.call(对应原任务)
→ 再次回到 wait_case
```

连续触发两个事件后 dispatcher 仍保持监听；reset 后 program 必须完整移除。

## 5. 首条真实聚贤庄任务：爪下白骨

选择短且无复杂前置剧情的 `聚贤庄任务_爪下白骨`。

为了让 CI 可重复，测试只固定原脚本使用的 `math.random` 返回下界，不修改业务逻辑：

```text
add_day(1)
→ 随机地图固定为 19
→ 原难度固定为 30
→ 梅超风 battle
→ 胜利
→ point 15 +1
→ 返回大地图
```

任务中的随机地图、难度和奖励仍然由原 Lua 的 `math.random` 调用决定；测试只是把随机源固定成确定输入。

## 6. Source / offline 双路径

CI 在源码环境直接执行：

- 15 条天书入口基线；
- 越女剑完整胜利路径；
- 聚贤庄长期 dispatcher；
- 爪下白骨完整任务。

构建 `dist` 后，再从：

```text
dist/lua
dist/vendor/upstream/JY3/script/04_program
```

重新执行完全相同的四条回归。

最终还继续执行整个 offline dist HTTP smoke，确保新剧情 program family 没破坏离线部署。

## 7. 当前阶段

D4-5A 完成后：

- 基础世界与城镇剧情 runtime 已接入；
- 10 个主要门派已接入；
- 15 条天书入口全部可执行；
- 聚贤庄 47 任务 dispatcher 已进入 browser runtime；
- 至少一条天书真实胜利路径已自动化；
- 至少一条聚贤庄真实战斗任务已自动化；
- source 与 offline dist 均有门禁。

后续 D4-5B 开始扩大天书各流程阶段、聚贤庄任务覆盖，以及跨任务/主线的连续流程回归。
