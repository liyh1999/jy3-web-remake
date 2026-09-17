# gcore / gf Web 兼容层进度

## 已实现

### Lua 运行与事件

- 浏览器运行 Lua 5.3（Fengari）
- `G.api` 原事件注册
- `G.call()` 对原 Lua API 自动分发
- coroutine：Lua 同步剧情 -> 浏览器异步按钮/对话
- `gf` / `gfbase` 基础兼容模块
- 可直接加载原 `p_order.lua`
- 可实验加载原 `p_newgame.lua`

### 原静态数据

- 直接执行 `01_data/o_*.lua`，不转换成自定义格式
- `G.QueryName(id)` 真实对象索引
- `G.DBTable(type)` 对象表枚举
- 静态模板与运行时实例分离
- Runtime reset：重新从模板生成动态对象
- 已接入：
  - `o_body`
  - `o_hotkey`
  - `o_files`
  - `o_misc`
  - `o_storehouse`
  - `o_role`
  - `o_achieve`
  - `o_item`

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
- `notice1 / all_over / dark / turn_map` 等最小占位
- `G.Play / wait_time / trig_event` 等最小引擎占位

### 原 Lua 复用

`p_order.lua` 已作为核心程序层加载，因此下列逻辑优先直接使用原实现，而不是重新用 JS 写：

- `add_love`
- `add_maxhpmp`
- `set_item`
- `rest`
- `指令_存储属性`
- `通用_取随机`
- 以及 `p_order.lua` 内其他可独立运行的通用函数

## 当前有意跳过

这些属于桌面运行时/防作弊/旧存档副作用，当前 Web POC 不执行原实现：

- `地图系统_防修改监控`
- 原 `通用_存档`
- 原 `list` UI

它们后续分别替换为 Web 状态校验、IndexedDB 存档和 HTML5 UI。

## 下一步

1. 完整跑完原 `p_newgame.lua -> 回答问题`
2. 记录并消除开局路径中剩余的未实现调用
3. 让 `序幕_开始 -> 英雄途径牛家村` 可以连续执行
4. 接入原 `p_niujiacun.lua`
5. 开始 gcore 资源 ID 映射：`GetPath / addImage / imageSize`
6. 将上游脚本/数据改为构建阶段缓存，避免正式版本运行时依赖 raw.githubusercontent.com
7. Web 存档 -> IndexedDB

## 尚未实现的主要系统

- gcore.c 图像资源 ID -> Web texture 映射
- Grid9 / font / fontstyle
- 原 UI view/component 渲染系统
- animation / framelist / spine
- audio 播放与资源路由
- 输入、鼠标热区、键盘快捷键
- shop / inventory / equipment UI
- city map / world map
- hunting / logging mini-game
- 完整 battle renderer
- save/load -> IndexedDB
- `p_battle.lua` 全量兼容测试
