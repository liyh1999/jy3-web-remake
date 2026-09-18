# D3-1 五个原小游戏流程与运行时审计

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

范围：打猎、伐木、钓鱼、采矿、押宝。目标不是重新设计小游戏，而是确认怎样让原 Lua 在浏览器里跑起来。

## 1. 总体结构

五个小游戏都不是单文件逻辑，而是三层组合：

```text
p_order.lua
  负责 addUI / start_program / wait1 / cleanup
      |
      v
p_init.lua -> 地图系统_小游戏
  G.case(跳骰 / 伐木 / 钓鱼 / 打猎 / 挖矿)
  负责命中结果、随机、奖励、属性和成就
      |
      v
v_* + c_*
  原 gcore UI 树 + 点击/输入事件
  click -> G.trig_event(...)
```

因此 Web 层不能把奖励搬进 JavaScript。正确边界是：**JS/renderer 投影 UI 和输入；Lua 继续决定随机结果、奖励和角色状态。**

## 2. p_order.lua 入口生命周期

| 游戏 | 原入口 | UI | 程序 | 完成事件 |
|---|---|---|---|---|
| 押宝 | `gambling` | `v_gambling` | 中央 dispatcher 处理 `跳骰` | `赌博结束` |
| 伐木 | `logging` | `v_logging` | `伐木条`、`伐木提示` | `伐木结束` |
| 采矿 | `dig` | `v_dig` | `挖矿条`、`挖矿提示`、`挖矿时间条` | `挖矿结束` |
| 钓鱼 | `fishing` | `v_fishing` | `钓鱼时间条`、`钓鱼提示`、`钓鱼水花` | `钓鱼结束` |
| 打猎 | `hunting` | `v_hunting` | `打猎时间条`、`打猎提示`、`猎物显示1~4` | `打猎结束` |

打猎入口还会执行：

```lua
G.Stop(1)
G.Play(0x49010007,1,true,1)
```

D2 已完成的 JYAudio 可以直接承接，不需要小游戏另建音频系统。

## 3. 中央事件 dispatcher

`p_init.lua / 地图系统_小游戏` 固定：

```lua
G.case(1, '跳骰')
G.case(2, '伐木')
G.case(3, '钓鱼')
G.case(4, '打猎')
G.case(5, '挖矿')
local r = G.wait_case()
```

这意味着小游戏依赖的是一个**长期运行的事件程序**，不是某个按钮点击后同步执行一次函数。

当前普通 Web runtime 的 `G.wait1 / G.start_program / G.addUI` 仍是最小 no-op；战斗层 `battle_web.lua` 已经实现了一套能工作的协程 scheduler。D3 最合适的实现不是复制战斗 scheduler 五次，而是抽出通用 async/program runtime。

## 4. 原 UI 与输入

### 伐木

`c_logging.lua`：

```lua
if 体力 > 0 and 耐久 > 0 and self.伐木 == 0 then
    G.trig_event('伐木')
end
```

力/气两条不断滚动；点击时读取当前值，`p_init.lua` 用两者之和计算本次伤害。

### 采矿

`c_dig.lua` 与伐木同类，但附加时间条：

```lua
if 时间 > 0 and 耐久 > 0 and self.挖矿 == 0 then
    G.trig_event('挖矿')
end
```

### 钓鱼

`c_fishing.lua`：

```lua
if 时间 > 0 and 蚯蚓 > 0 then
    G.trig_event('钓鱼')
end
```

`钓鱼水花` 程序把结果写成 0/1/2/3，小/中/大水花决定提竿后的奖励池。

### 打猎

`c_hunting.lua` 点击具体猎物，将 `目标` 和 `位置` 写入 UI，再触发 `打猎`。原 UI 支持两种模式（射箭 / 捕猎），并且猎物由 `猎物显示1~4` 按不同周期生成。

### 押宝

`c_gambling.lua`：

- 单/双/大/小每项最多 5 注；
- 每注即时 `add_money(-5)`；
- 开始触发 `跳骰`；
- 退出前退还当前未开奖下注；
- 骰子和庄家本金变化由 `p_init.lua` 处理。

## 5. 奖励继续归原 Lua 所有

这里仅固定代表写点，不把概率复制到 JS。

### 伐木

成功：

- `add_point(101, 50)`
- `add_item(280, 1)`（木柴）
- 成就：木秀于林（累计成功）

每次挥砍另有 `add_point(101, 10)`。

### 采矿

每次击打：`add_point(102, 10)`；成功时有概率 `add_point(22,1)`。

矿石池包含：

- 310 铁矿
- 311 铜矿
- 312 红晶矿
- 313 蓝晶矿
- 314 白晶矿
- 315 玄铁矿
- 316 蓝宝石
- 317 红宝石

成就：千锤百炼。

### 钓鱼

每次提竿消耗 `add_item(318,-1)`（蚯蚓）。奖励池包括：

- 319 河蚌
- 320 海螺
- 325 螃蟹
- 326 鳖
- 321 草鱼
- 322 鲤鱼
- 323 娃娃鱼
- 324 黄金鱼
- 宝箱银两
- 宝箱武器 8 / 41

水花等级会增加 `point 106`，特殊鱼/宝箱还写 `point 19`。

相关成就：钓胜于鱼、钓鱼能手、万金于钓。

### 打猎

猎物 1~11 分为毒虫、蛇、獐鹿、兔、鹰、野猪、虎、熊。原逻辑同时考虑：

- 模式：射箭 / 捕猎
- 随机 `JL`
- 是否持有剥皮刀 278
- 中毒/受伤导致时间扣减
- 得分与总分
- `add_point(103, exp)`
- 暗器成长 `add_point(34,1)`

代表奖励：

- 毒虫 291~294 等
- 蛇胆 217
- 熊胆 218
- 獐腿肉 299
- 兔肉 300
- 獐鹿皮 327
- 虎皮 328 / 虎掌 330
- 熊掌 329 / 野猪肉 331 / 熊皮 332 / 野猪皮 333

相关成就：一身是胆、与虎谋皮。

### 押宝

下注在组件层每注 `add_money(-5)`；开奖由 dispatcher 生成两枚 1~6 骰子：

- 单 / 双
- 小：点数和 <= 6
- 大：点数和 > 6
- 命中项按下注数返还 `下注数 * 10`
- 庄家本金记录在 point 130

相关成就：小赌怡情、一掷万金。

## 6. 资源与表现

原 UI 直接引用现有资源 ID，不需要制作替代美术。

代表资源：

- 打猎：`framelist/hunting`（0x33 02...）以及 `image/frameshunting` / UI 图片
- 伐木动画：`0x33010005`
- 钓鱼水花：`0x33010006 / 07 / 09`
- 采矿动画：`0x33010011`
- 押宝骰子：`0x33010004`

D1 已经有通用 framelist player，所以 D3 应继续走原资源 ID，不重新造 CSS 假动画。

## 7. 地图/NPC 链路

原地图事件中已经存在：

- 1015 → 地图打猎 → `G.call('hunting')`
- 1016 → 地图砍柴 → `G.call('logging')`
- 1017 → 地图钓鱼 → `G.call('fishing')`

牛家村和门派剧情也直接调用这些原入口。只要 D3 runtime 接通，NPC/地图不应再写第二套小游戏奖励。

## 8. 当前 Web 缺口

已有能力：

- gcore scene node / renderer
- pointer / keyboard input dispatch
- resource ID / PNG / framelist
- JYAudio
- 原 Lua 数据对象、物品、金钱、人物属性 mutation bridge
- 战斗里已经验证过 coroutine + wait_time + wait1 + case/wait_case + start_program + trig_event 的可行实现

真正缺少：

1. 普通运行时的通用协程/事件 scheduler；
2. `G.cacheUI / G.loadUI / G.addUI / G.removeUI / G.getUI` 原 UI 模块生命周期；
3. 动态加载五个 `v_* / c_*` 模块；
4. program scheduler 与 browser frame/timer pump 连接；
5. 页面卸载/小游戏结束时统一清理 program/UI。

所以 D3 不应该先写 5 个 HTML 游戏。应先把战斗中已验证的 scheduler 泛化，然后跑原 `v_* / c_*`。

## 9. 建议拆分

- **D3-2**：通用 Lua program/event scheduler + 原 UI module loader；先让 `v_logging` 能 addUI / click / wait1 / cleanup。
- **D3-3**：伐木 + 采矿。两者都是“滚动力/气 + 点击判定 + 耐久”，可共用一组回归。
- **D3-4**：钓鱼。补水花 program、鱼饵、时间条、奖励池。
- **D3-5**：打猎。补多目标 spawn、射箭/捕猎模式、原 hunting framelist。
- **D3-6**：押宝。补骰子 animation、下注/庄家本金/成就。
- **D3-7**：五小游戏地图/NPC 长流程回归与 offline 资源收口。

验收原则：JS 只提供原运行时能力；概率、奖励、属性和成就继续执行固定上游 Lua。
