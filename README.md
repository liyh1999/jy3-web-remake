# 金庸群侠传 3 Web Remake

把《金庸群侠传 3》的 Lua 重制版逻辑迁移到现代浏览器运行时，不再依赖 Flash 或原桌面 `gcore` 引擎。

当前阶段不是重新编写一套“类似金3”的游戏，而是验证并逐步实现一层 **Web Runtime compatibility layer**，尽可能保留现有 Lua 剧情、事件和数值逻辑。

## 基础来源

参考工程：[`ssz66666/jy3-mirror`](https://github.com/ssz66666/jy3-mirror)

目前已确认该仓库包含较完整的：

- Lua 剧情与事件脚本
- 战斗逻辑
- 人物 / 武功 / 物品 / 商店等数据
- 图片、音频、字体及动画资源目录
- 原 `gf / gcore` 调用体系

但缺少可直接用于 Web 的底层运行时，因此本项目的核心工作是重新实现原 `gcore.c / gf` 依赖。

## 当前 POC

第一阶段使用 Fengari 在浏览器中运行 Lua 5.3，并实现一小部分兼容 API：

- `G.api` 事件注册
- `G.call('menu')`
- `G.call('talk')`
- `G.call('story')`
- 属性读写
- 银两 / 物品 / 武功 / 队伍基础接口
- `call_battle -> get_battle`
- Lua coroutine 与浏览器异步 UI 的桥接

当前验证目标：

```text
浏览器启动
  -> Lua Runtime
  -> 开局问答
  -> 牛家村
  -> NPC 对话
  -> 简化战斗
  -> 属性变化 / 入队
```

## 启动

不要直接双击 `index.html`，请使用本地 HTTP 服务：

```bash
python -m http.server 8080
```

Windows 也可以直接运行：

```text
start_windows.bat
```

然后打开：

```text
http://127.0.0.1:8080
```

当前 POC 首次运行需要联网加载 Fengari，后续会改为项目内置依赖，实现离线运行。

## 路线

优先级：

1. 跑通原 `p_newgame.lua`
2. 实现 `QueryName` / 原静态数据加载
3. 建立资源 ID -> Web 图片 / 音频映射
4. 跑通原 `p_niujiacun.lua`
5. 接商店、物品、装备、地图
6. 移植 `p_battle.lua` 显示与输入层
7. IndexedDB 存档
8. 逐步提高原脚本 API 覆盖率

具体兼容进度见 [`docs/API_PROGRESS.md`](docs/API_PROGRESS.md)。

## 版权与资源

本仓库现阶段主要保存自行编写的 Web Runtime / compatibility code，不默认重新分发来源仓库中许可状态不明确的完整原始素材。后续资源接入会单独整理来源、许可和分发方式。
