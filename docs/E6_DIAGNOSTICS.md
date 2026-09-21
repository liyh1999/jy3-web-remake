# E6 开发者诊断模式

更新时间：2026-09-21

## 开启方式

正式页面默认不显示调试 UI。

在地址后追加：

```
?debug=1
```

例如本地离线包：

```
http://127.0.0.1:8080/index.html?debug=1
```

也可以由开发者手工设置：

```js
localStorage.setItem('jy3-web-remake:debug', '1')
```

刷新后开启。删除该 key 并去掉 `?debug=1` 即恢复正常发布界面。

## 面板内容

当前诊断面板显示：

- 当前原 Lua 事件及 coroutine 状态。
- 最近一次事件。
- 当前 `wait1` 等待事件。
- 当前地图 object id。
- Web save adapter 当前跟踪的存档对象数。
- runtime 当前已注册对象数。
- missing calls。
- missing objects。
- 最近 Lua runtime trace。
- JS/Lua 异常及堆栈。
- 图片和音频资源解析/加载失败。
- 固定 upstream revision。
- source/dev 或 offline dist 模式。

## 诊断报告

点击“复制报告”会生成 JSON，包含：

- 页面 URL / User-Agent。
- upstream revision。
- offline/source 模式。
- Lua 当前状态。
- missing call/object。
- save/runtime 对象数量。
- runtime trace。
- 资源失败列表。
- 最近异常与堆栈。

报告不包含存档正文、玩家完整对象内容或 localStorage 数据，仅包含定位运行时问题所需的状态摘要。

## 实现边界

- `lua/gf_web.lua` 只增加只读诊断接口，不修改剧情状态机。
- `src/resources.js` / `src/audio.js` 只记录失败摘要。
- `src/debug.js` 独立于游戏主逻辑。
- 正常模式下诊断面板保持 `hidden`，错误捕获/console 包装也不启用。
- `dist/` 会随 `src/` 一起包含诊断代码，但默认不展示。

## CI 回归

`tools/e2e-debug-panel.mjs` 在真实离线 Chrome 中验证：

1. 默认页面调试面板隐藏。
2. `?debug=1` 后面板出现。
3. 当前地图可读。
4. 当前原事件可读。
5. 存档对象数 / runtime 对象数可读。
6. missing calls / objects 字段存在。
7. 人工注入 Error 后堆栈进入报告。
8. 人工制造无效资源 ID 后资源失败进入报告。
9. 页面提供复制诊断报告能力。

E6 只负责“现场可定位”。runtime/build/save 的正式版本协议继续由 E7 / #27 完成。
