# 原 p_battle.lua API 缺口清单

固定基线：`jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`  
目标脚本：`04_program/p_battle.lua`（269,796 bytes）

本文件对应 #38 / C1。自动基线在 `tools/battle-api-baseline.json`，CI 运行 `tools/audit-battle.mjs`；上游调用数量或缺口发生变化时会直接失败并打印新快照。

## 结论

原战斗脚本共有 **45 个不同的 `G.call` 名称**：

- **39 个**已经由当前加载的原 `p_order.lua / p_init.lua / ...` 提供。
- **3 个**由 `p_battle.lua` 自己定义：`magic_power1 / magic_power2 / magic_power3`。
- **3 个**是固定上游源码中的拼写错误，需要 C2 做兼容别名：
  - `get_ponit` → `get_point`，2 次。
  - `ser_point` → `set_point`，4 次。
  - `ser_role` → `set_role`，6 次。
- 除这三个拼写兼容外，**没有未归属的 G.call 名称**。

所以 C2 的主要难点已经不是“补几十个规则 API”，而是战斗调度、UI 对象和异步事件语义。

## 直接 G.* 运行时依赖

当前 Web 已存在方法名：

`QueryName(364)`、`misc(60)`、`getUI(32)`、`remove_program(28)`、`trig_event(19)`、`wait_time(13)`、`start_program(10)`、`wait1(3)`、`Play(2)`。

其中不少目前仍是薄兼容/no-op，C2 不能仅以“方法存在”视为状态机已经可运行。

当前完全缺少的直接方法：

- `G.noti_call`：20 次。
- `G.case`：10 次。
- `G.wait_case`：3 次。

这三个列为 C2 第一批运行时 API。

## 战斗数据对象

固定 QueryName 前缀/对象访问次数：

- `0x10150001`：75 次，对应 `o_battle`，当前开局不会加载。
- `0x10040000 + role`：56 次，`o_role`，B4 已接入。
- `0x10050000 + skill`：28 次，`o_skill`，B4 已接入。
- `0x10030001`：21 次，`o_body`，B4 已接入。
- `0x100c0001`：7 次，现有核心数据已覆盖。
- `0x101a0001`：3 次，对应 `o_notebook`，当前开局不会加载。
- `0x10160000 + slot`：2 次，对应现有 `o_files`。

因此 C1 已将以下数据改为 **离线缓存但不随开局注册**：

- `01_data/o_battle.lua`
- `01_data/o_notebook.lua`

C2 启动原战斗前按需注册这两张表。

## UI / 程序调度依赖

`G.getUI`：
- `v_battle` 28 次。
- `v_citymap_system_map` 4 次。

启动的战斗子程序：
- `集气` 4 次。
- `战斗对话1` 3 次。
- `战斗对话2` 3 次。

移除/停止路径还涉及：
`异常显示`、`战斗系统_事件响应`、`战斗系统_主角监控`、`集气`、`战斗对话1/2`。

C2 至少需要一个 headless/minimal `v_battle` 兼容对象，以及能让 `start_program/remove_program/trig_event/wait_time/wait1/case/wait_case` 真正推进状态机的最小调度器。C3 再替换为完整战斗 UI、动画和音效。

## G.misc 战斗字段

战斗脚本直接依赖：
`战斗状态`、`范围无双`、`战斗结果`、`自动选择`、`修改锁定检测_5`、`选择目标`、`加血阈值`、`吃药次数`、`行动序号`、`经验开关`、`难度`、`队友AI`、`自动战斗`、`木桩`。

C2 测试 fixture 必须显式初始化这些字段，避免 nil 被误当成兼容成功。

## C2 第一批任务

1. 加载已缓存的 `o_battle / o_notebook / p_battle.lua`，不改变普通开局启动链。
2. 添加三个固定上游拼写别名：`get_ponit / ser_point / ser_role`。
3. 实现 `G.case / G.wait_case / G.noti_call` 的最小战斗语义。
4. 将当前 `start_program/remove_program/trig_event/wait_time/wait1` 从占位升级为可推进战斗协程的最小调度器。
5. 提供 headless `v_battle` 对象，先跑 1v1；真实表现留 C3。
6. 继续遵守 `docs/B4_BATTLE_STATE_BOUNDARY.md`：人物、队伍、武功和战后成长只修改原 Lua 对象，不创建第二份战斗人物状态。
