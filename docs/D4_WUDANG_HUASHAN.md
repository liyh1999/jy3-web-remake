# D4-4B 武当 / 华山门派剧情

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

D4-4B 沿用 D4-4A 的 program-family 模式，把武当、华山加入正常世界运行，但仍然不把所有未接门派一次性装入 boot。

## 1. Program family

`src/upstream.js` 新增：

```text
WUDANG_HUASHAN_PROGRAMS
  p_school_wudang.lua
  p_school_huashan.lua
```

`prepareWudangHuashanRuntime()`：

1. 先复用已经完成的 `prepareQuanzhenGumuRuntime()`；
2. 再只加载武当、华山两个原门派程序；
3. 不依赖 `prepareBattleRuntime()`；
4. 不加载少林、峨嵋、丐帮、星宿、血刀、桃花岛等未接入门派。

正常 Web boot 现在会在世界事件开始前准备：

- 基础剧情 program family；
- 全真 / 古墓；
- 武当 / 华山。

这样原 `p_person.lua` 收到门派 NPC 事件时，可以同步执行对应 `G.call(...)`。

## 2. 武当原剧情回归

### 初入武当

直接执行原 `p_school_wudang.lua::初入武当`，覆盖：

- 原地图 7 → 5 路径；
- 身份“看门弟子”；
- 门派编号 1；
- 师父“俞岱岩”；
- 基础状态 11 / 107；
- 原物品 127、90、2、31；
- 原武功 75；
- 原入门记录。

### 俞莲舟日常

同一个原函数覆盖两条路径：

- 选项 3：只请安，不进入战斗；
- 选项 2：固定 NPC 切磋。

战斗路径通过现有 original-battle API：

```text
G.call("call_battle")
  ↓
battle result = 1
  ↓
俞莲舟好感 +3
  ↓
add_hour(1)
  ↓
返回原地图流程
```

没有在 JS 中重写胜负奖励。

### 武当出师

覆盖：

- `出师-增加被动`；
- `set_alltime(2,1,1,4,1)`；
- 进度列表 1 完成；
- `初入聚贤庄`。

## 3. 华山原剧情回归

### 初入华山

直接执行原 `p_school_huashan.lua::初入华山`，覆盖：

- 原地图 8 → 38；
- 身份“华山派弟子”；
- 门派编号 3；
- 师父“岳不群”；
- 基础状态 11 / 107；
- 原武功 74；
- 原入门记录。

### 岳不群日常

覆盖四项菜单中的选项 4：

- 向师父请安；
- 不进入长期修炼或战斗；
- 结束后回地图 38。

### 令狐冲切磋

覆盖原 `初入华山-令狐冲1` 选项 2：

- 固定对手令狐冲；
- 通过 original battle API 返回胜利；
- 原好感 +2；
- 原 `add_time(4)`；
- 返回地图流程。

### 华山出师

使用低岳灵珊好感的稳定分支，避免把伴侣/队伍扩展条件混进首个出师门禁。

覆盖：

- `出师-增加被动`；
- `set_alltime(2,1,1,4,1)`；
- `set_point(146,2)`；
- 进度列表 3 完成；
- `初入聚贤庄`。

## 4. 世界事件入口

原 `p_person.lua::地图系统_人物` 继续统一负责事件路由。

自动回归新增：

```text
trig_event("初入武当-俞莲舟")
  → p_person wait_case
  → G.call("初入武当-俞莲舟")

trig_event("初入华山-岳不群")
  → p_person wait_case
  → G.call("初入华山-岳不群")
```

每次调用后 dispatcher 都必须重新进入 `wait_case`。

## 5. Runtime 边界

D4-4B 没有新增门派专用时间、战斗或成长状态机。

继续复用：

- core `p_order.lua`；
- D4-3 background story scheduler；
- 原 dialogue runtime；
- original battle bridge；
- Web 平台对 `goto_map / all_over / dark / turn_map` 的既有接管。

门派业务状态、奖励、好感变化、出师标记仍由 upstream Lua 决定。

## 6. Offline

CI 在构建 `dist` 后重新从：

- `dist/lua`
- `dist/vendor/upstream/JY3/script/04_program`

执行武当/华山 smoke。

因此这批门派接入和全真/古墓一样，不依赖在线 upstream，也不只是在源码目录里通过。

## 7. 当前已接门派

D4-4B 完成后，正常 boot 已接入 4 个门派程序：

- 全真
- 古墓
- 武当
- 华山

后续 D4-4C 继续按 family 扩展其它门派，同时保持每批都有 source + offline 原程序路径回归。
