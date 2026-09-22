# E4 兼容层占位与缺失调用清债

固定上游：`c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

E4 不把所有 `return true/0` 一概视为错误。Web Runtime 与原桌面 gcore 的边界里，确实存在三类合法差异：

1. **bootstrap fallback**：兼容层最早加载时提供占位，随后由正式 runtime shim 覆盖。
2. **Web side-effect / replacement**：原桌面平台行为由浏览器系统等价承担，例如地图刷新、存档。
3. **visual no-op**：不改变核心数值/剧情状态，但缺少原版视觉表现；进入最终验收前必须实现或证明可安全省略。

除此之外，未知 `G.call` 继续静默 `return 0` 属于真正的兼容债务，不能作为最终状态保留。

## 机器基线

- `tools/runtime-compat-policy.json`：已知 fallback / no-op 分类。
- `tools/audit-runtime-compat-policy.mjs`：检查 `gf_web.lua` 的平台 fallback 是否全部进入分类表。
- `tools/program-api-baseline.json`：固定 24 个原 `04_program` 的 API 覆盖签名。
- CI 同时要求：
  - 静态 named `G.call` unresolved = 0；
  - 直接 `G.*` missing = 0；
  - 新增平台 fallback 必须先分类，不能悄悄加入。

## 当前分类

### Bootstrap fallback

这些定义只用于 `gf_web.lua` 独立启动或 headless harness；正常浏览器运行时会被正式实现覆盖：

- `G.Play / G.Stop` → `runtime_shims.lua` 音频路由。
- `G.wait_time` → story/minigame program scheduler。
- `G.addUI / removeUI / getUI` → `runtime_shims.lua` 原 UI module loader。
- `G.start_program / stop_program / remove_program` → story/minigame scheduler。

它们不是“功能已经用 true 糊过去”，但后续仍应逐步减少 bootstrap 与正式实现重复定义的范围。

### Web side-effect / intentional replacement

- `mapon / turn_map`：由 `runtime_shims.lua` 在原调用返回后刷新 Web 地图。
- `通用_存档`：游戏状态由 Web 多槽存档系统统一管理，原桌面文件存档 UI 不再直接写宿主文件。
- `地图系统_防修改监控`：桌面环境防修改监控不直接搬到浏览器；需要在 E4 最终确认它不承载 gameplay state。

### 剧情视觉平台桥

此前分类为 visual no-op 的剧情调用已在 E9 改为显式 Web side-effect：

- `photo0 / photo0_off`：显示和关闭原 `image/eventmap` 事件图。
- `all_over`：关闭当前对话/选项 UI，清理待回调状态。
- `dark`：关闭剧情浮层并执行黑幕转场。
- `notice1`：显示自动消退的剧情提示，处理原颜色标记，并保留原 `提示结束` 事件。
- `list`：开局问答后显示人物属性，等待玩家确认后才继续序幕。

这些调用不再静默返回；Lua 路由由 `tools/test-strict-missing-calls.mjs` 覆盖，浏览器 DOM、原事件图和层级由 `tools/e2e-dialogue-visual.mjs` 覆盖。

## 当前真正风险

`G.call` 最末仍保留：

- 记录 `missing_calls[name]`
- console 输出
- 返回 `0`

这在 POC 阶段能避免流程立即中断，但在完全复刻阶段可能把缺失关键逻辑伪装成合法返回值。

E4 后续按以下顺序收紧：

1. 先让已分类的平台调用全部走显式策略，不再靠大段条件判断。
2. 对完整 E2E / D4 长流程启用 strict missing-call 模式：遇到未分类、未实现调用直接失败。
3. 扩展到所有 CI smoke fixture。
4. 确认没有合法动态调用被误判后，移除生产运行时的未知调用静默 `return 0`。
5. 最终关键 missing call / missing object 归零，未归零项必须有明确 allowlist 和理由。

## 与其他阶段边界

- 剧情视觉平台桥：#19 最终验收。
- 固定输入和状态 snapshot：#24。
- 页面内缺失调用/对象诊断：#25。
- runtime/build/save 版本协议：#27。

E4 只负责“调用语义不能静默错误”，不在这里重新实现已经由这些 Issue 管理的 UI 或产品功能。


## E4 当前落地状态（2026-09-21）

- strict missing-call：已加入 `gf_web.lua`。
- 浏览器 E2E strict：通过。
- D4 source/offline long-flow strict：通过。
- 完整浏览器 runtime 启动成功后默认 strict；降级模式保持兼容。
- 直接宿主空壳已加入 `runtime-compat-policy.json` 分类。
- runtime missing-object 已在浏览器 E2E、D4 source、D4 offline dist 三条关键路径收紧为 **0**；CI #758 全绿。
- 之前暴露的 `0x1008001f / 0x10090001 / 0x101c0003` 均确认是原 `o_Gut / o_story / o_book_story` 真实对象，现已纳入正式 `CORE_DATA`，不再依赖 placeholder。
- E4 完成：关键长流程 unknown call / missing object 均为 0。
- E9 继续清债：`photo0 / photo0_off / all_over / dark / notice1 / list` 已从 visual no-op 降为 0 项，并改由真实 Web 视觉桥承接；剩余 direct host surface 仍按机器策略表逐项管理。
