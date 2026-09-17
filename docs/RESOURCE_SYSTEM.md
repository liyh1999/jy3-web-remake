# JY3 Web 资源系统

## 目标

原 Lua / UI 继续使用原资源编号，不要求把剧情脚本改写成 Web URL。

Web 侧以 `src/resource-catalog.js` 复刻 `JY3/dir.lua` 的资源目录规则，再由 `src/resources.js` 提供浏览器加载接口。

## ID 解析

运行时资源 ID 可能带额外的高位类型 tag。Web 侧先取低 28 位作为原 path id：

```text
runtime id -> id & 0x0fffffff -> JY3 path id
```

当前可确定的文件规则：

- `fonts` -> `.ttf`
- `framelist/*` -> `.swf`
- `image/*` / `newimage` -> `.png`
- `audio/*` -> `.mp3`

目录 ID 本身只表示目录，不会错误解析成 `0000.png` 等文件。

Spine / particle 属于结构化资源集合，当前只识别所属资源族和根目录，不猜测单一文件名；具体解析和播放归 #11。

## Web API

当前提供：

```text
JYResources.resolve(id)
JYResources.getPath(id)
JYResources.url(id)
JYResources.addImage(id[, sourceId])
JYResources.imageWidth(id)
JYResources.imageHeight(id)
JYResources.imageSize(id)
JYResources.play(id[, channel, loop, volume])
JYResources.stop(channel)
```

这些能力对应原运行时中当前复刻需要的 `GetPath / addImage / imageSize / Play / Stop` 资源侧语义。

## 完整性扫描

有网更新固定上游缓存：

```bash
npm run cache:offline
```

这一步额外生成：

```text
vendor/upstream-file-index.json
```

它来自固定上游 commit 的完整 Git tree，目前用于一次性判断资源文件是否真实存在，不需要逐资源发 HTTP 请求。

执行扫描：

```bash
npm run scan:resources
```

生成：

```text
reports/resource-integrity.md
reports/resource-integrity.json
```

资源会被分类为：

- `cached`：上游存在且当前离线包已缓存
- `uncached`：上游存在，但当前纵向切片暂未打进离线包
- `dynamic-expression`：代码使用 `base + offset`、位运算等动态方式生成 ID，只记录基址，不把基址误判成固定文件
- `structured-unresolved`：Spine / particle 等结构化资源，等待专门解析器
- `missing-*`：解析出的明确目标在固定上游 revision 中不存在

`tools/resource-baseline.json` 保存已知缺失基线。CI 只会因为**新增真实缺失**失败；“上游存在但尚未缓存”不会被当成错误。

## 当前扫描基线

在开局 + 牛家村 + 当前核心数据 + `o_animation/o_image/o_font/o_fontstyle` 的扫描范围内：

```text
扫描 Lua 文件：30
唯一资源引用：343
已缓存：2
上游存在但未缓存：335
动态 ID 表达式：6
真实上游缺失：0
```

未缓存数量较大是预期状态：离线包目前只包含当前可玩纵向切片真正需要的资源。后续 #10/#11/#12/#17 接入更多 UI、动画、音频和剧情时，再根据扫描结果扩充离线清单，而不是一次性复制整个原资源库。
