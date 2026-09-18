# C4 原战斗矩阵回归

固定上游：

`jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

## 目标

C2/C3 已经证明原 `p_battle.lua` 可以在 Web 运行、输入和显示。C4 不再增加新的战斗规则，而是扩大固定回归矩阵，验证真实多人物、NPC AI、异常、奖励、掉落和剧情战斗。

权威状态仍遵守：

- 主角：`o_body / 0x10030001`
- 队伍：`o_teammate / 0x10110001`
- NPC：`o_role / 0x10040000 + role id`
- 武功：`o_skill / 0x10050000 + skill index`
- 物品：`o_item`
- 战斗编成：`o_battle / 0x10150001`

Web 只做调度、输入与表现。

## 2v2 固定矩阵

固定阵容：

```text
team1  主角
team2  黄蓉（role 12）

enemy1 穆念慈（role 130）
enemy2 成不忧（role 131）
```

模式 3 原本会：

```text
set_team(0,0,0,0)
-> select()
-> 写 team2..team5
```

CI 不重写战斗组队规则，只把缺失的 Flash 选人 UI 固定成“选择黄蓉”，即：

```text
select()
-> set_team(12,0,0,0)
```

之后的队友 AI、敌方 AI、集气、目标选择、武功、MP、伤害、胜负和奖励全部继续运行原 `p_battle.lua`。

回归确认：

- `team2` 实际行动。
- `enemy1` 实际行动。
- `enemy2` 实际行动。
- 实际 `battleSkillEffect` 记录能反查 `get_npcskill(role, skill)`。
- 同一战斗至少出现两个不同的原 NPC 武功代码。
- 主角胜利获得 EXP。
- 存活队友黄蓉获得原 `add_exp` 队友经验。
- 战败敌人按原战后清理恢复到 1 HP。

## 异常状态

矩阵在战斗仍运行时直接初始化原对象字段，不经过 Web 状态副本。

覆盖：

| 原字段 | 状态 |
| --- | --- |
| 81 | 中毒 |
| 82 | 麻痹 |
| 83 | 晕眩 |
| 84 | 内伤 |
| 85 | 受伤 |
| 86 | 减速 |
| 87 | 混乱 |
| 90 | 剧毒 |
| 241 | 强伤 |

持续时间继续使用原 91..100 / 251 字段。

验证分两步：

1. `battleSlotStatus` 能从原 `o_body/o_role` 投影这些状态。
2. 把持续时间缩短后，只推进原 `集气` 状态机，确认状态由原时间逻辑归零，而不是 Web 清除。

混乱另外单独验证：

```text
body[87] > 0
-> 战斗系统_主角监控
-> 代码.team1.text = 207
-> 原普通攻击
```

因此 Web 没有实现自己的“混乱 AI”。

## 多目标武功

真实多敌阵型验证：

### 横排 range=3

使用：

```text
enemy1 + enemy4
```

两个位置属于原同一横排。选择 enemy1 后，原 hurt-node 结果必须同时使两个角色 HP 下降。

### 纵列 range=4

使用：

```text
enemy1 + enemy6
```

两个位置属于原同一纵列。原纵列目标映射必须同时生效。

### 全体 range=5

使用：

```text
enemy1 + enemy2
```

不额外构造目标，直接走原全体范围分支，两个角色都必须实际掉血。

这组回归同时固定了 C3 已修正的行为：伤害依据 11 个 `hurt.<position>` 节点，而不是把动画 target id 当成人物 id。

## 逃跑规则

可逃跑：

```text
call_battle(1,...)
-> 逃跑事件
-> body[235] = 2
-> battle result = 2
```

不可逃跑：

```text
call_battle(0,...)
-> 逃跑事件
-> 原脚本提示“无法逃跑”
-> 战斗继续
```

回归随后重新开启自动战斗并正常完成，确认拒绝逃跑不会破坏 scheduler。

## 原战利品

C4 恢复原 `get_drop`，使用固定上游黄蓉数据：

```text
role 12
死亡掉落道具 = 0x100b004a
拥有 = 1
```

胜利后验证：

- 原 `get_drop` 调用 `add_item`。
- 对应物品数量增加 1。
- 角色 `拥有` 变为 0。
- `inventory_web.lua` 刷新后读到同一个原 `o_item` 数量。
- 没有 JS copy-back。

## 存档与人物面板

2v2 后：

- `person_web.lua` 从原 `o_teammate` 读到黄蓉。
- 显示的队友 EXP 与原 `o_role.经验值` 一致。

掉落后：

- `inventory_web.lua` 从原 `o_item` 读到新增物品。

随后 `save_state.lua` roundtrip 验证：

- `o_role` identity 不替换。
- `o_item` identity 不替换。
- 队友经验恢复。
- 战斗掉落数量恢复。

## 穆念慈真实剧情战

固定上游 `p_niujiacun.lua`：

```lua
G.call('call_battle',1,10,1,130,130,0,0,0,0,0)
```

C4 会先检查固定上游脚本中该调用仍存在，然后使用完全相同参数运行原战斗。

验证：

- 背景 = 10。
- 模式 = 1。
- enemy1 = 130 / 穆念慈。
- 原战斗状态机可以完成并返回胜利。

这不是另造一个“类似穆念慈”的测试参数。

## 自动回归

当前主回归：

`tools/smoke-battle-1v1.mjs`

名称保留是历史原因，现已覆盖：

- C2 最小 headless 1v1。
- C3 browser scheduler。
- C3 手动武功/目标/QWER/逃跑。
- 单体/横排/纵列/全体。
- 战斗对白/异常/动作/音频。
- C4 原 2v2。
- 队友/敌方 NPC AI。
- 多 NPC 武功。
- 状态投影与原时间清除。
- 混乱强制普通攻击。
- 不可逃跑。
- 原 get_drop。
- 人物/背包/存档同源。
- 牛家村穆念慈真实战斗参数。

## C4 验收 CI

CI #302 / Run 35304671763：

- 原战斗矩阵通过。
- C2/C3 门禁通过。
- 原开局到牛家村通过。
- 人物/背包/商店/save-state 通过。
- offline cache/build/disconnected/dist smoke 通过。

C4 完成后，#14 核心战斗链可关闭。后续更完整的帧动画 / Spine 属 #11，通用 BGM/SFX 深化属 #12。
