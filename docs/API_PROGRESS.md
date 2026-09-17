# gcore / gf Web 兼容层进度

## 已实现

### Lua 运行与原剧情

- 浏览器运行 Lua 5.3（Fengari）
- 中文 Lua 标识符/字段归一化后执行原脚本
- `G.api` 原事件注册
- `G.call()` 对原 Lua API 自动分发
- coroutine：Lua 同步剧情 -> 浏览器异步按钮/对话
- `gf` / `gfbase` 基础兼容模块
- 原 `p_order.lua / p_newgame.lua / p_niujiacun.lua` 可加载
- 原开局问答可完整执行到牛家村
- 牛家村秀才、茶博士、穆念慈基础事件有自动回归

### 原静态数据

- 直接执行 `01_data/o_*.lua`，不转换成自定义业务格式
- `G.QueryName(id)` 真实对象索引
- `G.DBTable(type)` 对象表枚举
- 静态模板与运行时实例分离
- Runtime reset：重新从模板生成动态对象
- 当前纵向切片已加载人物、武功、物品、装备、商店、队伍、地图等核心对象表

### 已接 Web 桥接 API

- `story / talk / talk0 / menu`
- `get_point / set_point / add_point`
- `get_newpoint / set_newpoint`
- `get_money / add_money`
- `get_item / add_item`
- `learnmagic`
- `team_full / join`
- `call_battle / get_battle`
- `goto_map`
- `count_day`
- 基础 shop / inventory / equipment 适配
- `notice1 / all_over / dark / turn_map` 等最小平台副作用

### 原 Lua 复用

`p_order.lua` 已作为核心程序层加载，通用人物/物品/属性逻辑优先直接使用原实现，而不是重新用 JS 猜规则，包括：

- `add_love`
- `add_maxhpmp`
- `set_item`
- `rest`
- `指令_存储属性`
- `通用_取随机`
- 以及 `p_order.lua` 内其他可独立运行的通用函数

### Web 存档原型

- 原 Lua 运行时对象可序列化/恢复
- 人物、队伍、物品、嵌套地图状态 roundtrip 回归
- 当前浏览器单槽存读档可用
- 正式多槽、自动档、迁移与 IndexedDB 归 #6/#27

### 资源 ID 与离线运行

- `src/resource-catalog.js` 按原 `JY3/dir.lua` 统一定义资源目录族
- 支持运行时高位类型 tag -> 原 path id
- 可确定文件规则：
  - font -> `.ttf`
  - framelist -> `.swf`
  - image/newimage -> `.png`
  - audio -> `.mp3`
- 正确区分目录 ID 与文件 ID，不把目录错误解析成 `0000.png`
- Spine / particle 明确标为结构化资源，不伪造单文件路径
- `GetPath` 等价查询、`addImage`、`imageWidth/imageHeight/imageSize`、基础音频路由已具备 Web 实现
- 固定上游 commit 的完整 JY3 文件索引可在缓存阶段生成
- `npm run scan:resources` 扫描当前 Lua/数据的资源 ID，并分类为：已缓存、上游存在未缓存、动态 ID、结构化资源、上游缺失
- CI 对“新增真实缺失资源”失败，不把动态 ID 基址误报成缺失文件
- `npm run package` 生成完全离线 `dist/`，运行阶段不依赖 GitHub Raw/jsDelivr

## 当前有意跳过/尚属占位

这些属于后续独立系统，当前兼容层不会假装已经完成：

- 原 `通用_存档`：由 Web 存档层替代，正式版本归 #6
- 原 `list` / 完整 UI view/component：归 #10
- Spine / particle 的具体解析和播放：归 #11
- 完整 framelist 动画播放：归 #11
- 完整 Web Audio/BGM/音效行为：归 #12
- 原地图热点/世界地图：归 #9
- 原 `p_battle.lua` 战斗：归 #14

## 当前下一阶段

按 #20 路线执行：

1. A2：资源 ID + 完整性扫描完成后收口 #3/#26
2. A3 / #10：gcore 基础渲染，重点是 853×480 逻辑坐标、图片、文字、Grid9
3. A4 / #13：统一输入、鼠标热点、键盘/hotkey

## 尚未实现的主要系统

- 原 UI view/component 的完整渲染语义
- Grid9 / font / fontstyle 的实际画面还原
- animation / framelist / Spine 播放
- 完整 BGM/音效系统
- 原 hotkey、鼠标热点、键盘/触摸输入
- city map / world map
- hunting / logging / fishing / dig / gambling
- 完整 `p_battle.lua` 与 battle renderer
- 全量 `04_program` 剧情/门派/任务
- 多槽/自动存档、IndexedDB、版本迁移
- 浏览器真实 E2E 长流程
