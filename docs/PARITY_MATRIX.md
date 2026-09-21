# JY3 Web 复刻一致性矩阵

> 基线更新时间：2026-09-21  
> 固定上游：`ssz66666/jy3-mirror@c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`  
> 浏览器长流程 / E5 snapshot 基线：CI #775 / `4170f389cf169b6979828a7a968387c1f129a99d`

本文件只记录“与固定原版相比已经一致到什么程度”，不因为某个实现 Issue 已关闭就自动标记为一致。  
行为与视觉分开评价：原 Lua / 原数据仍是权威状态，并且已有自动回归支撑时，才允许标为“行为一致”；没有原版界面或参考图逐项验收时，不标“视觉一致”。

## 状态定义

- `未开始`：该层尚未进入复刻。
- `最小兼容`：关键调用已接通，不再直接阻塞流程，但仍存在明显占位、降级或缺口。
- `可玩`：主要交互可以在浏览器完成，尚不能证明与原版全部边界一致。
- `行为一致`：核心规则、状态变化、主要边界沿用原 Lua / 原数据，并有自动回归。
- `视觉一致`：主要布局、素材、动画、交互反馈已与原版参考完成对照验收。

## 核心系统矩阵

| 系统 | 行为状态 | 视觉状态 | 当前证据 | 已知差异 / 下一步 | 跟踪 |
| --- | --- | --- | --- | --- | --- |
| 开局问答 / 建角 | 行为一致 | 可玩 | 原 `p_newgame.lua` 完整问答；真实浏览器从“开始”走到牛家村；属性写回原 `o_body`；标题页已直接复用原 `v_title.lua` 对应背景/Logo/按钮资源并按原 853×480 坐标布局，CI #844 浏览器视觉结构回归通过 | 标题页已收口；问答框、字体和选项排版仍需按原版逐项视觉对照 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| Lua 数据对象 / QueryName | 行为一致 | — | 原 `o_*` 数据注册；`QueryName / DBTable`；动态对象、deepcopy、存档对象图回归 | 仍需在最终阶段把关键 missing object / placeholder 阈值收紧到 0 | [#23](https://github.com/liyh1999/jy3-web-remake/issues/23) |
| 牛家村 / NPC / 对话事件 | 行为一致 | 可玩 | 原 `p_niujiacun.lua`；黄蓉、穆念慈等真实事件；牛家村使用原 `0x56050029` gcore 背景；Web 对话桥保留 roleId/portraitId/dialogueMod/menuMod；复用原 `0x56160047` 对话框，完整 `image/head` 333 张头像进入离线包；CI #860 原牛家村/对话视觉 E2E 全绿 | 对话框已完成主要资源与布局收口；逐字文字节奏、好感图标及少数特殊 dialogue UI 变体仍可在最终视觉验收中微调 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 城镇地图 / 世界地图 / 热点 | 行为一致 | 可玩 | 原 `o_citymap_system_*`、`p_citymap_system.lua`；43 个世界地图节点、隐藏/解锁、往返及存档回归 | 地图热点和背景已经使用原资源，但 UI 层、缩放、反馈仍缺像素级原版验收 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 人物面板 / 背包 / 装备 | 行为一致 | 可玩 | 原 `o_body/o_item/o_equip`；使用、装备、卸下、秘籍条件链及存档回归 | 当前人物/背包面板为 Web 重建布局，不是原界面逐像素还原 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 商店 / 经济 | 行为一致 | 可玩 | 原 `o_shop`、`p_order.lua`；买卖、数量、讲价、库存边界、牛家村真实事件回归 | 购物车交互是 Web 等价实现；原窗口布局与交互细节仍需视觉对照 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 人物成长 / 队伍 / 武功 / 关系 | 行为一致 | 可玩 | 原 `o_body/o_role/o_teammate/o_skill`；加入/离队、升级、熟练度、关系互动、战斗共享状态、save roundtrip | 人物页展示与原版 UI 仍有差异；最终需用固定 snapshot 防止属性投影漂移 | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 原 `p_battle.lua` 战斗 | 行为一致 | 可玩 | C1-C4：原集气、AI、技能、异常状态、奖励、掉落、多阵容、逃跑；E2 已在真实 Chrome 启动穆念慈原战斗并走逃跑结算 | 战斗布局虽已接原素材/framelist/音频，但尚未完成与原 853×480 战斗画面的逐项视觉验收 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 动画 / framelist / 特效 | 行为一致 | 可玩 | 833 个 framelist 格式审计；统一播放器；frameActionID；角色、skill/effect、多目标偏移；离线逐帧资源验证 | 固定上游无标准 Spine skeleton 协议，当前按原 PNG/framelist 序列等价播放；仍需视觉基准比较 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| BGM / 音效 | 行为一致 | — | 原资源 ID、`G.Play/G.Stop`、通道、循环/停止/替换、自动播放恢复、页面生命周期、音量持久化 | 仍需在完整流程中固定典型场景音频 snapshot/调用序列，防止资源路由漂移 | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) |
| 伐木 / 采矿 / 钓鱼 / 打猎 / 押宝 | 行为一致 | 可玩 | 五小游戏均运行固定 upstream Lua；原 UI module loader、奖励/父剧情恢复、连续隔离与 offline dist 回归 | 主要操作已可玩，但没有原版逐帧/逐布局视觉验收 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 全剧情 / 10 门派 / 15 天书 / 聚贤庄任务 | 行为一致 | 可玩 | 固定 `04_program` 全程序编译/API 基线；10 门派、15 天书、47 路由、高风险路径及跨模块长流程回归 | 自动回归以行为/state 为主；具体剧情窗口、过场、特殊表现仍要进入最终视觉验收 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) |
| 多槽存档 / 自动存档 / 迁移 | 行为一致 | 可玩 | 3 手动槽 + autosave；schema v2；Lua 对象图 roundtrip；旧档迁移；坏档保护；E2 真实浏览器 save/load | Web 存档 UI 是产品化重建，不追求旧桌面存档窗口完全相同；runtime/build/save 版本协议还需补齐 | [#27](https://github.com/liyh1999/jy3-web-remake/issues/27) |
| 资源 ID / 路由 / 离线资源 | 行为一致 | — | `dir.lua` 426 项目录映射；type-tag 解析；资源完整性扫描；固定上游；离线 cache/build/verify | 新增真实路径必须持续进入离线清单；最终发布仍需资源许可与版本化包验收 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) [#27](https://github.com/liyh1999/jy3-web-remake/issues/27) |
| 浏览器 E2E | 行为一致 | — | #21 已完成；真实 headless Chrome：开局 → 牛家村 → NPC → 穆念慈原战斗 → 逃跑 → slot1 保存 → 状态修改 → 读档恢复；console/exception 监控 | 后续新关键系统改动必须追加页面级路径，不能只靠 Lua harness | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) |
| 完全离线部署 | 行为一致 | — | 固定 Fengari / upstream；SHA-256 cache；`build:offline`；断网 runtime；CI 最终 offline smoke | 版本化发布包、构建信息和部署验收尚未最终收口 | [#27](https://github.com/liyh1999/jy3-web-remake/issues/27) [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |
| 关键 G.call / 平台占位 | 最小兼容 | — | 已有 API audit、`__jy_missing_calls/__jy_missing_objects`，主流程大量调用已实装 | 兼容层仍保留明确 no-op / 平台副作用替代；必须分类并让关键静默缺失归零 | [#23](https://github.com/liyh1999/jy3-web-remake/issues/23) |
| 固定回归样本 / snapshot | 行为一致 | — | `tools/regression-snapshots.json` 统一固定 upstream/runtime、开局、地图、商店、战斗、人物、存档、五小游戏；9 个权威回归消费者 + CI validator；CI #775 全绿 | snapshot 更新必须显式评审；视觉截图基线继续由 #18 负责 | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) |
| 现场诊断 / 开发者模式 | 行为一致 | — | `?debug=1` 开启统一诊断面板；显示 missing call/object、当前/最近事件、地图、存档/运行对象数、Lua runtime trace、JS/Lua 异常堆栈、图片/音频失败；可复制 JSON 报告；正式页面默认隐藏；离线 Chrome E2E 已覆盖 | 后续只需随新模块扩展诊断字段，不再是阻塞项 | [#25](https://github.com/liyh1999/jy3-web-remake/issues/25) |
| runtime / build / save 版本协议 | 行为一致 | — | `src/version.js` 提供 runtimeVersion/protocolVersion；runtime-config/build-info 记录 runtime/protocol/upstream/build time；新存档记录 schema/runtime/protocol/upstream；legacy 兼容；protocol/upstream 不匹配明确阻止导入；debug 可查看版本；CI #810 全绿 | 后续版本升级必须按 `docs/E7_VERSION_PROTOCOL.md` 更新并重跑 E5/E2/D4 | [#27](https://github.com/liyh1999/jy3-web-remake/issues/27) |
| 整体视觉复刻 / 浏览器兼容 / 发布 | 可玩 | 可玩 | 原背景、头像、战斗角色与特效、音频均已进入 Web；853×480 逻辑画面保留；完整流程可浏览器运行 | 当前仍明显是 Web Runtime 重建界面，未达到“视觉一致”；Chrome/Edge/Firefox、缩放、设置、性能、发布包需最终验收 | [#18](https://github.com/liyh1999/jy3-web-remake/issues/18) |

## 当前结论

截至上述基线，核心玩法层已经从“能跑”推进到以原 Lua / 原数据为权威的 **行为一致阶段**。当前最大的剩余工作不再是重新实现剧情或战斗，而是四类收口：

1. **兼容层清债**：把仍存在的 no-op、placeholder、missing call/object 明确分类，关键路径静默缺失归零（#23）。
2. **可比较回归基线**：把现在分散在大量 smoke/E2E 中的固定输入和关键结果整理成结构化 snapshot（#24）。
3. **可现场定位**：把 CI/console 才能看到的信息做成开发者诊断模式（#25）。
4. **视觉与发布**：主要界面与原版参考逐项对照，并完成浏览器兼容、缩放、设置、性能和版本化发布（#18、#27）。

因此当前不能把项目称为“完全复刻完成”：**行为层已经大面积一致，但主要界面尚未达到视觉一致，关键兼容层占位也尚未完成最终清零。**

## 升级 / 降级规则

后续修改本矩阵时遵循以下规则：

- 只有原 Lua / 原数据仍是权威状态，并且 source + offline dist 自动回归通过，行为状态才能升到 `行为一致`。
- 仅有“页面能点”“测试不报错”不能升到 `行为一致`。
- `视觉一致` 必须有原版参考与 Web 实际画面的对照证据；仅使用原素材不等于视觉一致。
- 新发现的重大差异必须关联具体 Issue，不允许只写在本表里长期悬空。
- 若 CI/E2E 发现已标“行为一致”的系统出现可复现偏差，应立即降级状态，直到修复并补回归。

## #19 最终验收门槛

[#19](https://github.com/liyh1999/jy3-web-remake/issues/19) 关闭前至少满足：

1. 核心玩法系统保持 `行为一致`，且固定 snapshot / E2E 可重复验证。
2. 开局、地图、对话、人物/背包/商店、战斗、小游戏等主要玩家界面达到 `视觉一致`。
3. 关键 `G.call/G.*` 未实现调用和关键 placeholder 归零。
4. 新游戏 → 地图/NPC → 门派/任务 → 战斗 → 商店/物品 → 小游戏 → 存档读档 → 主要结局存在可重复长流程。
5. 最终静态发布包不依赖 Flash、桌面 gcore、GitHub Raw 或 CDN，并有明确 runtime/build/save 版本信息。
