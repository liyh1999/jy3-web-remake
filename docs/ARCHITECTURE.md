# 架构决策：保留 Lua，不把全游戏重写成 TypeScript

## 结论

现阶段不建议“优化成不用 Lua”。

推荐架构：

```text
原版/重制版 Lua 内容层
  - 剧情
  - 任务
  - 人物/武功/物品数据
  - 数值公式
  - 战斗规则
          ↓
Web Compatibility Runtime
  - gf / gcore API 兼容
  - coroutine / event dispatch
          ↓
TypeScript / JavaScript Web 层
  - 渲染
  - UI
  - 输入
  - 音频
  - 资源缓存
  - IndexedDB 存档
  - 浏览器平台适配
```

## 为什么现在去掉 Lua 不是优化

### 1. 原内容不是少量脚本

`jy3-mirror` 已经包含大量成熟 Lua：剧情、人物、门派、任务、战斗、商店、公告等。将这些逐行改成 TypeScript 的主要成本不是语法转换，而是验证每个剧情条件、数值副作用和对象 ID 是否完全一致。

### 2. 原数据本身就是 Lua 表

例如 `o_body.lua`：

```lua
local t = {
  'o_body',
  {
    {
      ['name']=0x10030001,
      ['1']='梦',
      ['2']='江湖',
      ...
    }
  }
}
return t
```

Web Runtime 已经可以直接加载这种数据并注册到 `QueryName/DBTable`。如果不用 Lua，反而还要增加 Lua -> JSON/TS 数据转换链。

### 3. 很多所谓“引擎 API”其实也是 Lua

`G.call('add_love')`、`G.call('rest')`、`G.call('set_item')`、`G.call('指令_存储属性')` 等都在 `p_order.lua` 中有原实现。

因此真正必须重写的范围主要是：

- 图形
- UI
- 声音
- 输入
- 文件系统/存档
- 计时
- 平台相关能力

而不是整个游戏逻辑。

## Lua 的实际缺点

保留 Lua 也不是没有代价：

- 浏览器调试栈不如纯 TypeScript 清晰
- Lua <-> JS 异步桥接需要 coroutine
- Fengari 性能低于原生 JS 的热点循环
- 类型检查弱
- 打包和资源路径比普通 Web 项目复杂

这些问题应该通过“边界收缩”解决，而不是立即全量重写。

## 哪些应该用 TypeScript

后续新增代码优先放 TypeScript：

- Renderer
- ResourceManager
- AudioManager
- InputManager
- SaveManager
- SceneManager
- Web UI
- Debug overlay
- compatibility diagnostics

Lua 只负责内容/规则层。

## 什么时候再考虑迁移 Lua

只有在下面条件出现时才值得迁移：

1. 浏览器 profiling 证明某段 Lua 是真实性能瓶颈；
2. 某个模块已经被彻底重构，不再要求兼容原脚本；
3. 测试覆盖足以证明迁移前后结果一致。

最可能最先迁出的模块是战斗渲染/动画，而不是剧情脚本。

## 可选的第二阶段优化

等兼容度足够高后，可以做：

- 构建时把 `01_data/o_*.lua` 预编译成 JSON，减少启动解析时间；
- 原剧情 Lua 继续保留；
- 高频数值计算逐步迁到 TypeScript；
- 为 Lua API 自动生成 TypeScript 类型声明；
- 将上游资源和脚本固定到明确 commit，避免在线拉取 master。

## 当前决策

**保留 Lua 作为游戏内容 VM，Web/TypeScript 作为平台运行时。**

这能最大程度复用现有代码，同时把未来新增工程代码放到现代 Web 技术栈中。
