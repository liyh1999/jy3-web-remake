# D4 全剧情程序与 API 覆盖基线

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

范围：`JY3/script/04_program` 全部 24 个 Lua 程序。D4 不把剧情重写到 JavaScript，而是先让固定上游程序全部可缓存、可归一化编译，并把运行时缺口固定下来，再按模块跑通原流程。

## 1. 04_program 清单

### 基础系统

- `p_order.lua`
- `p_init.lua`
- `p_event.lua`
- `p_dialogue_system.lua`
- `p_citymap_system.lua`
- `p_cheat_system.lua`

### 世界、主线与任务

- `p_newgame.lua`
- `p_niujiacun.lua`
- `p_person.lua`
- `p_story-town or city.lua`
- `p_lakes_notice.lua`
- `p_task.lua`
- `p_book_story.lua`

### 门派

- `p_emei.lua`
- `p_school_gaibang.lua`
- `p_school_gumu.lua`
- `p_school_huashan.lua`
- `p_school_quanzhen.lua`
- `p_school_shaolin.lua`
- `p_school_taohuadao.lua`
- `p_school_wudang.lua`
- `p_school_xingxiu.lua`
- `p_school_xuedaomen.lua`

### 战斗

- `p_battle.lua`

24 个文件已经全部进入 `CACHED_PROGRAMS`。正常启动仍只执行 5 个 `CORE_PROGRAMS`；其余 19 个只缓存并参加编译门禁，后续按剧情模块加载，不在启动时全部执行。

## 2. 全量编译

现有 `normalizeLuaSource` 已直接用于全部 24 个程序，随后使用 Lua 5.3 编译检查。

当前结果：**24/24 通过**。

因此 D4 后续首先要解决的不是 Lua 语法，而是运行时 API、notify/UI 和剧情生命周期。

## 3. G.call 覆盖

校准后的静态矩阵：

- 原 `04_program` API 定义：540
- 原 `06_notify` API 定义：17
- 唯一静态 `G.call`：471
- 由 `04_program` 自身解析：455
- 调用原 `06_notify`：7
- Web/runtime 已接管：3
- 原版拼写兼容 alias：6
- 未解析静态 `G.call`：**0**
- 动态调用前缀：1，`天书_..`

### 06_notify 依赖

- `对话系统_显示对话大ui`
- `对话系统_显示对话上ui`
- `对话系统_显示对话下ui`
- `对话系统_显示选择上ui`
- `对话系统_显示选择下ui`
- `作弊系统_初始化作弊系统ui`
- `作弊系统_更新作弊指令列表UI`

这些调用不是不存在，而是定义在原 `06_notify`。D4 后续应接原 notify/UI 生命周期，不应在剧情程序里加特判。

### Web 已接管的地图 UI

- `地图_进入地图UI`
- `地图系统_进入地图UI`
- `地图系统_离开地图UI`

它们由当前 `runtime_shims` 的地图投影承担。

### 原版拼写兼容

固定上游存在以下调用，Web 兼容层保留原脚本并做 alias：

- `add_itme → add_item`
- `get_ponit → get_point`
- `schoollove → add_schoollove`
- `ser_point → set_point`
- `ser_role → set_role`
- `set,note → set_note`

其中 `add_itme`、`schoollove`、`set,note` 已加入独立回归，防止这些原剧情路径再次静默丢失状态修改。

### 动态天书调用

`p_order.lua` 使用：

```lua
G.call('天书_'..str[int_天书])
```

实际目标由 `p_book_story.lua` 中 `天书_飞狐外传`、`天书_雪山飞狐` 等 API 提供，因此不能把 `天书_` 当作缺失静态 API。

## 4. 当前直接 G.* 缺口

全 24 个程序中，直接 `G.*` 已有 18 种可由当前 runtime 解析；仍有 14 种：

| API | 调用次数 | 主要性质 |
|---|---:|---|
| `G.addNewInst2Dynamic` | 2 | 动态数据实例 |
| `G.event_info` | 4 | 事件/notify 返回值 |
| `G.GetSavePath` | 15 | 桌面文件路径 |
| `G.getStrLen` | 2 | 字符串工具 |
| `G.IsFileExist` | 12 | 桌面文件系统 |
| `G.LoadFile` | 9 | 桌面文件系统 |
| `G.log` | 5 | 日志 |
| `G.split` | 1 | 字符串工具 |
| `G.Tween` | 11 | UI 动画 |
| `G.unzip` | 9 | 压缩/存档辅助 |
| `G.utf8sub` | 2 | UTF-8 字符串工具 |
| `G.WriteFile` | 11 | 桌面文件系统 |
| `G.WritePath` | 9 | 桌面文件系统 |
| `G.zip` | 4 | 压缩/存档辅助 |

这些才是 D4-2 的明确 runtime 输入。不能用统一 no-op 把它们静默吞掉。

## 5. D4 建议顺序

### D4-1：全量基线

- 24 个程序固定清单；
- offline cache；
- 全量归一化编译；
- `G.call / G.*` 矩阵；
- notify/runtime/alias/dynamic 分类；
- CI baseline。

### D4-2：通用 runtime 与 notify

优先处理会阻塞大量剧情的公共能力：

1. `G.log / G.getStrLen / G.utf8sub / G.split`；
2. `G.event_info` 与原事件返回值；
3. 原 `n_dialogue_system.lua` 对话/选择 UI；
4. `G.Tween`；
5. `G.addNewInst2Dynamic`；
6. 桌面文件/zip API 按浏览器存档边界做兼容，不直接照搬本地文件路径。

### D4-3：基础世界与任务

优先跑 `p_event / p_dialogue_system / p_citymap_system / p_task / p_story-town or city`，把城镇、地图事件、通用任务和对话链打通。

### D4-4：门派

按现有固定程序逐派建立至少一条自动路径，先覆盖入门、日常、关键战斗/奖励和下山流程。

### D4-5：天书、江湖事件与长主线

最后扩到 `p_book_story / p_lakes_notice` 等大体量内容，并建立从新建角色到主要结局的连续回归。

## 6. CI 门禁

D4-1 使用：

- `tools/check-normalized-upstream.mjs`：24 个程序归一化编译；
- `tools/audit-program-api-coverage.mjs`：生成 `reports/program-api-coverage.md/json`；
- `tools/program-api-baseline.json`：锁定当前 API 边界；
- `tools/test-original-call-aliases.mjs`：验证原版 typo alias。

后续修掉某项缺口时，应同时更新实现、回归和 baseline；新增未解析调用不能自动进入基线。
