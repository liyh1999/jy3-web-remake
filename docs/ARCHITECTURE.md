# 架构决策：优先保留 Lua，Web 层重写平台能力

## 当前结论

现阶段**不建议把全游戏 Lua 重写成 TypeScript**，但这不是无条件结论。

推荐架构：

```text
jy3-mirror 原 Lua
  - 剧情 / 任务
  - 人物 / 武功 / 物品数据
  - 数值公式 / 战斗规则
          ↓
Source Normalizer
  - 中文局部变量 -> ASCII 安全标识符
  - obj.中文字段 -> obj["中文字段"]
  - 跳过字符串、注释、长字符串
          ↓
Lua VM (Fengari)
          ↓
Web Compatibility Runtime
  - gf / gcore API 兼容
  - coroutine / event dispatch
          ↓
JavaScript / TypeScript Web 层
  - 渲染 / UI / 输入 / 音频
  - 资源缓存
  - IndexedDB 存档
  - 浏览器平台适配
```

## 为什么现在去掉 Lua 不是优化

### 1. 原内容规模很大

`jy3-mirror` 已经包含大量成熟 Lua：剧情、人物、门派、任务、战斗、商店、公告等。全量改写的最大成本不是语法转换，而是验证每个剧情条件、数值副作用和对象 ID 是否完全一致。

### 2. 原数据本身就是 Lua 表

`01_data/o_*.lua` 可以直接注册到 Web Runtime 的 `QueryName/DBTable`，不用先人工转成 JSON。

### 3. 很多“引擎 API”其实还是 Lua

例如 `add_love`、`rest`、`set_item`、`add_maxhpmp` 等都在 `p_order.lua` 中已有原实现。真正必须由 Web 重写的范围主要是图形、UI、声音、输入、文件系统、存档和平台相关能力。

## 新发现：原引擎 Lua 语法并非标准 Lua 5.3

原脚本大量使用中文标识符，例如：

```lua
local int_选项 = 0
o_files.难度 = 1
```

标准 Lua/Fengari 不能直接依赖这种源码形式，因此 Web 版在载入上游脚本前增加了**源码归一化层**：

```lua
local int_选项 = 0
```

会把局部变量映射成稳定的 ASCII 标识符；

```lua
o_files.难度
```

会变成：

```lua
o_files["难度"]
```

归一化只处理代码 token，字符串、注释和 Lua 长字符串保持原样。

这增加了一项维护成本，因此“保留 Lua”是否继续成立，要由自动测试决定，而不是凭感觉决定。

## 保留 Lua 的硬门槛

只要以下条件持续满足，就继续保留 Lua：

1. 固定版本的 `p_newgame.lua` / `p_order.lua` 归一化后能通过标准 Lua 编译；
2. `回答问题 -> 序幕 -> 牛家村` 能完整运行；
3. 新增兼容代码主要集中在平台 API，而不是大量重写游戏规则；
4. 性能 profiling 没证明 Lua VM 是主要瓶颈。

如果后面出现“为了运行原 Lua，需要持续写大量高风险源码转换规则”，再转向 **Lua 数据抽取 + TypeScript 规则层**。

## Lua 的实际缺点

- 浏览器调试栈不如纯 TypeScript 清晰；
- Lua <-> JS 异步桥接需要 coroutine；
- Fengari 热循环性能低于原生 JS；
- 原脚本使用本地化标识符，需要归一化；
- 类型检查弱。

## 哪些新代码应该直接用 TypeScript

后续新增系统默认放 Web/TypeScript 层：

- Renderer
- ResourceManager
- AudioManager
- InputManager
- SaveManager
- SceneManager
- Web UI
- Debug overlay
- compatibility diagnostics

Lua 只保留已有内容/规则层。

## 第二阶段优化

兼容稳定后再考虑：

- 构建时把 `01_data/o_*.lua` 预编译成 JSON；
- 剧情 Lua 保留；
- 战斗热点逐步迁到 TypeScript；
- 为 Lua API 自动生成 TypeScript 类型声明；
- 上游脚本/资源固定 commit，离线打包，不依赖运行时 GitHub。

## 当前决策

**继续采用“原 Lua 内容层 + 源码归一化 + Web/TypeScript 平台层”的混合架构。**

下一次重新评估节点：原 `p_newgame.lua` 完整跑通后。
