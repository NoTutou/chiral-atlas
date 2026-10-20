# CHIRAL ATLAS · 知识档案与信息推演网络

纯前端可交互网站（无后端）。知识库使用联网核验的公开漏洞档案；推理评估保留现有浏览器规则引擎。死亡搁浅 UI 语言 × 莱茵生命档案交互，全部音效由 Web Audio 实时合成。

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

## 手机和平板

- 底部导航切换首页及三个板块，顶部可开关音效；适配刘海屏、底部安全区及横竖屏。
- 首页保留 CD 阵列、推理网络和时间雨扫描器，窄屏改为纵向浏览，轻点板块进入。
- 档案库支持单指拖动、双指缩放，分类索引可横向滑动；详情可滚动阅读，支持收藏、导出和送入推演。
- 推演页按「装载资料 → 推理过程 → 评估结果」排列，顶部步骤按钮可快速定位；支持选择文件和粘贴文本。
- `npm run build` 后运行 `python tools/mobile_e2e.py`，检查 320–1440px 布局及触摸、检索、导出、推演流程（需要 Python Playwright 和 Chrome）。也可传入开发服务器地址。
- 碟片动画回归：`python3 tools/archive_animation_e2e.py`，逐帧检查展开、停留后收起、中途关闭、切换档案及滚动归位，并验证悬停时跨列凸起随距离减弱、展开期间凸起保持、归位后压平、收起波浪向四周延迟扩散并随距离减弱，以及持续低频音移除；可加 `--mode desktop`、`--mode mobile` 或 `--mode webgl` 单独检查。

## 目录

```
src/main.js            路由 / 页面生命周期 / 转场
src/core/              时钟、HUD、六边形转场、等高线背景、音效合成(sfx.js)、启动动画、共享状态
src/data/archive.js    真实漏洞目录的前端适配与 Markdown 导出
knowledge-base/       原始输入、证据快照、人工整理、生成目录及核验报告
src/data/inference.js  推演样例货物
src/pages/             hub / reserved / archive(+archive-rack, archive-gl) / inference
tools/shot.py          开发用：驱动 dev server 截图、测帧率
tools/e2e.py           开发用：对 dist 单文件做全路由冒烟测试
```

## 说明

- 推理评估为浏览器端规则引擎（正则 + 启发式），按真实内容给出带行号的证据与评分；后续可替换为大模型 API。
- 档案库在不支持 WebGL2 的环境自动回退到 Canvas 2D（URL 加 `?2d` 可强制回退）。

## 漏洞资料维护

知识库共 32 份档案，保留 BUGS.md 原有 30 条，补充 2 条官方公告；同一问题的 CVE、公告及 PoC 档案归为 29 个问题组。分类、检索、关联、收藏、导出和送入推演使用同一套数据。无限 CD 阵列会循环显示这些档案，阵列格子数不代表独立漏洞数。

资料目录和核验口径见 [knowledge-base/README.md](knowledge-base/README.md)，逐条覆盖见 [核验表](knowledge-base/VERIFICATION.md)。

- 离线重建目录：`python3 tools/build_knowledge_base.py`
- 数据与证据检查：`python3 tools/check_knowledge_base.py`
- 联网更新证据：`python3 tools/collect_vulnerabilities.py --refresh`，随后人工复核 `curation.json` 并重新构建。
- 构建网页：`npm run build`；运行方式不变，生成的 `dist/index.html` 可离线打开，外部来源链接需联网。
- 专项浏览器验收：`python3 tools/knowledge_e2e.py`。测试需要 Python Playwright；可用 `CHROME_BIN` 指定浏览器。
