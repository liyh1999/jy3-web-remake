# D2 Web 音频运行时

固定上游音频协议见 `docs/D2_AUDIO_PROTOCOL_AUDIT.md`。本文件记录浏览器侧 D2-2 / D2-3 的实现边界。

## 调用链

原 Lua 不改调用形式：

```text
G.Play(resourceId, group, loopFlag, rawVolume)
G.Stop(group)
        |
        v
lua/runtime_shims.lua
        |
        v
JYResources.play / stop
        |
        v
JYAudio
        |
        v
HTMLAudioElement
```

`battle_web.lua` 只额外发送表现遥测，实际播放仍走同一条 `JYAudio` 链路。

## group 生命周期

固定上游绝大多数调用第二参数都是 `1`，因此不能把它实现成“一个 group 只能有一个 Audio”。

每个 group 维护：

- 一个 long-lived voice：原第三参数为 true
- 多个 one-shot voice：原第三参数为 false

规则：

- 新 long-lived 只替换旧 long-lived，不停止同组 one-shot
- 多个 one-shot 可以重叠
- `Stop(group)` 停止并清理该组全部 voice
- one-shot 播放结束后自动从 group 移除

## rawVolume 与 Web gain

固定上游存在 `true,1`、`false,100`，同时也存在 `true,100`、`false,1`，所以第三、第四参数必须独立处理。

原 gcore 的真实增益曲线没有包含在固定上游中。Web 使用显式兼容曲线 `jy3-web-compat-v1`：

```text
raw 1   -> 0.55
raw 100 -> 1.00
1..100  -> 线性插值
```

这只是 Web 默认听感曲线，不声明为原 gcore 曲线。可在运行配置中覆盖：

```js
window.JY_CONFIG.audioGain = {
  raw1: 0.55,
  raw100: 1.0,
};
```

每个 voice 同时保留 `rawVolume`、`rawGain` 和最终 `gain`，因此以后获得原运行时实测时不需要改 Lua。

## 用户混音

最终媒体音量：

```text
media.volume
= rawGain
× master
× (longLived 或 oneShot)
```

三层用户音量均限制在 0..1：

- `master`
- `longLived`
- `oneShot`

设置保存在：

```text
localStorage["jy3.audio.settings.v1"]
```

坏 JSON、缺字段、越界值都安全回退/钳位，不影响游戏启动。

页面底部“音频”入口可直接调整三层音量并恢复默认，不需要打开控制台。

## 页面隐藏/恢复

页面进入 hidden：

- long-lived：pause，不重置 currentTime，保留 voice
- one-shot：停止并丢弃，不在返回页面后集中补播
- hidden 期间新建 long-lived：登记但不播放
- hidden 期间新建 one-shot：路由成功但立即丢弃

页面恢复 visible：

- 从原 currentTime 恢复所有 suspended long-lived
- 若浏览器再次拒绝 autoplay，则标记 pending
- 下一次 pointer/keyboard 用户手势调用 `retryBlocked()`

## 自动验证

`tools/test-audio-manager.mjs`：

- 同组 long-lived 替换
- one-shot 重叠
- Stop 全组清理
- autoplay 拒绝与手势恢复
- raw gain compatibility curve

`tools/test-audio-settings.mjs`：

- localStorage 损坏数据回退
- master / long-lived / one-shot 实时混音
- 设置持久化
- hidden suspend / visible resume
- long-lived 播放位置保持
- hidden one-shot 不补播
- hidden 新建 long-lived 延迟到恢复后播放

`tools/audit-audio.mjs`：

- 固定上游 272 个 MP3 数量
- 原资源 ID 路由
- 原 Play/Stop 代表调用
- `true,100` / `false,1` 独立参数反例

离线构建同时验证代表 BGM、UI 音效、audio/02 音效和 `audio.js / audio-controls.js` 均进入 dist。
