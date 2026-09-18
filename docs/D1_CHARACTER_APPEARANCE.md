# D1-3 角色外观规则

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

本阶段的结论是：原版角色外观不是“head 叠在 body 上”的统一组合系统。固定上游实际分成三类资源：头像、角色静态图、战斗 master framelist。Web 复刻必须保持这三个用途分离。

## 1. 资源树

固定 revision：

| 资源目录 | 文件数 | 用途 |
|---|---:|---|
| image/head | 333 | HUD / 对话 / 战斗头像 |
| image/body | 611 | 男主战斗完整帧 |
| image/primadonna | 主角女性素材 | 女主战斗完整帧 |
| image/standmap | 81 | o_role.站立图像静态资源 |
| image/bodyframe | 0 | 仅残留目录 family |

`bodyframe` 在当前固定上游没有任何文件，不建立不存在的运行时协议。

## 2. 主角头像

权威字段：

`o_body[119]`

默认：

`0x56080001 -> image/head/0001.png`

原 `c_battle.lua` 将它用于：

- 主菜单状态头像
- team1 对话头像
- team1 战斗 map 头像

原 citymap HUD 同样读取主角头像。

头像可以被剧情直接改写。例如原脚本存在修改 `o_body[119]` 的逻辑，因此 Web 不保存独立 avatar 状态，而是在地图/人物/战斗刷新时重新读取原对象。

## 3. 主角战斗 body

默认 `v_battle`：

`team1.img = 0x33039998`

即：

`framelist/body/9998.swf`

它是 master action-set，内部含：

`DA=0000 / DA=0001 / DA=1001 / ...`

帧直接指向：

`image/body/*.png`

这些 PNG 已经是完整战斗人物帧。

原 `c_battle:start()` 只有一个主角外观 family 切换：

```text
o_body.性别 == 0
    -> 0x33039997 / body/9997.swf
otherwise
    -> 0x33039998 / body/9998.swf
```

`body/9997.swf` 的帧指向 `image/primadonna/*.png`。

因此：

- head 不叠到 battle body 上；
- 装备也没有在固定上游 c_battle 中驱动 body 换装；
- 不根据装备自行发明角色换装资源。

## 4. NPC 外观

原 `o_role` 有独立字段：

- `头像`
- `站立图像`
- `编号`

`p_init.lua` 初始化：

```lua
o_role[i].头像 = 0x56080000 + i
```

代表：

`role 1 -> image/head/0001.png`

`站立图像` 数据示例：

```text
王语嫣 -> 0x56090001
令狐冲 -> 0x56090002
仪琳   -> 0x56090003
```

即：

`image/standmap/0001.png ...`

战斗 master family：

```text
我方 NPC -> 0x33079999 / friendly/9999.swf
敌方 NPC -> 0x33069998 / enemy/9998.swf
```

普通角色：

`frameActionID(role id)`

特殊克隆角色：

```text
253 <= role id < 385
    -> frameActionID(o_role[role id].编号)
```

例如：

`role 253 -> 编号 164 -> DA=00a4`

头像和 standmap 同样应按被引用的基础编号角色读取。

## 5. City map 没有步行主角

固定上游 `c_citymap_system_map.lua`：

- 不读取 `站立图像`
- 不调用 `frameActionID`
- 不创建玩家步行 sprite

其模型是：

```text
地图背景
+ 城市热点
+ 城市名称
+ HUD / 主菜单
```

因此 Web 不为了“动画更像游戏”而新增一个原版 citymap 不存在的可移动主角。

当前 Web：

```text
runtime_shims.__jy_render_map()
    -> JYMapHost.beginMap(..., o_body[119])
    -> #hudPortrait
```

地图继续由原城市热点系统驱动，只补真实 HUD 头像。

## 6. 战斗进入场景的初始动作

D1-2 已支持 master `frameActionID`，D1-3 补齐进入战斗时的初始动作：

```text
team1
    -> master = sex ? body/9998 : body/9997
    -> action 0

team2..team5
    -> friendly/9999
    -> action = role id / special 编号

enemy1..enemy6
    -> enemy/9998
    -> action = role id / special 编号
```

这样人物在第一次攻击之前就有真实原版待机帧，而不是等 `战场_效果` 第一次触发后才出现。

攻击结束仍沿用 D1-2 的原 `c_battle:onFrameEnd` 语义：

- NPC action > 1000 -> action - 1000
- team1 非 9001/9002 -> action 0

## 7. Web 状态边界

Web 外观层只缓存瞬时显示信息：

- portrait resource id
- standmap resource id
- battle master resource id
- 当前 frame

人物 HP/MP/属性/装备/性别/头像/role 编号仍只存在于原 Lua 对象。

没有第二份 JS 人物模型。

## 8. 自动回归

`tools/audit-character-appearance.mjs` 固定检查：

- head/body/standmap/bodyframe 文件数量
- dir.lua 路径 family
- o_body[119] 默认头像
- p_init NPC 头像初始化
- female body/9997 切换
- default body/9998
- 253..384 克隆编号规则
- citymap 不消费 standmap / frameActionID
- 男女主 idle master 可由 D1-2 parser 加载
- head/standmap 代表资源进入 offline cache

`tools/smoke-battle-1v1.mjs` 运行时检查：

- 男主进入战斗立即 action 0 / body 9998
- 女主进入战斗立即 action 0 / body 9997
- enemy1 进入战斗立即 enemy master / role action
- 原头像、standmap、master 元数据投影
- role 253 -> 编号 164 的只读 selector

`tools/smoke-map-runtime.mjs` 检查：

- 地图 HUD portrait 参数直接来自 `o_body[119]`

`tools/verify-offline-dist.mjs` 检查：

- `0x56080001 -> image/head/0001.png`
- `0x56090001 -> image/standmap/0001.png`
- 两者都存在于断网 dist

## 下一阶段

D1-4 不再处理人物 body/head，而专注：

- skill/9999 master DA 覆盖
- simple effect framelist
- skill PNG 序列在战斗目标位置的布局/偏移
- 原 blend / action end / 多目标特效定位
