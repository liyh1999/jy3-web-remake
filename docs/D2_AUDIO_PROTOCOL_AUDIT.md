# D2-1 原音频资源与 G.Play/G.Stop 语义审计

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本阶段只固定原音频协议和浏览器现状差距，不在这里实现完整播放器、设置页或音量 UI。

## 1. 原资源目录

固定上游 `JY3/audio` 一共 1104 个文件：

| 目录 | 内容 | 数量 |
|---|---|---:|
| `audio/01` | MP3 | 75 |
| `audio/02` | MP3 | 197 |
| `audio/role` | PNG | 832 |
| 合计 MP3 |  | 272 |

`audio/role` 虽然位于 audio 目录下，但内容是角色相关 PNG，不应作为音频扫描。

离线缓存不需要复制全部 272 个 MP3。现有 `vendor-upstream.mjs` 会为固定上游生成完整文件索引，D2-1 的自动审计直接从该索引验证数量，只缓存代表样本。

## 2. 音频 ID 到路径

原 `JY3/dir.lua`：

```lua
_dir[0x9000000]="audio"
_dir[0x9010000]="audio/01"
_dir[0x9020000]="audio/02"
```

资源 ID 的高 4 位是文件类型，`0x4.......` 表示 MP3；低 28 位是原 `dir.lua` 路径 ID。

因此：

| 资源 ID | 低 28 位 | 路径 |
|---|---|---|
| `0x49011003` | `0x09011003` | `audio/01/1003.mp3` |
| `0x49010038` | `0x09010038` | `audio/01/0038.mp3` |
| `0x4902000a` | `0x0902000a` | `audio/02/000a.mp3` |

现有 `src/resource-catalog.js` 的 type-tag 解析与这一规则一致。

## 3. 原调用分类

固定上游代码搜索可以看到 `G.Play` 广泛分布于 UI、地图、剧情、战斗等脚本。代表调用如下。

### 地图 / BGM

`p_citymap_system.lua` 在地图音乐切换时：

```lua
G.Stop(1)
G.Play(music, 1,true,1)
```

`p_order.lua` 在战斗开始时：

```lua
G.Play(0x49010000+math.random(25,30), 1,true,1)
```

战斗结束后显式：

```lua
G.Stop(1)
```

标题、读档、小游戏、地图切换也存在同类“先 Stop，再播放长音频”的生命周期边界。

### UI 音效

`c_button.lua`：

```lua
G.Play(self.audio_hover, 1,false,100)
G.Play(self.audio_press, 1,false,100)
```

大量菜单、对话、商店、人物等 UI 都使用 `0x49011003, 1,false,100`。

### 战斗音效

`n_common.lua / 战场_效果`：

```lua
G.Play(0x49020001+int_序列帧-1, 1,false,100)
```

即技能动画对应的音效主要来自 `audio/02`。

### 剧情音频

`p_newgame.lua` 同时存在：

```lua
G.Play(0x4901000b, 1,true,1)
G.Stop(1)
G.Play(0x4902000e, 1,false,100)
```

即剧情脚本既控制长音频生命周期，也直接触发一次性效果音。

## 4. 第二参数：不能按“单一独占槽”实现

当前项目把第二参数命名为 `channel`。固定上游中已审计到的代表 `Play/Stop` 调用几乎都传 `1`：

- BGM：`..., 1,true,1`
- UI 点击：`..., 1,false,100`
- 战斗技能音效：`..., 1,false,100`
- `Stop`：`G.Stop(1)`

因此，仅从原 Lua 可以确认的是：

1. `1` 是共同的音频分组/通道参数；
2. `Stop(1)` 被用作地图、战斗、标题、读档、剧情等显式生命周期边界；
3. **不能把“同一个 1”直接解释成浏览器中只能存在一个 Audio 对象的独占槽。**

如果所有 `Play(...,1,...)` 都强制替换旧声音，那么 UI 点击和战斗一次性音效会无条件杀掉正在播放的长音频，这与原脚本把两类调用混用同一参数的结构冲突。

D2-2 的最低兼容要求是：一次性音效不能因为第二参数相同而自动停止已有长音频；`Stop(1)` 必须能结束该分组中仍存活的声音。更细的引擎内部通道实现不从 Lua 猜测。

## 5. 第三参数

固定上游的典型模式：

- `true`：地图/标题/战斗/小游戏等长生命周期音频；也存在技能预览等特殊长音频；
- `false`：UI 点击、战斗招式、剧情冲击、升级提示等一次性音效。

Web 层必须原样保留这个参数，不按目录硬编码。

同时存在少数地图路径把地图音乐以 `false` 传入，因此实现不能简单规定“audio/01 一律 loop，audio/02 一律 one-shot”。

## 6. 第四参数 volume/gain 原值

当前兼容层参数名为 `volume`。固定上游代表调用中反复出现两类原值：

- 长音频常见：`1`
- UI/战斗一次性音效常见：`100`

这里能锁定的是**原脚本可见值与二者的语义差异**；仅凭 Lua 不能证明 gcore 内部采用线性百分比、dB 还是其他增益曲线。

当前 `src/resources.js`：

```js
if (value <= 1) return value;
return value / 100;
```

会把原值 `1` 和 `100` 都映射成浏览器 `Audio.volume = 1.0`，因此丢失了原参数差异。

D2-2 必须先保留 raw volume/gain，再在统一音频层中集中做 Web 映射；不得继续在资源解析层把 `1` 和 `100` 静默合并。

## 7. 当前 Web 差距

`src/resources.js` 目前是最低兼容实现：

```js
const audioChannels = new Map();
...
stop(key);
...
audioChannels.set(key, audio);
```

已具备：

- 音频 ID -> URL 路由；
- loop 参数传递；
- 浏览器 `Audio.play()` Promise 拒绝捕获，自动播放限制不会阻塞 Lua；
- `G.Stop` 最低停止能力。

D2-1 确认的差距：

- 每次 `Play` 都先 `stop(key)`，与原调用结构不兼容；
- 一个 key 只能保存一个 Audio，无法表示“长音频 + 一次性音效”并存；
- raw `1/100` 被压成相同 Web volume；
- 没有统一生命周期管理；
- 没有页面隐藏/恢复策略；
- 没有持久化音量设置。

`battle_web.lua` 的 `G.Play/G.Stop` 目前会先委托原资源兼容层，再把参数发送到浏览器战斗表现层做遥测；这一桥接可以保留，D2-2 不应修改原 Lua 调用形式。

## 8. 离线代表样本

D2-1 固定：

- `audio/01/0038.mp3`：标题/长音频代表，`0x49010038`
- `audio/01/1003.mp3`：通用 UI 点击音，`0x49011003`
- `audio/02/000a.mp3`：audio/02 一次性效果音代表，`0x4902000a`
- `script/03_ui_component/c_button.lua`
- `script/06_notify/n_common.lua`

`p_order.lua` 与 `p_citymap_system.lua` 已属于运行时固定上游脚本，不需要重复加入 asset manifest。

## 9. 自动门禁

`tools/audit-audio.mjs` 在 `npm run cache:offline` 之后验证：

- pinned upstream revision；
- `audio/01 = 75`、`audio/02 = 197`、MP3 总数 `272`；
- `audio/role = 832 PNG`；
- 三个代表 ID 的路径解析；
- 代表 BGM/UI/战斗 `G.Play` 签名；
- 地图 `G.Stop(1)` 生命周期；
- 三个代表 MP3 已真实进入离线 cache。

CI 同时要求这些样本进入 `dist` 并在断网静态服务器中可访问。

## 10. D2-2 输入契约

下一阶段统一音频层只接受原参数，不修改 Lua：

```text
Play(resourceId, group, longLivedOrLoopFlag, rawVolume)
Stop(group)
```

实现约束：

- 保留原资源 ID 路由；
- 不把 group=1 当成单一独占 Audio 槽；
- 一次性 SFX 可与已有长音频共存；
- `Stop(group)` 清理该组存活声音；
- raw volume 先保真，再统一映射到浏览器增益；
- autoplay 拒绝继续保持非阻塞；
- 后续再补页面隐藏/恢复和持久设置。

D2-1 到此只固定协议事实，不提前复制或改写原剧情/战斗音频调用。
