# D1-1 原动画资源格式审计

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本阶段只确定原资源格式和解析协议，不实现完整播放时钟。目标是让 D1-2 播放器直接消费真实上游数据，而不是按文件夹名称猜格式。

## 1. 原资源 ID 不是单一 family

原 `res/common/script/gf.lua` 同时使用两部分信息：

```text
高 4 位     文件类型 / 扩展名
低 28 位    dir.lua 中的目录 + 文件序号
```

原扩展名表：

| 高位 | 扩展名 |
|---|---|
| 0x2....... | .mcf |
| 0x3....... | .swf |
| 0x4....... | .mp3 |
| 0x5....... | .png |
| 0x6....... | .sys |
| 0x7....... | .ttf |
| 0x8....... | .png |
| 0x9....... | .tmx |
| 0xa....... | .avi |
| 0xd....... | .lua |

因此不能只按低 28 位的目录 family 决定扩展名。

例如：

```text
0x33030001
  高位 3      -> .swf
  0x03030001  -> framelist/body + 0001
  => framelist/body/0001.swf

0x52030001
  高位 5      -> .png
  0x02030001  -> fonts/role/1/1 + 0001
  => fonts/role/1/1/0001.png

0x56130499
  高位 5      -> .png
  0x06130499  -> image/body + 0499
  => image/body/0499.png
```

这也是旧 Web resolver 无法正确显示原角色帧的根因之一。

`src/resource-catalog.js` 已改为 type tag 优先，并提供 `resolveWithDirectories()` 给完整 `script/dir.lua` 使用。

## 2. 必须读取 script/dir.lua

根目录 `JY3/dir.lua` 只有粗粒度目录，不足以解析动画内部帧。

固定上游 `JY3/script/dir.lua` 有 **426 个目录映射**，包括：

- `framelist/skill`
- `fonts/role/<角色>/<阵营>`
- `spine/skill/<武功>`
- 更完整的音频角色目录

D1 的动画解析以 `script/dir.lua` 为准。

运行时：

```text
JYAnimationResources.loadDirectoryMap()
-> assetBase/script/dir.lua
-> parseDirectoryMap()
-> Map<canonical directory base, relative directory>
```

## 3. .swf 实际是纯文本 framelist

固定上游 `framelist/**/*.swf` 不是 Adobe SWF 二进制。

例如：

```text
520683530
15,1
56130499
56130500
56130501
...
```

格式：

```text
line 1: 520683530        固定 marker
line 2: rate,loop        帧率 / 循环标记
line 3+: frame resource  无 0x 前缀的十六进制资源 ID
```

注意后续帧 ID 必须按 **hex** 解析，例如：

```text
5611100a -> 0x5611100a
```

不能用十进制 `parseInt(token, 10)`。

当前解析结果对象：

```js
{
  resourceId,
  marker,
  rate,
  loopCode,
  loop,
  frameDurationMs,
  durationMs,
  frameCount,
  frames
}
```

代码：

`src/animation-resources.js`

## 4. 固定上游 framelist 规模

固定 revision 的实际 `.swf` blob：

| 目录 | 数量 |
|---|---:|
| body | 25 |
| effect | 75 |
| enemy | 431 |
| friendly | 96 |
| hunting | 16 |
| skill | 190 |
| **总计** | **833** |

目录节点本身不计入 833。

## 5. 六类代表样本

### body

`0x33030001 -> framelist/body/0001.swf`

```text
rate = 15
loop = 1
frames = 34
first = 0x56130499
      -> image/body/0499.png
```

### effect

`0x33010001 -> framelist/effect/0001.swf`

```text
rate = 20
frames = 4
first = 0x560da001
      -> image/frame/a001.png
```

### enemy

`0x33060001 -> framelist/enemy/0001.swf`

```text
rate = 4
frames = 8
first = 0x52040001
      -> fonts/role/1/2/0001.png
```

### friendly

`0x33070001 -> framelist/friendly/0001.swf`

```text
rate = 4
frames = 8
first = 0x52030001
      -> fonts/role/1/1/0001.png
```

### hunting

`0x33020001 -> framelist/hunting/0001.swf`

```text
rate = 46
frames = 23
first = 0x56111001
      -> image/frameshunting/1001.png
```

### skill

`0x33040061 -> framelist/skill/0061.swf`

```text
rate = 6
frames = 12
first = 0x55860001
      -> spine/skill/97/0001.png
```

这说明 `spine/skill` 至少在这一版游戏里直接参与 PNG 序列帧播放。

## 6. “Spine”目录的真实情况

固定上游 `JY3/spine/` blob 总数：

```text
2076
```

其中：

```text
PNG               2075
PSD 源素材            1
JSON / atlas / skel   0
```

唯一 PSD：

`spine/skill/97/未标题-1.psd`

因此这一固定版本不存在可直接交给标准 Spine runtime 的 skeleton/atlas 数据。

当前结论：

- `spine/skill/<n>/0001.png...` 按 PNG 序列资源处理。
- 不因为目录名叫 `spine` 就引入 Spine JS runtime。
- 如果后续其他资源发现真实 skeleton 协议，再单独接入。
- 唯一 PSD 是源素材残留，不参与 Web runtime。

## 7. o_animation 仍然落到 framelist

固定上游 `o_animation.lua` 有：

```lua
rate = 30
循环 = 1
类别 = 'effect'
图像 = {...}
```

但 `c_animation.lua:setData()` 真正赋给节点的是：

```lua
序列帧动画.img = 0x33010000 | (info.name & 0x0000ffff)
```

即最终还是 `framelist/effect/*.swf`。

`o_animation.图像[1]` 主要用于取得尺寸，不是另一套播放器格式。

## 8. 战斗如何引用这些动画

原 `n_common.lua / 战场_效果`：

```lua
tab.<position>.frameActionID(int_动作编号)
flash.<position>.frameActionID(int_序列帧)
```

其中武功：

```text
int_序列帧 = skill code + 1
flash.frameActionID(...)
-> framelist/skill/<id>.swf
-> PNG frame ids
```

原 `c_battle:onFrameEnd` 还依赖动画结束通知来恢复站立动作。

因此 D1-2 播放器不能只“定时换图”，还必须提供：

- play(action/resource)
- loop
- rate / duration
- stop
- frame end callback
- action replacement/cancel

## 9. 当前 Web API

`window.JYAnimationResources`：

- `parseDirectoryMap(source)`
- `parseFrameResourceId(line)`
- `parseFrameList(source, resourceId)`
- `resolveWithDirectoryMap(resourceId, dirs, assetBase)`
- `describeFrameList(parsed, dirs, assetBase)`
- `loadDirectoryMap()`
- `loadFrameList(resourceId)`

D1-2 不再解析文本格式，只消费这一层提供的标准对象。

## 10. 自动回归

### 单元

`tools/test-animation-resources.mjs`

固定：

- marker
- rate/loop
- hex frame id
- tagged PNG resolution
- body/friendly/enemy/skill 路径

### 固定上游审计

`tools/audit-animation-resources.mjs`

固定：

- 426 项 `script/dir.lua` 可解析
- 833 个 framelist 的分类数量
- 无 Spine json/atlas/skel
- 2075 PNG + 1 PSD
- 六类代表 framelist 所有帧都存在于固定 upstream 文件树
- 六类首帧进入 offline cache

生成：

- `reports/animation-resource-audit.json`
- `reports/animation-resource-audit.md`

## 下一阶段 D1-2

实现统一 framelist 播放器，目标接口大致为：

```text
load resource id
-> JYAnimationResources.loadFrameList()
-> preload frame images
-> play at parsed rate
-> loop / one-shot
-> cancel / replace
-> onFrameEnd
```

首先接到现有 renderer/gcore node，再替换 #43 里战斗 `frameActionID` 的最低 CSS 动作反馈。
