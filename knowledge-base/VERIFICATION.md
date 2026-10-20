# 核验覆盖表

原有 30 条完整保留，另补充 2 条官方公告；32 份档案归为 29 个问题组。所有档案均为公开证据整理，未在本机复现。

| 档案 | 来源 | 评级（主口径） | 修复状态 | 核验边界 |
|---|---|---|---|---|
| [CVE-2020-10281](https://www.cve.org/CVERecord?id=CVE-2020-10281) | BUGS.md 原有档案 | High 7.5 | 协议未提供原生加密；未查到对应固件修复版本 | 公开证据核对／未在本机复现；纠正输入表：将“无凭证伪造任意节点”的影响移至认证漏洞的语义范围 |
| [CVE-2020-10282](https://www.cve.org/CVERecord?id=CVE-2020-10282) | BUGS.md 原有档案 | Critical 9.8 | MAVLink 2 支持消息签名；需部署端正确配置，并非所有 v2 部署自动安全 | 公开证据核对／未在本机复现 |
| [CVE-2020-10283](https://www.cve.org/CVERecord?id=CVE-2020-10283) | BUGS.md 原有档案 | High 8.1 | 未查到统一的已修复固件版本 | 公开证据核对／未在本机复现；CNA 引用 RVD #3316 与认证漏洞有关；这是关联证据，不把两个 CVE 合并 |
| [CVE-2021-34125](https://www.cve.org/CVERecord?id=CVE-2021-34125) | BUGS.md 原有档案 | Unknown 未提供分数 | PX4 PR #17264 及 NuttX 配置相关变更；首次修复发布版本未明确 | 公开证据核对／未在本机复现；需要控制台访问权限；不将其描述为任意远程 MAVLink 节点直接可读内存 |
| [CVE-2021-46896](https://www.cve.org/CVERecord?id=CVE-2021-46896) | BUGS.md 原有档案 | Unknown 未提供分数 | PR #18371 于 2021-10-06 合入 main（0bdcd54）；首次修复发布版本未明确 | 公开证据核对／未在本机复现；与 CVE-2024-38951、CVE-2025-5640 同属轨迹消息处理问题；没有官方重复编号声明，保留独立 CVE |
| [CVE-2023-46256](https://www.cve.org/CVERecord?id=CVE-2023-46256) | BUGS.md 原有档案 | Medium 4.4 | 公告未给出已修复版本 | 公开证据核对／未在本机复现；GHSA-5hvv-q2r5-rppw 是同一漏洞的公告编号；公告和 CNA 均为 Medium 4.4 |
| [CVE-2023-47625](https://www.cve.org/CVERecord?id=CVE-2023-47625) | BUGS.md 原有档案 | Low 2.9 | PX4 1.14.0；commit d1fcd39a44e6312582c6ab02b0d5ee2599fb55aa | 公开证据核对／未在本机复现；与 CVE-2026-32706 的已知可变长度类型分支不同，旧修复不能证明后一个问题已修复 |
| [CVE-2024-24255](https://www.cve.org/CVERecord?id=CVE-2024-24255) | BUGS.md 原有档案 | High 8.1 | PR #22531 为未合并提案，2026-08-10 关闭；未确认首次修复发布版本 | 公开证据核对／未在本机复现；GHSA-p74g-gvg5-6pgc 描述同一报告主题，但其元数据没有 CVE 别名；按同报告证据关联；报告称为数据竞争；已有证据重点是异步状态更新与检查时序，不泛化为任意共享内存竞争 |
| [CVE-2024-29460](https://www.cve.org/CVERecord?id=CVE-2024-29460) | BUGS.md 原有档案 | Unknown 未提供分数 | PR #22834 于 2024-03-20 合入 main（37cadde）；首次修复发布版本待确认 | 公开证据核对／未在本机复现；需要能够修改 home 点的控制权限，不是仅通过监听链路即可触发 |
| [CVE-2024-30799](https://www.cve.org/CVERecord?id=CVE-2024-30799) | BUGS.md 原有档案 | Unknown 未提供分数 | 未确认修复版本；维护者表示 main / v1.14 按 rally point 正常返航 | 证据冲突／维护者未复现报告行为；重要证据冲突：保留 CNA 声明及原始 Issue 的反证，避免把代码执行描述当作已验证事实 |
| [CVE-2024-38951](https://www.cve.org/CVERecord?id=CVE-2024-38951) | BUGS.md 原有档案 | Unknown 未提供分数 | Issue 未确认修复发布版本；维护者要求改用受维护版本 | 公开证据核对／未在本机复现；GH-ISSUE-23251 是本 CVE 引用的原始报告，作为独立证据档案保留但不重复统计 |
| [CVE-2024-38952](https://www.cve.org/CVERecord?id=CVE-2024-38952) | BUGS.md 原有档案 | Unknown 未提供分数 | 未查到已确认修复版本 | 静态分析报告／报告者未复现；原始 Issue 明确未复现；不能标成已验证 PoC 或无认证远程溢出 |
| [CVE-2024-40427](https://www.cve.org/CVERecord?id=CVE-2024-40427) | BUGS.md 原有档案 | High 7.9 | commit e03e0261a1a0c82f545e66a1e3795956c886db71；首次修复发布版本未明确 | 公开证据核对／未在本机复现；公告标题写栈溢出，描述又提全局溢出；以 ASan 的越界 READ 证据说明实际访问方向 |
| [CVE-2025-5640](https://www.cve.org/CVERecord?id=CVE-2025-5640) | BUGS.md 原有档案 | Low 3.3 | 未确认修复发布版本；新版本适用性需单独检查 | 公开证据核对／未在本机复现；CNA 的 CVSS 3.1 为 Low 3.3、CVSS 4.0 为 Medium 4.8，攻击向量是 Local；公开 PoC 的 UDP 场景与此存在差异，分开保留；EDB-52339 明确标注此 CVE，是 PoC 文献而不是另一个独立漏洞 |
| [CVE-2025-9020](https://www.cve.org/CVERecord?id=CVE-2025-9020) | BUGS.md 原有档案 | Medium 4.5 | PR #25082；commit 4395d4f00c49b888f030f5b43e2a779f1fa78708 | 公开证据核对／未在本机复现；纠正输入表中“极端情况下远程代码执行”的无证据扩张；与 CVE-2026-32724 同组件且均为 UAF，但有独立编号、版本和修复语境，不直接合并 |
| [CVE-2025-15150](https://www.cve.org/CVERecord?id=CVE-2025-15150) | BUGS.md 原有档案 | Medium 5.3 | PR #26124；commit 338595edd1d235efd885fd5e9f45e7f9dcf4013d | 公开证据核对／未在本机复现；输入表标 High，CNA 的 CVSS 3.1 是 Medium 5.3、CVSS 4.0 是 Medium 4.8；原始报告链路场景与 CNA Local 向量不一致；需要日志输入控制能力，不等价于任意网络数据包即可利用 |
| [CVE-2026-32705](https://www.cve.org/CVERecord?id=CVE-2026-32705) | BUGS.md 原有档案 | Medium 6.8 | PX4 1.17.0-rc2 | 公开证据核对／未在本机复现 |
| [CVE-2026-32706](https://www.cve.org/CVERecord?id=CVE-2026-32706) | BUGS.md 原有档案 | High 7.1 | PX4 1.17.0-rc2 | 公开证据核对／未在本机复现；输入表 Medium 更正为 CNA/GHSA 的 High 7.1；与 CVE-2023-47625 分属不同解析分支，不能以旧补丁代替此修复 |
| [CVE-2026-32707](https://www.cve.org/CVERecord?id=CVE-2026-32707) | BUGS.md 原有档案 | Medium 5.2 | PX4 1.17.0-rc2 | 公开证据核对／未在本机复现 |
| [CVE-2026-32708](https://www.cve.org/CVERecord?id=CVE-2026-32708) | BUGS.md 原有档案 | High 7.8 | PX4 1.17.0-rc2 | 公开证据核对／未在本机复现；输入表 Medium 更正为 CNA/GHSA 的 High 7.8；不要将启用条件泛化为所有飞控的网络暴露 |
| [CVE-2026-32709](https://www.cve.org/CVERecord?id=CVE-2026-32709) | BUGS.md 原有档案 | Medium 5.4 | PX4 1.17.0-rc2 | 公开证据核对／未在本机复现；重要评级冲突：输入表 Critical，GHSA 正文写 9.8 Critical，但同公告结构化评级和 CNA 均为 Medium 5.4。页面主评级采用可追溯的结构化 CVSS，并保留此冲突 |
| [CVE-2026-32713](https://www.cve.org/CVERecord?id=CVE-2026-32713) | BUGS.md 原有档案 | Medium 4.3 | PX4 1.17.0-rc2 | 公开证据核对／未在本机复现；输入表 High 更正为 CNA/GHSA 的 Medium 4.3；不把标题中的“绕过”扩张为远程代码执行 |
| [CVE-2026-32724](https://www.cve.org/CVERecord?id=CVE-2026-32724) | BUGS.md 原有档案 | Medium 5.3 | PX4 1.17.0-rc1 | 公开证据核对／未在本机复现；同组件 CVE-2025-9020 为相关研究线索，尚无官方别名证明两者是同一条漏洞 |
| [CVE-2026-32743](https://www.cve.org/CVERecord?id=CVE-2026-32743) | BUGS.md 原有档案 | Medium 6.5 | GHSA：main；commit 616b25a280e229c24d5cf12a03dbf248df89c474；未确定发布版本 | 公开证据核对／未在本机复现；版本冲突显式保留；未把 main 的补丁直接推断为已发布固件修复；与 CVE-2025-15150 的无宽度日志文件名解析有关，但 CVE 编号和修复线索不同，保留独立记录 |
| [EDB-52339](https://www.exploit-db.com/exploits/52339) | BUGS.md 原有档案 | Low 3.3 | 沿用 CVE-2025-5640 的修复状态：未确认首次修复发布版本 | 公开 PoC 文献／未执行；网页登记日期 2025-06-26，代码注释日期 2025-06-21，分别保留；原网页直接下载返回 HTTP 403，本地保存的是通过网页工具核读的人工摘要，不冒充原始页面快照 |
| [GH-ISSUE-18385](https://github.com/PX4/PX4-Autopilot/issues/18385) | BUGS.md 原有档案 | Unknown 未提供分数 | PR #18411；首次修复发布版本未明确 | 公开证据核对／未在本机复现；原始输入标 High，但 Issue 没有正式 CVSS，页面保留“未评级” |
| [GH-ISSUE-23251](https://github.com/PX4/PX4-Autopilot/issues/23251) | BUGS.md 原有档案 | Unknown 未提供分数 | Issue 未给出修复发布版本；维护者建议测试最新维护版本 | 公开证据核对／未在本机复现；保留原始 30 条输入中的 Issue 编号，并与 CVE-2024-38951 做原始报告关系跳转 |
| [GHSA-5hvv-q2r5-rppw](https://github.com/PX4/PX4-Autopilot/security/advisories/GHSA-5hvv-q2r5-rppw) | BUGS.md 原有档案 | Medium 4.4 | 公告未指定已修复版本 | 公开证据核对／未在本机复现；原始输入标 High，经 CNA 与仓库公告核验改为 Medium 4.4；此条作为公告档案保留，与 CVE 共用同一漏洞组 |
| [GHSL-2025-087](https://securitylab.github.com/advisories/GHSL-2025-087_PX4_PX4-Autopilot/) | BUGS.md 原有档案 | Medium 未提供分数 | GitHub Security Lab：2025-08-15 修复；仓库公告 main | 公开证据核对／未在本机复现；输入表 High，仓库公告为 Medium 且未提供 CVSS 数值；与 GHSA-rfc7-3pxc-c68p 属同一文档 CI 链路的不同注入位置，分别记录 |
| [MAVLINK-ISSUE-474](https://github.com/mavlink/mavlink/issues/474) | BUGS.md 原有档案 | Unknown 未提供分数 | 2016-03-22 评论称修复已进入代码；未给出可追溯发布版本或提交 | 公开证据核对／未在本机复现；原表将该库报告泛化为 PX4 漏洞；这里明确实现语言与范围；原始 Medium 无正式评分出处，页面显示未评级 |
| [GHSA-x57h-c282-63hg](https://github.com/PX4/PX4-Autopilot/security/advisories/GHSA-x57h-c282-63hg) | 补充官方公告 | High 8.2 | 公告给出临时修复思路；未指定正式修复版本 | 公开证据核对／未在本机复现；补充条目；未分配 CVE 的仓库安全公告，不能自行编造 CVE 编号 |
| [GHSA-rfc7-3pxc-c68p](https://github.com/PX4/PX4-Autopilot/security/advisories/GHSA-rfc7-3pxc-c68p) | 补充官方公告 | Medium 5.3 | 公告：main；2025-08-15 工作流修复 | 公开证据核对／未在本机复现；补充条目；与 GHSL-2025-087 的 docs_pr_comment.yml 是不同注入位置，关联而不合并 |
