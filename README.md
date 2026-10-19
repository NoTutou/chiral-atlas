# CHIRAL ATLAS · 知识档案与信息推演网络

纯前端可交互网站（无后端，示例数据由代码生成）。死亡搁浅 UI 语言 × 莱茵生命档案交互，全部音效由 Web Audio 实时合成。

## 打开方式

- **在线访问**：https://notutou.github.io/chiral-atlas/ （推送到 main 后由 GitHub Actions 自动构建发布）
- **直接双击 `dist/index.html`**：单文件构建，不需要服务器，也能离线打开。
- 开发模式：`npm install` → `npm run dev` → http://localhost:5173
- 重新构建：`npm run build`（输出 `dist/index.html`）

首次打开会播放启动动画，点击或按任意键可跳过。浏览器要求先有一次点击/按键才能出声，右上角 `SFX` 或 `M` 键开关音效。

## 板块与操作

| 路由 | 内容 | 操作 |
|---|---|---|
| `#/` | 开罗尔网络图：三个板块以各自的形态出现在地图上 | 悬停锁定、点击进入，`1/2/3` 快速进入；悬停档案库的 CD 可直接打开该档案 |
| `#/reserved` | 01 预留板块（时间雨 · 未开拓区域） | 接入申请（演示） |
| `#/archive[/ID]` | 02 档案库：无限循环的等距 CD 阵列（WebGL2 渲染） | 拖拽平移 · 滚轮缩放 · WASD 移动 · 点击读取 · `/` 检索 · 分类索引飞行定位 · 收藏/导出 MD/送入推演 · 详情里 `←/→` 切换档案 |
| `#/inference` | 03 信息推理与评估 | 拖入文件/选择文件/样例货物/粘贴文本 → `Ctrl+Enter` 推演 → 6 维评分、影响效果、处置建议；引用可点开代码定位；导出 Markdown 报告 |

全局：`Q/E` 切换板块，`ESC` 返回，`M` 静音。

## 目录

```
src/main.js            路由 / 页面生命周期 / 转场
src/core/              时钟、HUD、六边形转场、等高线背景、音效合成(sfx.js)、启动动画、共享状态
src/data/archive.js    档案示例数据（6 架 × 16 份，可自行替换）
src/data/inference.js  推演样例货物
src/pages/             hub / reserved / archive(+archive-rack, archive-gl) / inference
tools/shot.py          开发用：驱动 dev server 截图、测帧率
tools/e2e.py           开发用：对 dist 单文件做全路由冒烟测试
```

## 说明

- 推理评估为浏览器端规则引擎（正则 + 启发式），按真实内容给出带行号的证据与评分；后续可替换为大模型 API。
- 档案库在不支持 WebGL2 的环境自动回退到 Canvas 2D（URL 加 `?2d` 可强制回退）。
