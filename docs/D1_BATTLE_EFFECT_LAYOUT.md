# D1-4 战斗 skill/effect 定位与偏移

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本阶段只恢复原战斗表现层的 flash/effect 空间规则，不修改伤害、状态、目标选择或 AI。

## 1. 原 battle flash 使用独立 640×480 坐标

原 `v_battle.lua` 的 `flash` 容器不是“统一画在屏幕中央”，而是给 11 个角色槽和 3 个多目标槽分别定义 100×100 锚点。

中心坐标：

| 节点 | x | y | blend |
|---|---:|---:|---:|
| team1 | 173 | -13 | 0 |
| team2 | 108 | -44 | 0 |
| team3 | 238 | 20 | 0 |
| team4 | 310 | 70 | 0 |
| team5 | 29 | -93 | 0 |
| enemy1 | -111 | 128 | 0 |
| enemy2 | -111 | 8 | 0 |
| enemy3 | 91 | 128 | 0 |
| enemy4 | -206 | 78 | 0 |
| enemy5 | -8 | 186 | 0 |
| enemy6 | -9 | 78 | 0 |
| all1 | -47 | 116 | 1 |
| all2 | 131 | 5 | 1 |
| all3 | -134 | 162 | 1 |

`图标` 动画锚点中心为：

```text
x = 8
y = 195
size = 100 × 100
base framelist = 0x33030020
```

Web 用 `src/battle-effects.js` 固定这一坐标表。

## 2. skill/9999 是 master action-set

原战斗技能节点：

```text
flash.team1..enemy6
flash.all1..all3
img = 0x33049999
```

即：

```text
framelist/skill/9999.swf
```

这是 action-set：

```text
1
15, 100, 100

DA=061
55660001, 1, -98, -174
55660002, 1, -98, -174
...
56000001, -1, 50, 50
```

固定版本没有 Spine json/atlas/skel；这些 DA 动作最终仍引用 PNG 序列。

## 3. master frame x/y 参与最终坐标

对于 master action-set：

```text
最终左边 = 320 + flashNode.x + frame.x
最终下边 = 240 + flashNode.y + frame.y
```

例如 DA=061 第一帧：

```text
frame.x = -98
frame.y = -174
```

作用于 enemy1：

```text
flash enemy1 = (-111, 128)

left   = 320 - 111 - 98 = 111
bottom = 240 + 128 - 174 = 194
```

图片保持原 PNG 自然尺寸，不再强制压缩成 100×100/150×150。

因此大型武功特效会围绕原目标锚点展开，而不是被塞进 Web 中央固定框。

## 4. simple framelist 的降级定位

普通 effect framelist 没有 master x/y，例如：

`framelist/effect/0001.swf`

格式仍是：

```text
520683530
20,1
560da001
560da002
...
```

没有 offset 时，Web 使用 flash 节点本身的 100×100 区域作为定位框。

这与 master 路径分开：

- master：保留 PNG 自然尺寸 + x/y
- simple：节点 100×100 fallback

## 5. 多目标节点

原 `n_common.lua / 战场_效果` 的动画位置数组是：

```text
1..11  team1..enemy6
12     all1
13     all2
14     all3
```

因此 range 3/4/5 产生的动画位置不是角色索引时，仍然直接播放：

```lua
flash.<all1/all2/all3>.frameActionID(skill)
```

Web `battle_web.lua` 现在保持同一个 `0x33049999` skill master family，并把 all1/all2/all3 原位置传给表现层。

伤害仍由 hurt 节点扫描决定，不能由动画位置反推伤害目标。

## 6. blend=1

原：

```text
all1.blend = 1
all2.blend = 1
all3.blend = 1
```

浏览器没有原 gcore blend 枚举实现。

当前最低等价表现：

```css
mix-blend-mode: screen
```

只用于这三个原 blend=1 节点。

普通 team/enemy flash 保持正常混合。

## 7. Web 结构

`battleEffectLayer` 被投影成原逻辑画布：

```text
640 × 480
origin = center
x -> right
y -> up
```

再整体等比缩放进当前 battle-board：

```text
scale = min(boardWidth / 640, boardHeight / 480)
```

这样：

- 节点坐标保持原值；
- master x/y 不需要按 DOM 卡片尺寸重算；
- all1/all2/all3 与单目标共用一套规则；
- 浏览器窗口变化只影响整体 scale。

人物 actor sprite 不进入这一层。

D1-3 的人物槽位 projection 与 D1-4 flash/effect projection 是两条独立表现路径。

## 8. action replacement / 结束

实际播放仍由 `JYFramePlayer` 负责：

- 同一 `battle:<kind>:<position>` channel 新动作替换旧动作；
- 旧异步加载完成不能覆盖新动作；
- onComplete 后隐藏 effect image；
- missing resource -> onError -> 隐藏表现，不阻塞 Lua；
- actor onFrameEnd 仍回到原 Lua 等价待机规则；
- skill/effect 结束不修改权威战斗状态。

## 9. 自动回归

`tools/test-battle-effects.mjs`：

- 固定 14 个 flash 锚点中的代表坐标；
- all1/all2/all3 blend；
- master offset 数学；
- simple fallback；
- 640×480 等比缩放。

`tools/smoke-animation-offline.mjs`：

真实离线资源验证：

- `skill/9999 DA=061`
- 第一帧 `x=-98,y=-174`
- enemy1 / all3 最终 placement
- all3 blend=1
- simple `effect/0001`
- 所有代表帧均来自本地固定 upstream cache

战斗总回归继续由 `tools/smoke-battle-1v1.mjs` 覆盖：

- range 2
- range 3
- range 4
- range 5
- 2v2 / AI / status / reward
- 原穆念慈剧情参数
- authoritative hurt-node semantics

## 边界

D1-4 不做：

- 伤害重算
- 状态重算
- 目标重算
- 标准 Spine runtime
- BGM/SFX 深化

固定上游不存在 Spine skeleton runtime 数据，因此当前正确路径仍是：

```text
skill master DA
-> PNG frame id
-> spine/skill/<n>/*.png
-> FramePlayer
-> original flash coordinate + frame offset
```
