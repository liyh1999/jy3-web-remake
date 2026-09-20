# D4-3 基础世界与剧情运行时

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

D4-3 的目标不是把城镇/任务分支重新写进 JavaScript，而是让原 `04_program` 的基础世界程序拥有和桌面版相同的长期程序、事件广播和前台剧情挂起/恢复能力。

## 1. 基础剧情程序族

`src/upstream.js` 中新增独立的 `BASE_STORY_PROGRAMS`：

- `p_event.lua`
- `p_dialogue_system.lua`
- `p_citymap_system.lua`
- `p_task.lua`
- `p_story-town or city.lua`

`prepareStoryRuntime()` 会加载原对话 UI/runtime 和上述基础剧情程序，但不会因为进入剧情而顺带加载 `p_battle.lua` 或所有 `p_school_*.lua`。

正常 boot 会预加载这一基础程序族；原对话 UI 仍保留显式启用边界，兼容 Web fallback，避免一次切换过多界面造成启动回归。

## 2. 后台剧情 program runtime

原 `p_init.lua` 会启动多个长期程序：

- `地图系统_初始化地图系统`
- `地图系统_事件响应`
- `地图系统_小游戏`
- `地图系统_人物`
- `地图系统_聚贤庄任务`
- `地图系统_功能`
- `地图系统_提示`

早期 Web 兼容层里的 `G.start_program / wait_case` 在普通剧情下是 no-op，因此地图虽然能显示，原后台监听并没有真正运行。

D4-3 新增 `lua/story_program_web.lua`，继续复用 `lua/program_runtime.lua`，不另造一套调度器。它负责：

- `G.start_program / stop_program / remove_program`
- `G.wait1 / G.event_info`
- `G.case / G.wait_case`
- `G.wait_time`
- 浏览器 timer pump / cancel
- runtime reset 清理

同一个程序重复 `start_program` 不会创建第二个协程。

## 3. 事件 payload

共享 `program_runtime` 现在保存事件 payload。

例如原 `p_citymap_system.lua`：

```lua
G.wait1("点击城市事件")
city, info = G.event_info()
```

Web runtime 会保留两个对象，而不是只保留事件名。

`minigame_web.lua` 和 `battle_web.lua` 的 `G.trig_event(event_name, ...)` 也已改为透传参数，避免外层 wrapper 截断城市对象、选择 ID 等事件参数。

后台 scheduler 只在已有后台监听者时同步接收事件；前台 `__jy_run` 的事件队列保持原有语义，避免一个事件被无条件复制成后台残留 signal。

## 4. 原事件路由

基础世界链路现在可以按原程序运行：

```text
p_event.lua
  地图事件_逻辑处理
       ↓ G.trig_event("城镇-渡口")
p_person.lua
  地图系统_人物 / G.wait_case()
       ↓
G.call("城镇-渡口")
       ↓
p_story-town or city.lua
```

同样的 dispatcher 也继续承载：

- 牛家村 NPC 事件
- 各门派事件
- 城镇事件
- 地图打猎/砍柴/钓鱼
- 聚贤庄等后续事件

## 5. 前台剧情跨系统恢复

前台剧情仍使用同一个 `gf_web` active coroutine。

自动回归已覆盖：

```text
talk
  ↓
menu
  ↓
original battle
  ↓
original mini-game
  ↓
parent story continues
```

选项 ID、战斗结果和小游戏结果都会回到同一个父剧情协程；不是在 JavaScript 中复制剧情状态机。

## 6. 原剧情实跑

当前固定回归直接执行 upstream Lua：

### `p_story-town or city.lua`

- `城镇-渡口`：选择“哪里也不想去”，回世界地图。
- `城镇-无量山洞`：已访问后的段誉/神仙姐姐回访分支，结束后回世界地图。

### `p_task.lua`

- `门派-青城派`：已征服后的太上掌门月度回访分支。
- `门派-恒山派`：玩家已为掌门的直接回访分支。

这些路径在测试中仍执行原函数；仅对外部世界状态/API 做可控 fixture。

## 7. 初始化与长期监听回归

`smoke-init-story-programs.mjs` 直接执行原 `p_init.lua::初始化`，验证：

- 城市点击监听器真实启动并停在 `wait1("点击城市事件")`。
- `地图系统_提示` 真实停在 `wait_case`。
- `提示结束` 会进入原 300 ms 分支。
- reset 后 program/timer 不残留。

`smoke-person-event-dispatcher.mjs` 验证：

- `城镇-渡口` 事件进入对应原剧情 API。
- `地图打猎` 进入 hunting，原逻辑追加 4 小时，并继续监听后续事件。

`smoke-map-event-routing.mjs` 再验证 `p_event → p_person` 的端到端广播/消费。

## 8. offline 发布

基础剧情 smoke 支持直接运行：

- `dist/lua`
- `dist/vendor/upstream/JY3/script/04_program`

因此 CI 不只是检查文件存在，而是构建后再次执行原基础剧情分支。

## 9. D4-3 结论

D4-3 完成后，基础世界已经具备：

- 独立剧情 program family loader；
- 原 notify / 原对话 runtime；
- 普通剧情长期 program scheduler；
- 多参数事件广播；
- `p_event → p_person → 原剧情 API` 路由；
- talk/menu/battle/minigame 同父协程恢复；
- offline dist 实跑。

后续 D4-4 开始按门派程序建立真实的入门、日常、关键战斗、奖励与出师路径，不再需要先补一套新的通用剧情调度基础。
