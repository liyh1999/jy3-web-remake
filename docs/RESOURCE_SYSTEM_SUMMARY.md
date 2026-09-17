# 资源子系统产物

- `src/resource-catalog.js`：原 `dir.lua` 目录/文件规则。
- `src/resources.js`：Web 图片、尺寸和音频资源接口。
- `tools/scan-resources.mjs`：资源引用/缺失扫描。
- `tools/resource-baseline.json`：已知缺失基线。
- `tools/resource-scan-sources.json`：额外资源元数据扫描源。
- `vendor/upstream-file-index.json`：构建期生成的固定上游文件索引。
- `reports/resource-integrity.{md,json}`：本地/CI 生成的扫描报告。
