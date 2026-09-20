# E1 / #6 Web 存档系统

## 目标

把原先单槽 localStorage 原型升级成可长期演进的正式 Web 存档层，同时保持 Lua 对象图仍是游戏状态唯一来源。

## 存档槽

当前固定提供 4 个槽位：

- `slot1`：手动存档 1
- `slot2`：手动存档 2
- `slot3`：手动存档 3
- `autosave`：自动存档

页面 HUD 增加槽位选择器。

手动“存档”按钮只允许写入 3 个手动槽；选中自动存档时只能读取，不能手动覆盖。

## 存储架构

新增：

`src/save-store.js`

游戏逻辑不再直接依赖某个具体 localStorage key，而是通过存档 store 接口：

- `read(slot)`
- `write(slot, payload)`
- `remove(slot)`
- `list()`
- `migrateLegacySingleSlot()`

store 只依赖一个具有 `getItem / setItem / removeItem` 的 storage adapter。

因此将来替换 IndexedDB 时可以替换 adapter / repository 层，不需要修改 Lua 剧情、Lua 对象序列化或各游戏系统。

## Schema v2

当前 Web 存档 schema：

```text
schemaVersion = 2
slot
upstream
savedAt
meta
luaState
```

`luaState` 仍由 `lua/save_state.lua` 中：

`__jy_export_state()`

导出。

读取时仍通过：

`__jy_import_state()`

恢复原 Lua 对象图。

## 元数据

每次保存同步记录：

- 角色名
- 等级
- 当前地图 ID
- 侠义值
- 门派 ID
- 游戏天数
- 游戏时间文本
- 被跟踪的原 Lua 对象数量
- 保存时间
- 固定 upstream revision

槽位下拉框直接显示：

```text
存档 1 · 角色名 Lv.X 第N天
```

不需要先反序列化整个 Lua 状态才能查看基础存档信息。

## v1 单槽迁移

旧原型使用：

`jy3-web-remake:save:v1`

新系统首次启动时：

1. 检查 `slot1` 是否已经存在；
2. 若不存在，检查旧 v1 key；
3. 合法 v1 payload 自动迁移为 schema v2；
4. 写入 `slot1`；
5. 保留原 Lua state；
6. metadata 标记 `migratedFrom: 1`。

若 `slot1` 已存在，则不会用旧存档覆盖当前存档。

## 异常存档保护

`save-store.js` 对以下情况返回失败结果，而不是把异常抛到游戏主循环：

- JSON 损坏；
- payload 类型错误；
- Lua state 缺失；
- 未知槽位；
- 未来 schemaVersion；
- storage 读取异常。

尤其是读取损坏存档时，应用会先验证 payload。

只有验证成功之后才会：

- 关闭当前对话；
- reset JS state；
- reset Lua runtime；
- import Lua state。

因此坏档不会先把当前正在玩的状态清空。

## 自动存档

自动存档不修改任何单剧情 Lua。

`lua/gf_web.lua` 在一个原剧情 coroutine 真正结束后统一调用：

`web:eventFinished()`

Web 侧收到后：

1. 350ms 防抖；
2. 导出当前完整 Lua state；
3. 写入 `autosave`；
4. 不覆盖手动槽；
5. 不打断当前 UI。

立即结束和经过 talk/menu/battle yield-resume 后结束的剧情都只发一次完成信号。

## Lua 对象图 roundtrip

原有 `tools/smoke-save-state.mjs` 继续验证：

- 玩家属性
- 银两
- 当前地图
- 普通/特殊装备
- 队伍顺序与镜像字段
- 地图隐藏状态
- 城市解锁
- 物品数量
- 武功等级/熟练度/修为
- 玩家成长属性
- 队友成长
- 战斗共享状态
- 队友好感/礼物相关状态

完成 export → reset → import 后保持一致，并重新同步 Web snapshot。

## 新增测试

- `tools/test-save-store.mjs`
  - 3 手动 + 1 自动槽
  - schema v2
  - v1 迁移
  - 损坏 JSON
  - 未来版本拒绝
  - 不覆盖已有 slot1

- `tools/test-event-finished-signal.mjs`
  - 立即结束剧情事件
  - UI yield/resume 剧情事件
  - 每次只发送一个完成信号

- `tools/check-save-system-integration.mjs`
  - 页面四槽 UI
  - save-store 加载顺序
  - 旧 SAVE_KEY 不再由 app 使用
  - migration wiring
  - autosave wiring
  - metadata wiring
  - Lua eventFinished wiring

## CI

最终功能 CI：

- run #714 / `35504933800`
- commit `ad6ec9809bb0044b8bcbca373479b1b6802560e1`
- 结果：success

确认通过：

- Save-state roundtrip
- Versioned multi-slot save store
- Story completion autosave signal
- Multi-slot save integration guard
- source static HTTP
- offline dist 构建
- offline dist HTTP（含 `src/save-store.js`）
- disconnected runtime
- D4 全量剧情/战斗/小游戏回归

## E1 结论

#6 完成标准已经满足：

- 3 个手动槽 + 1 个自动槽；
- 存档元数据；
- 原 Lua 对象图 roundtrip；
- schema version + v1 migration；
- 坏档 / 未知新版本安全失败；
- storage adapter 与游戏逻辑解耦，可后续替换 IndexedDB。

下一阶段进入 E2 / #21：真实无头浏览器 E2E，重点验证页面层的新游戏、菜单、牛家村、NPC、战斗以及本次完成的多槽保存/读取。
