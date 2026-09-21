# E7 Runtime / Build / Save 版本协议

当前协议基线：

- runtimeVersion: `0.1.0`
- protocolVersion: `1`
- save schemaVersion: `2`
- upstreamRevision: `c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8`

## 单一来源

`src/version.js` 是 Web runtime 版本协议的单一来源：

- `runtimeVersion`：产品运行时版本。
- `protocolVersion`：决定存档/runtime 是否可直接互读的协议版本。

`package.json.version` 必须与 `runtimeVersion` 一致，离线构建发现不一致会直接失败。

## 构建产物

`dist/runtime-config.js` 记录：

- runtimeVersion
- protocolVersion
- upstreamRevision
- buildGeneratedAt
- Fengari version
- offline 资源配置

`dist/build-info.json` 记录相同版本信息以及缓存清单、资源数量与构建时间。

`verify-offline-dist.mjs` 会检查 runtime-config 与 build-info 的版本和构建时间一致。

## 存档

schema v2 新写入的存档包含：

- schemaVersion
- runtimeVersion
- protocolVersion
- upstream
- savedAt
- meta
- luaState

兼容规则：

1. schema 不认识：拒绝解析，并显示具体 schema 版本。
2. protocolVersion = 0 / 缺失：视为旧存档，进入 legacy 兼容读取路径。
3. protocolVersion 与当前不同：不导入 Lua 状态，返回明确“不兼容”原因。
4. protocol 相同但 upstreamRevision 不同：不导入 Lua 状态，返回 upstream 不一致原因。
5. protocol/upstream 一致但 runtimeVersion 不同：允许读取，同时报告“runtime 不同但协议兼容”。

页面存档槽会把可解析但不可读的存档标为“不可兼容”，点击读档时显示具体原因。

## 调试模式

`?debug=1` 的诊断报告包含：

- runtimeVersion
- protocolVersion
- upstreamRevision
- buildGeneratedAt
- 当前 Lua/资源/异常诊断信息

正式页面仍默认隐藏调试 UI。

## 升级规则

- 仅修 UI / 性能 / 不改变存档对象协议：runtimeVersion 可升级，protocolVersion 保持。
- 改变 Lua 状态结构、对象编号语义或导入/导出协议且无法透明兼容：protocolVersion 必须升级。
- 升级固定 upstream 时，必须重新跑 E5 snapshot、D4 source/offline、browser E2E，并审阅旧存档兼容策略。
- save schemaVersion 只在 JSON 外层存档结构需要迁移时升级，不与 runtimeVersion 混用。
