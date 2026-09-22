# JY3 Web 复刻一致性矩阵

> 基线更新时间：2026-09-22
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
| 开局问答 / 建角 | 行为一致 | 视觉一致 | 原 `p_newgame.lua` 完整问答；真实浏览器从“开始”走到牛家村；属性写回原 `o_body`；标题页复用原 `v_title.lua` 背景/Logo/按钮和 853×480 坐标；E9 恢复 `list` 属性确认页 | 原资源、坐标、字体加载和实际点击命中均已进入浏览器门禁 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| Lua 数据对象 / QueryName | 行为一致 | — | 原 `o_*` 数据注册；`QueryName / DBTable`；动态对象、deepcopy、存档对象图回归；关键长流程 missing object = 0 | 无阻塞差异 | [#23](https://github.com/liyh1999/jy3-web-remake/issues/23) |
| 牛家村 / NPC / 对话事件 | 行为一致 | 视觉一致 | 原 `p_niujiacun.lua`；黄蓉、穆念慈等真实事件；原牛家村背景、对话框和头像；E9 接通 `photo0 / all_over / dark / notice1` 剧情视觉桥 | Web 等价交互保留原素材、逻辑坐标和层级 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 城镇地图 / 世界地图 / 热点 | 行为一致 | 视觉一致 | 原 `o_citymap_system_*`、`p_citymap_system.lua`；43 个世界地图节点、隐藏/解锁、往返及存档回归；原地图资源和热点逻辑坐标 | 无阻塞差异 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 人物面板 / 背包 / 装备 | 行为一致 | 视觉一致 | 原 `o_body/o_item/o_equip`；人物页复用 `v_book`，背包复用 `v_item` 的原资源并保持 853×480 逻辑坐标；最终视觉 E2E 与试玩截图通过 | 子菜单采用 Web 等价排版，不改变原状态规则 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 商店 / 经济 | 行为一致 | 视觉一致 | 原 `o_shop`、`p_order.lua`；商店复用 `v_shop` 原窗口；买卖、数量、讲价、库存边界和视觉 E2E 通过 | 数量输入采用 Web 等价控件 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 人物成长 / 队伍 / 武功 / 关系 | 行为一致 | 视觉一致 | 原 `o_body/o_role/o_teammate/o_skill`；加入/离队、升级、熟练度、关系互动、战斗共享状态、save roundtrip；人物页使用原 `v_book` 骨架并通过截图复核 | 队伍卡片和武功列表采用 Web 等价排版 | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 原 `p_battle.lua` 战斗 | 行为一致 | 视觉一致 | C1-C4 原战斗状态机；真实浏览器穆念慈战斗/逃跑；原 `v_battle` 640×480 几何、11 个站位、素材和效果门禁通过 | 无阻塞差异 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 动画 / framelist / 特效 | 行为一致 | 视觉一致 | 833 个 framelist 格式审计；统一播放器；frameActionID；角色、skill/effect、多目标偏移；离线逐帧资源验证 | 固定上游无标准 Spine skeleton，按其 PNG/framelist 序列等价播放 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| BGM / 音效 | 行为一致 | — | 原资源 ID、`G.Play/G.Stop`、通道、循环/停止/替换、自动播放恢复、页面生命周期、音量持久化及代表调用签名审计 | 浏览器自动播放限制由首次用户操作恢复 | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) |
| 伐木 / 采矿 / 钓鱼 / 打猎 / 押宝 | 行为一致 | 视觉一致 | 五小游戏均运行固定 upstream Lua；原 UI module loader、奖励/父剧情恢复、连续隔离、离线回归和全 853×480 视觉门禁 | 无阻塞差异 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 全剧情 / 10 门派 / 15 天书 / 聚贤庄任务 | 行为一致 | 视觉一致 | 固定 `04_program` 全程序编译/API 基线；10 门派、15 天书、47 路由、高风险路径及跨模块长流程；剧情事件图/提示/黑幕完整接通 | 长尾剧情共用已验收的原对话、事件图和战斗表现协议 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) |
| 多槽存档 / 自动存档 / 迁移 | 行为一致 | 可玩 | 3 手动槽 + autosave；schema v2；Lua 对象图 roundtrip；旧档迁移；坏档保护；真实浏览器 save/load | 存档控件是明确的 Web 产品化界面，不属于原游戏画面复刻范围；版本协议已完成 | [#27](https://github.com/liyh1999/jy3-web-remake/issues/27) |
| 资源 ID / 路由 / 离线资源 | 行为一致 | — | `dir.lua` 426 项目录映射；type-tag 解析；资源完整性扫描；固定上游；离线 cache/build/verify；版本化发布包已验证 | 新增真实路径必须持续进入离线清单；E9 新接通的 18 张剧情事件图已加入固定缓存 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 浏览器 E2E | 行为一致 | — | #21 已完成；真实 headless Chrome：开局 → 牛家村 → NPC → 穆念慈原战斗 → 逃跑 → slot1 保存 → 状态修改 → 读档恢复；console/exception 监控 | 后续新关键系统改动必须追加页面级路径，不能只靠 Lua harness | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) |
| 完全离线部署 | 行为一致 | — | 固定 Fengari / upstream；SHA-256 cache；`build:offline`；断网 runtime；CI 最终 offline smoke；v0.1.0 版本化发布包、校验清单与部署文档已完成 | 保持每次发布的离线包、哈希和真实浏览器长流程门禁 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 关键 G.call / 平台占位 | 行为一致 | — | 静态 unresolved `G.call` = 0、直接缺失 `G.*` = 0；关键长流程 missing call/object = 0；E9 平台 visual no-op 从 6 项降为 0，剧情表现改走显式 Web bridge | 仍有 bootstrap fallback 和已分类 direct host surface；新增调用必须进入策略表并通过 strict 回归 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 固定回归样本 / snapshot | 行为一致 | — | `tools/regression-snapshots.json` 统一固定 upstream/runtime、开局、地图、商店、战斗、人物、存档、五小游戏；9 个权威回归消费者 + CI validator；最终视觉证据由浏览器门禁和试玩报告补齐 | snapshot 更新必须显式评审 | [#24](https://github.com/liyh1999/jy3-web-remake/issues/24) [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |
| 现场诊断 / 开发者模式 | 行为一致 | — | `?debug=1` 开启统一诊断面板；显示 missing call/object、当前/最近事件、地图、存档/运行对象数、Lua runtime trace、JS/Lua 异常堆栈、图片/音频失败；可复制 JSON 报告；正式页面默认隐藏；离线 Chrome E2E 已覆盖 | 后续只需随新模块扩展诊断字段，不再是阻塞项 | [#25](https://github.com/liyh1999/jy3-web-remake/issues/25) |
| runtime / build / save 版本协议 | 行为一致 | — | `src/version.js` 提供 runtimeVersion/protocolVersion；runtime-config/build-info 记录 runtime/protocol/upstream/build time；新存档记录 schema/runtime/protocol/upstream；legacy 兼容；protocol/upstream 不匹配明确阻止导入；debug 可查看版本；CI #810 全绿 | 后续版本升级必须按 `docs/E7_VERSION_PROTOCOL.md` 更新并重跑 E5/E2/D4 | [#27](https://github.com/liyh1999/jy3-web-remake/issues/27) |
| 整体视觉复刻 / 浏览器兼容 / 发布 | 行为一致 | 视觉一致 | E8/E9 完成 853×480 缩放、主要界面视觉门禁、离线中文字体、Chrome/Edge/Firefox、版本化发布包、发布长流程与人工截图复核 | 无阻塞差异；宿主窗口/文件系统等桌面能力采用已分类的 Web 等价实现 | [#19](https://github.com/liyh1999/jy3-web-remake/issues/19) |

## 当前结论

截至上述基线，E1–E9 已完成。核心玩法以原 Lua / 原数据为权威，主要界面使用原资源和原逻辑坐标；剧情平台 visual no-op、静态 unresolved `G.call`、直接缺失 `G.*`、关键长流程 missing call/object 均为 0。版本化离线包已经通过 D4 长流程、真实浏览器核心流程、视觉门禁和探索性试玩。

当前没有阻塞 #19 总验收的剩余任务。桌面宿主文件系统、防修改监控和窗口接口保留为明确分类的 Web 等价实现，不计为玩法或视觉缺失。

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
