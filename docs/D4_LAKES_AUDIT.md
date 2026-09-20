# D4-5I 聚贤庄剩余任务覆盖审计 + 高风险路径收口

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

## 1. 全量任务盘点

固定上游 `p_lakes_notice.lua` 当前共有：

```text
47 条 聚贤庄任务_*
```

此前直接执行原任务正文的 smoke 覆盖 8 条；本批新增 5 条高风险动态路径，使直接执行原任务正文的覆盖达到 13 条。

其余任务不是“未接入”：

- 全部原 Lua 已进入归一化编译；
- 全量 API 调用进入静态覆盖审计；
- `地图系统_聚贤庄任务` 使用原持久 `wait_case` dispatcher；
- 本批将 dispatcher 从抽查 2 条升级为自动读取固定上游任务列表并遍历全部 47 条事件。

## 2. 47 条 dispatcher 全路由

`tools/smoke-lakes-notice-dispatcher.mjs` 现在：

1. 从固定上游 `p_lakes_notice.lua` 自动提取所有 `聚贤庄任务_*`；
2. 固定上游当前数量必须为 47；
3. 为每个任务注册测试 handler；
4. 启动原 `地图系统_聚贤庄任务`；
5. 逐个触发全部 47 个事件；
6. 每次都验证：
   - 目标 handler 只执行 1 次；
   - dispatcher 返回并继续停留在 `wait_case`；
7. 最终 reset 后无 program 泄漏。

这意味着不是“任务名存在”，而是 47 个事件名都实际经过原 dispatcher 路由。

## 3. 少林与武当的恶斗：15 种战斗编队矩阵

静态审计最初看到该任务有 15 个 `call_battle`。

进一步阅读原脚本后确认，这不是“连续 15 战”，而是：

```text
菜单 1：帮少林 → m=1..6，共 6 种武当敌方编队
菜单 2：帮武当 → m=1..6，共 6 种少林敌方编队
菜单 3：两边一起打 → o=1..3，共 3 种混合编队

合计 15 种互斥 call_battle 分支
```

`tools/smoke-lakes-high-risk.mjs` 将这 15 种原分支全部执行：

- 6 种帮少林编队；
- 6 种帮武当编队；
- 3 种两派混合编队；
- 检查随机地图、难度、非零敌方槽位数量；
- 检查善恶点变化；
- 检查少林/武当门派好感变化。

原第三分支脚本没有再次调用 `get_battle`，而是读取此前的战斗结果变量。本测试按原运行语义预置归一化后的全局战斗结果，不修改原剧情逻辑。

## 4. 四大淫贼

三个合法菜单分支全部动态执行：

```text
帮田伯光
→ 2 战
→ learnmagic(15)
→ role 32 join

帮欧阳克
→ 2 战
→ learnmagic(133)
→ role 33 join

帮霍都
→ 2 战
→ learnmagic(141)
→ role 34 join
```

同时验证任务完成和聚贤庄进度 19。

覆盖组合：

- menu；
- 连续 battle；
- learnmagic；
- team_full；
- join；
- 善恶状态。

## 5. 独孤求败的宠物

完整高奖励路径：

```text
战神雕
→ item 2
→ item 14

再次战神雕
→ item 28 玄铁剑
→ learnmagic(61) 玄铁剑法
→ 好感增加

满足原属性条件
→ 与独孤求败剑意战
→ learnmagic(230)
→ set_magic_lv(230, 5)
→ set_magicexp(230, 999)
```

同时验证：

- 3 场原战斗；
- 进度 12；
- 保存属性 217/218 向 44/46 转移；
- 物品、武功、等级、经验、关系状态。

## 6. 神秘商人

直接执行当前实际生效的原脚本路径：

```text
通用_神秘商店
→ add_point(36, +1)
→ add_love(148, +2)
→ newpoint 80 -1
→ 互通有无进度 +1
→ 固定随机命中奖励
→ item 235 +1
```

原文件中旧版“单件随机商品 / 花钱或武力购买”逻辑目前整段为注释，因此本回归不虚构执行已注释代码。

## 7. 义结金兰

构造合法同伴并完整执行三层菜单确认：

```text
确认目标在队
→ 确认具体同伴
→ 最终确认结义
```

验证：

- 可用结义次数 1 → 0；
- 对应任务完成；
- 聚贤庄进度 39 完成；
- 玩家关系槽 70 记录结义角色；
- 【义薄云天】成就状态；
- HP +5000；
- MP +5000；
- 六项角色属性 3..8 各 +30；
- 最大 HP/MP 与角色基础值同步。

## 8. 新增 / 强化回归

- 强化 `tools/smoke-lakes-notice-dispatcher.mjs`：47 条全路由；
- 新增 `tools/smoke-lakes-high-risk.mjs`：15 编队矩阵；
- 新增 `tools/smoke-lakes-high-risk-state.mjs`：
  - 四大淫贼三个分支；
  - 独孤求败的宠物；
  - 神秘商人；
  - 义结金兰。

## 9. CI

最终功能 CI：

- run #695 / `35503449104`
- 结果：success

确认：

- 47-task lakes dispatcher PASS；
- high-risk lakes battle matrix source PASS；
- high-risk lakes state paths source PASS；
- high-risk lakes battle matrix offline PASS；
- high-risk lakes state paths offline PASS；
- 15 条天书主线既有回归继续通过；
- 门派、基础剧情、战斗、五小游戏继续通过；
- disconnected runtime PASS；
- offline HTTP smoke PASS。

## 10. 当前结论

D4-5I 完成后，不再机械为剩余每条聚贤庄任务复制一份测试桩。

当前动态策略已经形成三层保护：

1. 全 47 条事件 dispatcher 动态路由；
2. 全 Lua 编译 / API 静态覆盖；
3. 13 条正文动态 smoke，重点覆盖 battle/menu/team/item/skill/role/shop 等高风险组合。

下一阶段进入 D4 最终连续流程：

```text
新建角色
→ 牛家村
→ 门派 / 世界
→ 战斗 / 小游戏 / 聚贤庄任务
→ 天书主线
→ 主要结局
```

目标从“模块分别能跑”提升到“多个模块在同一状态生命周期里连续运行”。
