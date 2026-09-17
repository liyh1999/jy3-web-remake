# gcore / gf Web 兼容层进度

## 已实现（POC）

- G.api 事件注册
- G.QueryName（动态对象占位）
- G.GetDeviceInfo
- G.misc
- G.call('story')
- G.call('talk')
- G.call('menu')
- G.call('get_point')
- G.call('set_point')
- G.call('add_point')
- G.call('get_newpoint')
- G.call('set_newpoint')
- G.call('get_money')
- G.call('add_money')
- G.call('add_item')
- G.call('learnmagic')
- G.call('team_full')
- G.call('join')
- G.call('call_battle')
- G.call('get_battle')
- 基础 coroutine UI 桥接

## 待实现（全量移植的主要工作）

- gcore.c 图像资源 ID -> Web texture 映射
- addImage / imageSize / GetPath
- Grid9 / font / fontstyle
- 原 UI view/component 系统
- animation / framelist / spine
- audio 播放与资源路由
- 输入、鼠标热区、键盘快捷键
- game clock / timer
- shop / inventory / equipment UI
- city map / world map
- hunting / logging mini-game
- 完整 battle renderer
- save/load -> IndexedDB
- 原 DBTable / QueryName 数据加载
- 原始静态对象文件解析
- 与 p_battle.lua、p_person.lua、p_order.lua 的 API 覆盖测试
