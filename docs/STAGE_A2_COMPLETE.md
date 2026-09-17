# A2 资源 ID / 完整性扫描阶段验收

阶段：#20 A2

关联 Issue：#3、#26

## 完成项

- 原 `JY3/dir.lua` 资源目录族整理为共享 `resource-catalog.js`。
- 支持字体、framelist、图片/newimage、音频固定路径规则。
- 目录 ID 与文件 ID 分离。
- Spine / particle 按结构化资源处理，不伪造文件名。
- `GetPath / addImage / imageSize` 对应 Web 能力具备。
- MP3 可按原资源 ID 路由到浏览器音频。
- 固定上游 revision 的 JY3 文件树索引可生成并缓存。
- 资源扫描器覆盖当前运行脚本及 animation/image/font/fontstyle 元数据。
- 动态 ID 表达式与直接固定资源引用分离。
- CI 对新增真实缺失资源失败。
- 离线打包、断网运行回归与资源目录拆分兼容。

## 当前基线

```text
upstream JY3 files = 11673
Lua files scanned = 30
unique resource refs = 343
cached = 2
upstream-existing but uncached = 335
dynamic expressions = 6
missing = 0
```

## 不属于本阶段

- Grid9 / fontstyle 实际渲染：#10
- framelist / Spine 动画播放：#11
- 完整 BGM / SFX：#12
- 全量剧情脚本资源扫描：随 #17 扩展扫描源
