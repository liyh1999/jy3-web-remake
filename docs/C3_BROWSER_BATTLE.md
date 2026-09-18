# C3 浏览器原战斗桥

## 目标

C2 已证明固定上游 `p_battle.lua` 的最小 1v1 full-flow 能在 Lua 5.3 下运行。C3-1 把同一套原状态机接到浏览器战斗壳，不增加第二份持久人物状态。

固定上游：

`jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

## 浏览器调用链

原剧情仍然调用：

```text
G.call("call_battle", ...)
```

Web 兼容层现在执行：

```text
gf_web.lua
  -> JYWeb.startOriginalBattle(...)
  -> JYUpstream.prepareBattleRuntime()
       -> 注册 o_battle / o_notebook
       -> 加载 p_battle.lua
  -> __jy_battle_browser_start(...)
  -> 原 p_order.lua / call_battle
  -> 原 p_battle.lua 子程序
  -> __jy_battle_browser_pump()
  -> battleSlot / battleStatus / battleEffect
  -> 原胜负结算
  -> originalBattleFinished(result)
  -> 恢复原剧情 coroutine
```

因此不要求用户手工在控制台调用 `prepareOriginalBattle()`。

普通 `bootstrapData()` 仍不加载 `p_battle.lua`；只有真正遇到 `call_battle` 才按需准备。

## Browser scheduler

`lua/battle_web.lua` 的 browser mode 复用 C2 已验证的事件语义：

- `G.case / G.wait_case`
- `G.wait1`
- `G.wait_time`
- `G.trig_event`
- `G.start_program / remove_program`
- `G.noti_call`

浏览器模式用小步异步 pump 推进，不在一次 JavaScript 调用里跑完整场战斗，避免阻塞主线程。

当前 browser mode 实际启动：

- `集气`
- `战斗对话1`
- `战斗对话2`
- `异常显示`
- `战斗系统_事件响应`
- `战斗系统_主角监控`
- `战斗系统_胜负监控`

C3-1 先以自动战斗验证浏览器表现层与完整原状态机。C3-2 已接入手动武功、目标、物品、自动切换和逃跑输入。

## Web v_battle

`src/battle.js` 只保存显示快照，不写 localStorage/sessionStorage，也不作为游戏状态源。

11 个原战位：

- `team1..team5`
- `enemy1..enemy6`

每个战位显示：

- 名称 / role id
- 当前 HP / 最大 HP
- 当前 MP / 最大 MP
- 原 `map.<position>.x` 对应的集气进度
- 存活 / ready / 受击表现

全局显示：

- 战斗时间
- 怒气
- 当前武功
- 异常状态
- 胜负结果
- 基础伤害飘字 / 受击反馈

## 状态所有权

战斗 UI 不维护可持久化 HP、MP、EXP 或武功熟练度。

权威状态仍是：

- 主角：`o_body / 0x10030001`
- NPC：`o_role / 0x10040000 + id`
- 武功：`o_skill / 0x10050000 + index`
- 战斗编成：`o_battle / 0x10150001`

`G.noti_call("战场_效果", ...)` 的兼容实现只负责替代缺失的 Flash 动画回调时机，并将已经由原 `magic_power1/2/3` 算出的伤害落到上述原对象一次。

## 回归

`tools/smoke-battle-1v1.mjs` 现在执行两遍固定 1v1：

1. C2 headless full-flow。
2. C3 browser scheduler full-flow。

browser scheduler 回归验证：

- 原 `call_battle`
- 原 `集气`
- 原主角/事件监控
- 原 `magic_power1`
- 原胜负监控
- `battleBegin / battleSlot / battleStatus / battleEffect / battleEnd`
- EXP 增加
- MP 消耗
- o_skill 熟练度增加
- 战斗结束回调

`tools/check-c3-browser-battle.mjs` 额外固定浏览器桥和状态边界，防止以后退回 JS 随机扣血式战斗。

## C3-2 输入桥

浏览器输入继续以固定上游 `c_battle.lua` 为协议，不建立新的战斗规则。

### 武功 1–8

来源：`o_hotkey / 0x100c0001` 的槽位 `1..8`。

点击或按数字键后：

- 写 `代码.team1.text = skill_id - 0x10050000`。
- 范围 0/1：按原逻辑检查辅助武功 MP，触发 `主角准备`。
- 范围 2：写 `代码.team1.id/min` 与 `单目标`。
- 范围 3：按原横排映射写 `横目标`。
- 范围 4：按原纵列映射写 `纵目标`。
- 范围 5：不伪造目标，直接进入原 `主角准备`。
- 第 8 槽沿用原怒气 >= 100 门槛，并由原规则清怒气。
- 暗器武功沿用原 `body[198]` 装备条件。

目标点击只写上述原 UI 字段并发送原事件 `选择攻击目标 / 选择目标`，实际伤害仍由 `p_battle.lua` 计算。

### Q/W/E/R 物品

来源：`o_hotkey` 槽位 `11..14`。

输入写：

- `状态 = 2`
- `代码.team1.text = item_id - 0x100b0000`
- 触发 `主角准备`

随后由原 `use_item` 扣数量、加 HP/MP/解状态；Web 不直接修改物品或人物属性。

### 自动与逃跑

- 自动开关直接写 `G.misc().自动战斗`。
- 手动模式不自动生成攻击；集气和 `战斗状态` 按原监控程序推进。
- 逃跑只发送原 `逃跑` 事件；是否允许逃跑由 `o_battle.逃跑` 决定，允许时原脚本写 `body[235] = 2`。

键盘最低可用输入：

- `1..8`：武功
- `Q/W/E/R`：物品
- `A`：自动战斗开关
- `Escape`：逃跑

### 多目标伤害语义

C3-2 回归发现横排动画目标可能使用 12/14 等“动画位置”，不能直接拿该编号当受击角色。

因此 Web `战场_效果` 兼容实现已改为和原 `通用_战斗飘字` 一致：扫描 11 个 `hurt.<position>.减生命.visible`，只对被原脚本标记的节点落血。这样单体、横排、纵列和全体共用同一原伤害结果，不会重复计算伤害。

## C3-2 回归

固定 Lua 5.3 regression 现在覆盖：

- 自动 1v1。
- 手动关闭自动 → 数字键槽位武功 → enemy1 → 胜利。
- 范围 3 横排。
- 范围 4 纵列。
- 范围 5 全体。
- 暗器武功缺少 `body[198]` 时禁用。
- 第 8 武功槽怒气不足时禁用。
- Q 槽真实物品经原 `use_item` 消耗数量并恢复 HP。
- 原逃跑事件返回 result=2 / `body[235]=2`。

静态门禁：`tools/check-c3-battle-input.mjs`。

## C3 后续

## C3-3 表现桥

C3-3 不改变战斗规则，只把原 Lua 已经产生的表现字段投影到浏览器。

### 战斗对话

原 `战斗对话1 / 战斗对话2` 继续运行，写：

```text
talk.<position>.text
talk.<position>.visible
```

`battle_web.lua` 在每次 browser pump 后读取这些节点并发送 `battleDialogue`。Web 在对应战位上方显示短对白气泡；隐藏时只隐藏气泡，不改变原程序。

### 异常状态

原 `异常显示` 的 `yc.y1..y4` 仍按原时序运行。

Web 同时只读投影原权威对象里的状态字段：

- 81 中毒
- 82 麻痹
- 83 晕眩
- 84 内伤
- 85 受伤
- 86 减速
- 87 混乱
- 88 致盲
- 89 御风
- 90 剧毒
- 241 强伤

主角读取 `o_body`，NPC/队友读取对应 `o_role`。持续时间继续来自 91..100 / 251 等原字段。Web 只显示，不写回状态。

### 动作与武功效果

原 `tab.<position>.frameActionID(...)` 映射为战位动作反馈：

- 出手：短位移动画
- 受击：已有 impact 动画
- 9001 / 9002：逃跑/失败等 down 状态

原 `flash.<position>.frameActionID(...)` 映射为最低可用武功闪光反馈；`all1/all2/all3` 和全局图标节点也不会阻塞。

`G.noti_call("战场_效果", ...)` 进入 Web 时还会读取当前 `代码.<position>.text` 对应的原 `o_skill.名称`，同步 `图表.文字` 并显示短暂武功名。伤害仍只使用原 hurt-node 结果，表现回调不重新计算伤害。

### 战斗音频

通用音频底层已经由 `runtime_shims.lua -> JYResources.play/stop` 实现。

C3-3 的 `G.Play / G.Stop` 包装只做两件事：

1. 委托原有资源音频实现真实播放。
2. 额外通知战斗表现层当前 resource id / channel / loop，便于战斗 UI 和回归观察。

资源 ID 仍按原规则 canonicalize，例如 `0x4901xxxx` 会映射到 `audio/01/*.mp3`。浏览器 autoplay 拒绝由 `resources.js` 捕获 Promise rejection，只记 debug，不阻塞 Lua 战斗状态机。

### 状态边界

C3-3 Web JS 不允许调用：

- `add_point / set_point`
- `add_role / set_role`
- `magic_power*`

因此对白、状态标签、动作、武功名和音频都只是表现，不会重复应用战斗 mutation。

## C3-3 回归

`tools/smoke-battle-1v1.mjs` 在已有 C2/C3-1/C3-2 回归之外验证：

- battle dialogue projection 实际执行
- per-slot abnormal projection 实际执行
- 固定中毒状态能从原 `o_body` 投影到 Web
- actor action callback 实际触发
- skill effect/name callback 实际触发
- 原战斗 `G.Play` 实际经过 browser audio bridge
- 原战斗结束 `G.Stop` 实际经过 browser audio bridge

静态边界由 `tools/check-c3-battle-presentation.mjs` 固定。

## C3 后续

C3-3 完成后，#40 / C3 可进入总验收；更完整的帧动画/Spine 与通用音频深化继续分别归 #11 / #12。
