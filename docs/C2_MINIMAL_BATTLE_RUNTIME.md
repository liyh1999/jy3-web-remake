# C2 最小原战斗运行时

对应 Issue #39 / #14-2。

目标不是提前实现完整战斗画面，而是在 Web/Fengari 环境里证明固定上游原 `p_order.lua + p_battle.lua` 的最小 1v1 状态机能够真实运行，并且所有战斗 mutation 继续落到 B4 已接入的原 Lua 对象。

## 运行边界

普通开局仍只加载 `CORE_DATA / CORE_PROGRAMS`。

显式调用：

```js
await window.JYWeb.prepareOriginalBattle()
```

才会：

1. 注册 `01_data/o_battle.lua`
2. 注册 `01_data/o_notebook.lua`
3. 加载 `04_program/p_battle.lua`
4. 打开原 `call_battle/get_battle` 路由

因此 C2 不会把尚未进入战斗的普通开局绑到战斗运行时。

## 原脚本实际执行链

C2 full-flow 自动回归执行的是：

```text
p_order.lua / call_battle
  -> G.addUI("v_battle")           headless UI surface
  -> p_battle.lua / 集气
  -> p_battle.lua / 战斗系统_主角监控
  -> p_battle.lua / 战斗系统_事件响应
  -> p_battle.lua / magic_power1
  -> G.noti_call("战场_效果", ...)
  -> 原 o_role / o_body mutation
  -> p_battle.lua / 战斗系统_胜负监控
  -> add_point(3, exp)
  -> body[235] = 1
  -> trig_event("战斗结束")
  -> p_order.lua / call_battle cleanup
```

战斗对话、异常状态显示动画、真实 Flash 节点动画暂不执行，留给 C3 表现层接入。

## Web 兼容层

`lua/battle_web.lua` 提供最小战斗调度语义：

- `G.case / G.wait_case`
- `G.wait1`
- `G.wait_time`
- `G.trig_event`
- `G.start_program`
- `G.stop_program / G.remove_program`
- `G.noti_call`
- headless `v_battle`
- headless `v_citymap_system_map`

调度器只管理协程、事件与无界面节点，不保存人物战斗属性。

### 固定上游兼容别名

`gf_web.lua` 对固定上游的三个拼写错误做兼容：

- `get_ponit -> get_point`
- `ser_point -> set_point`
- `ser_role -> set_role`

没有修改上游源码。

## 状态所有权

仍遵守 `docs/B4_BATTLE_STATE_BOUNDARY.md`：

- 主角 HP / MP / EXP：`o_body / 0x10030001`
- NPC / 队友 HP / MP / 状态：`o_role / 0x10040000 + id`
- 主角武功熟练度：`o_skill / 0x10050000 + skill offset`
- 队伍：`o_teammate / 0x10110001`
- 战斗配置：`o_battle / 0x10150001`
- 战斗文字记录：`o_notebook / 0x101a0001`

headless UI 不维护第二份可持久化人物状态。

## 自动回归

`tools/smoke-battle-1v1.mjs` 使用 Lua 5.3：

1. 加载仓库实际 `gf_web.lua / battle_web.lua / save_state.lua / person_web.lua`
2. 下载并归一化固定上游原数据、`p_order.lua`、`p_battle.lua`
3. 建立固定 1v1 fixture
4. 验证三个拼写兼容
5. 验证 `case / wait_case / trig_event`
6. 开启 full-flow headless 战斗
7. 验证原集气、主角监控和事件响应没有被跳过
8. 验证伤害大于 0
9. 验证原胜负监控写入 `body[235] = 1`
10. 验证原胜利经验进入 `o_body`
11. 验证 MP 消耗进入同一个 `o_body`
12. 验证武功熟练度进入同一个 `o_skill`
13. 验证 `magic_power1` 写入 `o_notebook`
14. 验证 save-state 导出/恢复后对象 identity 不变
15. 验证原人物面板 adapter 读取同一份战后 MP 和武功熟练度

CI 步骤名：

`Original minimal 1v1 battle state machine`

## C3 留项

C2 的 headless 节点只为了运行状态机，不是最终战斗画面。C3 需要把这些接口替换/绑定到真实 Web 表现：

- `v_battle` Canvas/DOM 结构
- 集气条视觉
- 玩家武功与目标输入
- HP / MP / 状态显示
- 战斗飘字
- 人物动作
- 武功动画
- 战斗对话
- 异常状态显示
- BGM / SFX

C3 不再需要重写伤害公式、胜负结算或人物状态模型。
