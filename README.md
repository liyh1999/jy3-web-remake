# 金庸群侠传 3 Web Remake

把《金庸群侠传 3》的 Lua 重制版逻辑迁移到现代浏览器运行时，不再依赖 Flash 或原桌面 `gcore` 引擎。

项目路线不是重新编写一套“类似金3”的游戏，而是实现一层 **Web Runtime compatibility layer**，尽可能直接运行原 Lua 剧情、事件、数据和数值规则；浏览器负责渲染、输入、音频、存档和其他平台能力。

## 基础来源

参考工程：[`ssz66666/jy3-mirror`](https://github.com/ssz66666/jy3-mirror)

当前固定上游 revision：

```text
c7b6180b9d79aa5df33f7e8375d6dd88d67a8cc8
```

上游包含较完整的 Lua 剧情/战斗/人物/武功/物品/商店数据以及图片、音频、字体和动画资源；缺失的是可直接用于 Web 的原 `gcore` 宿主。

## 当前可运行能力

目前已经不是只验证菜单的最小 POC，主线基线包括：

- Fengari 运行 Lua 5.3
- 中文 Lua 标识符自动归一化
- `G.api / G.call / QueryName / DBTable`
- 原 `p_order.lua / p_newgame.lua / p_niujiacun.lua`
- 原版开局问答完整执行并进入牛家村
- 牛家村秀才、茶博士、穆念慈原事件回归
- 基础商店桥接
- 基础背包/装备适配器
- 原 Lua 对象存档/读档 roundtrip
- 资源 ID -> Web 路径解析
- 牛家村原背景资源显示
- CI 自动覆盖开局、牛家村、背包、存档和资源解析

复刻一致性进度见 [`docs/PARITY_MATRIX.md`](docs/PARITY_MATRIX.md)。

## 开发模式启动

源码目录仍可直接以静态服务器启动：

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

Windows 可运行：

```text
start_windows.bat
```

打开：

```text
http://127.0.0.1:8080
```

开发模式会优先读取本地 `vendor/`，缺失时允许回退到固定版本的上游资源。

## 完全离线部署

安装依赖并生成自包含静态目录：

```bash
npm install
npm run build
```

构建结果：

```text
dist/
```

其中包含：

- 本地 Fengari
- 当前运行所需的固定版本原 Lua/数据
- 当前运行所需的原资源
- Web Runtime 源码
- `runtime-config.js`
- `build-info.json`

服务器部署时只需要发布 `dist/`：

```bash
python3 -m http.server 8080 --directory dist --bind 0.0.0.0
```

浏览器运行阶段的核心开局/牛家村纵向切片不再要求从 GitHub Raw 或 jsDelivr 获取文件。

## 完全复刻路线

总验收：[#19](https://github.com/liyh1999/jy3-web-remake/issues/19)

执行路线：[#20](https://github.com/liyh1999/jy3-web-remake/issues/20)

主要阶段：

1. 资源 ID、离线构建、基础渲染、输入
2. 地图、背包装备、商店、人物成长、原战斗
3. 动画、音频、小游戏、全剧情/门派/任务
4. 正式多槽存档、视觉还原、浏览器 E2E 与发布验收

具体兼容进度见 [`docs/API_PROGRESS.md`](docs/API_PROGRESS.md)。

## 版权与资源

本仓库主要保存自行编写的 Web Runtime / compatibility code。原始游戏内容来自参考仓库，其许可状态需要在公开发布完整资源包前单独确认；当前构建工具在构建阶段按固定 revision 获取运行所需内容。
