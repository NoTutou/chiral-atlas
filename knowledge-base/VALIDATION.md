# 验收记录

验收日期：2026-10-20。针对本地单文件构建，未部署或推送远端。测试使用 Chromium；尚未覆盖 Safari、Firefox 和真实手机硬件。

| 检查 | 结果与覆盖 |
|---|---|
| 数据完整性 | 30 条原始档案全部保留，补充 2 条，共 32 份档案、29 个问题组；六类均有真实记录 |
| 证据完整性 | 78 个证据文件的 SHA-256、来源地址、采集方式、引用、评级和双向关联通过校验；离线再生成结果一致 |
| 原始输入 | `input/BUGS.md` 与原路径文件逐字节一致；原文件未修改 |
| 构建 | `npm run build` 通过，生成 `dist/index.html` 单文件 |
| 逐条详情 | 32 份档案逐条检查标题、版本、同类前后切换、六个分析章节、参考链接、关联数量；未出现 undefined / NaN |
| 交叉联动 | 同问题档案跳转、前后切换、标签检索、别名搜索、超过八条结果及键盘导航、收藏、旧示例收藏清理通过 |
| 导出与推演 | Markdown 包含全部分析、来源地址、哈希、评级冲突和原始行；送入现有推演页携带真实档案内容 |
| 响应式与触摸 | 320、390、430、768、844、1024、1440px 的 35 项路由布局检查，以及拖动、缩放、取消触摸、检索、导出、推演流程通过 |
| 2D 回退 | 320px 窄屏下长 GHSA 编号、四个详情页签、来源哈希及关联跳转通过，无水平溢出 |
| 运行错误与依赖 | 浏览器检查未发现页面脚本错误；知识库检查未产生运行时 fetch / XHR 请求 |

资料真实性核验与软件测试分开记录：以上测试证明数据完整性与页面行为，不代表已在飞控、仿真器或生产环境复现漏洞。各档案的具体证据限制见 `VERIFICATION.md` 和来源材料。

## 复查

在项目根目录执行：

```sh
python3 tools/check_knowledge_base.py
npm run build
python3 tools/e2e.py
python3 tools/mobile_e2e.py
python3 tools/knowledge_e2e.py
```

浏览器脚本需要 Python Playwright 和 Chromium，可通过 `CHROME_BIN` 指定已有浏览器。`knowledge_e2e.py --flows-only` 可仅复查交叉联动与窄屏流程；完整执行还会检查全部 32 份档案。

本次截图保存在 `shots/knowledge_desktop_detail.png` 和 `shots/knowledge_mobile_sources.png`；`shots/` 与 `dist/` 按项目现有规则不纳入 Git。
