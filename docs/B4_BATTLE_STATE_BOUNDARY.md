# B4 → #14 人物状态 / 战斗共享边界

基线：`jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`，原战斗脚本 `JY3/script/04_program/p_battle.lua`。

## 结论

人物成长只有一份权威状态：原 Lua 对象。Web 层只负责渲染、输入和当前简化战斗壳的临时显示，不持有可写的人物成长副本。

| 状态 | 权威对象 | B4 / Web 读取方式 | p_battle 主要读写 |
| --- | --- | --- | --- |
| 主角基础属性、等级/经验、HP/MP、状态 | `o_body / 0x10030001` | `G.QueryName(0x10030001)`、`get_point/set_point/add_point` | 高频 `get_point`；战斗内直接 `set_point/add_point` |
| 队伍编成 | `o_teammate / 0x10110001` | 1..12 槽位 | 决定我方参战角色；Web 不再提供 JS-only join fallback |
| 队友属性、经验、HP/MP、状态、好感 | `o_role / 0x10040000 + role id` | `get_role/set_role/add_role/add_exp` | 高频 `get_role`；直接 `set_role/add_role/add_exp` |
| 主角武功熟练度/等级/修为 | `o_skill / 0x10050000 + skill index` | B4 人物面板直接读取原对象 | `add_magicexp`、`逻辑整理-武功等级` 等 |
| 队友武功 | 对应 `o_role` 武功槽及熟练度字段 | B4 队友面板直接读取角色对象 | `get_npcskill`、`逻辑整理-NPC武功等级` |
| 好感 | `o_role['9']` | `get_love/add_love/set_love` | 战斗脚本存在 `get_love(248)` 判定 |
| 存档 | 上述原 Lua 对象图 | `save_state.lua` 追踪 `G.QueryName/DBTable` 后序列化 | 战斗产生的 mutation 必须落回同一对象图 |

## p_battle 对 B4 状态的直接依赖

对固定上游脚本做静态核对后，`p_battle.lua` 中最主要的人物状态调用包括：

- `get_point` 324 次、`set_point` 42 次、`add_point` 29 次。
- `get_role` 171 次、`set_role` 66 次、`add_role` 44 次。
- 战后直接调用 `add_exp` 给角色经验，调用 `add_magicexp` 增加主角武功熟练度。
- 主角战斗状态会写入 81..100、240/241、250/251 等状态/持续时间字段，并直接修改 44/46/47/48 等生命、内力、伤害/怒气相关字段。
- 队友/敌方角色会直接修改角色字段 14/15（战斗内力/生命）以及 81..100、240/241、250/251 等状态字段。

因此 #14 接入完整战斗时，不应创建新的 player/team/skill 战斗持久对象；战斗 UI 只能引用或快照展示原 Lua 状态，最终 mutation 必须写回上述原对象。

## 当前简化 battle shell 约束

当前 `src/app.js` 中的 `battleState` 只允许保存显示层临时值（`displayPlayerHp/displayEnemyHp/enemyName`）和最后一次结果。它不能写 `state.points/items/team`，也不能在战斗结束时把临时 HP 覆盖到原 Lua。

`lua/gf_web.lua` 的 `call_battle` 只负责把结果回传给原 Lua 协程。队伍加入和武功学习如果没有原 Lua API，不再退化成 JS-only mutation；缺失调用应暴露出来，而不是制造第二份状态。

## #14 需要复用的 B4 边界

1. 主角、队友、武功、好感继续使用 B4 已接入的原 Lua 对象，不重新建人物模型。
2. 战斗初始化从 `o_body/o_teammate/o_role/o_skill` 读取；战斗结算直接通过原 API/对象写回。
3. B4 人物面板继续作为战后验收面板：战斗返回后刷新即可看到 EXP、HP/MP、熟练度和状态变化。
4. save-state 继续序列化同一对象图，不额外保存 Web battle shell 的临时血条。
5. #14-1 只负责让 `p_battle.lua` 全量归一化编译并补 API 缺口；不要复制 B4 已完成的人物成长规则。
