# D4-4A 全真 / 古墓门派剧情

固定上游：

`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

D4-4A 是 D4 的第一批门派程序接入。选择全真和古墓作为一个 family，是因为原剧情本身存在明确的“全真弃徒 → 初入古墓”衔接，不适合拆成两个互不相干的 JavaScript 流程。

## 1. Program family

`src/upstream.js`：

```text
QUANZHEN_GUMU_PROGRAMS
  p_school_quanzhen.lua
  p_school_gumu.lua
```

`prepareQuanzhenGumuRuntime()`：

1. 复用 `prepareStoryRuntime()`；
2. 继续使用已经 bootstrap 的核心 `p_order.lua`；
3. 只额外加载全真、古墓两个门派文件；
4. 不依赖 `prepareBattleRuntime()`；
5. 不顺带加载少林、武当、华山、丐帮等其它门派。

正常 Web boot 在进入游戏前调用这一 loader。原因是原 `p_person.lua` 收到门派事件后会同步执行：

```text
G.call("初入全真-赵志敬")
G.call("初入古墓-小龙女")
```

Lua 的 `G.call` 是同步调用边界，不能等到“函数不存在”时再异步 fetch 门派脚本。因此已接入的门派 family 必须在世界事件开始前准备好。

## 2. Core dependency: p_order

门派程序中的时间、角色状态等通用 API 继续由核心 `p_order.lua` 提供，例如：

- `add_hour`
- `add_day`
- `add_time`
- `set_alltime`
- `set_CH`
- `set_death`

D4-4A 不在 `gf_web.lua` 重新复制这些逻辑。

独立 Lua smoke 会按正常运行环境补齐核心 `p_order` 与 `co` shim；正常浏览器环境的 `runtime_shims.lua` 已提供 `co`。

## 3. 全真路径

当前自动回归直接执行原 `p_school_quanzhen.lua`：

### 初入全真

覆盖：

- 全真大殿 → 演武场原地图顺序；
- 身份设置为“全真弟子”；
- 门派编号 4；
- 师父“赵志敬”；
- 原物品 86；
- 原武功 161；
- 四次原菜单选择及赵志敬好感变化；
- 最终回到原地图 23。

### 赵志敬日常

覆盖非战斗“请安”分支，确认原三项菜单可以运行并结束，不需要额外 JS 门派状态机。

### 三月大比较 → 全真弃徒

覆盖战斗失败且未习得全真剑法/三花聚顶的原分支：

```text
原 call_battle
  ↓ result = loss
设置“全真弃徒”
  ↓
清空门派 / 师父 / 头衔
  ↓
声望/侠义变化
  ↓
G.call("初入古墓")
```

测试通过 original-battle API 边界返回战斗结果，不直接绕过 `G.call('call_battle')`。

### 全真出师

覆盖：

- 原 `set_alltime(2,1,1,4,1)`；
- `出师-增加被动`；
- 进度列表 4 完成；
- 跳转 `初入聚贤庄`。

## 4. 古墓路径

### 初入古墓

在全真弃徒衔接后，再直接执行真正的原 `初入古墓`：

- 终南山下 → 古墓；
- 选择留在古墓；
- 条件点 19 达到原要求；
- 身份“古墓派弟子”；
- 门派编号 5；
- 师父“小龙女”；
- 学习原武功 101；
- 最终进入地图 13。

### 小龙女日常

覆盖五项菜单中的非战斗“请安”分支，保证日常 NPC 原函数可运行。

### 李莫愁来访

覆盖：

- 小龙女加入战斗队列；
- 原 battle result = 1 的棺室分支；
- 获得物品 121；
- 学习武功 221；
- 选择离开古墓；
- 原死亡状态更新；
- 时间重置并进入聚贤庄。

### 古墓出墓

覆盖：

- 小龙女加入队伍；
- 李莫愁等角色死亡状态；
- 进度列表 5 完成；
- `出师-增加被动`；
- `set_alltime(2,1,1,4,1)`；
- `初入聚贤庄`。

## 5. 世界事件入口

原 `p_person.lua::地图系统_人物` 继续作为统一 dispatcher。

D4-4A 回归新增：

```text
trig_event("初入全真-赵志敬")
  → p_person wait_case
  → G.call("初入全真-赵志敬")

trig_event("初入古墓-小龙女")
  → p_person wait_case
  → G.call("初入古墓-小龙女")
```

执行后 dispatcher 必须重新进入 `wait_case`，不能因为一次门派事件退出长期监听。

## 6. 平台边界

测试不通过伪造以下被 Web 明确接管的调用来判断剧情结果：

- `goto_map`
- `all_over`
- `dark`
- `turn_map`
- `photo0`

例如 `goto_map` 以 body 当前地图字段的真实变化断言。

门派内部业务 API（学习武功、好感、门派状态、奖励、死亡状态等）仍由原 Lua 分支决定；fixture 只模拟其外部状态存储。

## 7. Offline

构建完成后，CI 会从：

- `dist/lua`
- `dist/vendor/upstream/JY3/script/04_program`

重新运行：

- 全真/古墓 basic；
- 全真→古墓 transition；
- 李莫愁分支。

因此门派接入不依赖 CI 当时的源码目录或在线 upstream。

## 8. 后续

D4-4B 开始接入其它门派时沿用同一模式：

1. 明确 program family；
2. 在进入世界前准备已接入 family；
3. 复用 core/base story runtime；
4. 每个门派覆盖入门、日常、关键战斗、出师；
5. 事件入口必须经过原 `p_person` dispatcher；
6. source + offline dist 双重实跑。
