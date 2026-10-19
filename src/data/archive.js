/* =========================================================
   example archive data (generated, no backend)
   SHELVES[k].records  -> array of records
   RECORDS             -> flat array      BY_ID -> Map(id -> record)
   record = { id, shelf, title, en, summary, tags[], source, level, updated, pages, words,
              status, tracks[{t, dur, body}], related[id], log[{time, who, act}] }
   ========================================================= */
import { rng, pad } from '../core/util.js';

export const SHELVES = [
  { k: 'A', zh: '研究报告', en: 'RESEARCH', col: '#e9f1f4' },
  { k: 'B', zh: '代码分析', en: 'CODEBASE', col: '#86e3ff' },
  { k: 'C', zh: '协议与规范', en: 'PROTOCOL', col: '#2bb5ee' },
  { k: 'D', zh: '事件记录', en: 'INCIDENT', col: '#ff5a3c' },
  { k: 'E', zh: '数据集', en: 'DATASET', col: '#e3a23a' },
  { k: 'F', zh: '设计文档', en: 'DESIGN', col: '#5fe3a6' },
];

/* hand-written seeds: [title, english, summary, tags, tracks[]] */
const SEED = {
  A: [
    ['飞控系统威胁建模报告', 'FLIGHT CONTROL THREAT MODEL', '基于 STRIDE 对飞控、地面站与通信链路三层进行威胁建模，识别 27 个威胁项，其中 6 项为高风险，主要集中在指令通道认证与固件更新环节。', ['威胁建模', 'STRIDE', '飞控'], ['资产与信任边界', '数据流图', 'STRIDE 逐项分析', '风险评级矩阵', '缓解措施建议']],
    ['供应链组件风险研究', 'SUPPLY CHAIN COMPONENT RISK', '对 142 个第三方依赖进行许可证、维护活跃度与已知漏洞的综合评估，提出分级准入机制。', ['供应链', 'SBOM', '依赖'], ['依赖清单与 SBOM', '漏洞关联方法', '维护活跃度指标', '准入分级策略']],
    ['LLM 代码审计能力评测', 'LLM CODE AUDIT BENCHMARK', '构建 380 个带标注的漏洞样本，对比多种大模型在漏洞定位、误报率与解释质量上的表现，并讨论推理链可视化对人工复核效率的提升。', ['LLM', '代码审计', '评测'], ['样本集构建', '评测指标设计', '定位准确率', '误报分析', '推理链与人工复核']],
  ],
  B: [
    ['flight_ctrl 模块调用图', 'FLIGHT_CTRL CALL GRAPH', 'flight_ctrl 模块的静态调用图与关键路径注释，标出从指令解析到电机输出的完整链路及其中缺失校验的节点。', ['调用图', 'C', '静态分析'], ['入口与调度', 'handle_cmd 路径', 'exec_motor 输出链', '缺失校验节点']],
    ['mavlink_parser 源码注释', 'MAVLINK PARSER WALKTHROUGH', '逐函数注释 MAVLink 解析器，重点说明长度字段、CRC 与签名校验的处理顺序，以及两个潜在的越界读取点。', ['MAVLink', '解析器', '越界'], ['帧同步与长度', 'CRC 计算', '签名校验顺序', '越界读取点']],
    ['bootloader 启动链分析', 'BOOTLOADER CHAIN ANALYSIS', '分析三级启动链的签名验证与回滚保护，发现二级引导在异常路径上会跳过版本号比较。', ['启动链', '安全启动', '固件'], ['一级 ROM 引导', '二级引导校验', '回滚保护', '异常路径']],
  ],
  C: [
    ['MAVLink 协议栈安全分析', 'MAVLINK V2 PROTOCOL STACK', 'MAVLink v2 在帧尾引入了 13 字节签名块，但大量机载固件默认未启用签名校验。本档案梳理帧结构、系统 ID 信任模型与心跳机制，并汇总了 4 类已知攻击面。', ['MAVLink', '签名', '协议'], ['帧结构与字段语义', '签名块与密钥协商', '系统 ID 信任模型', '心跳 / 指令注入面', '已知攻击面汇总']],
    ['CAN 总线帧格式规范', 'CAN BUS FRAME SPEC', '内部 CAN 总线的仲裁 ID 分配、负载格式与周期约定，附带总线负载率预算与错误帧处理策略。', ['CAN', '总线', '规范'], ['仲裁 ID 分配', '负载格式', '周期与时序', '错误帧处理']],
    ['OTA 升级协议说明', 'OTA UPDATE PROTOCOL', '描述分片传输、断点续传、差分包校验与 A/B 分区切换流程，以及升级失败时的回退条件。', ['OTA', '升级', '固件'], ['分片与续传', '差分包校验', 'A/B 分区切换', '失败回退']],
  ],
  D: [
    ['2026-07 遥测劫持事件', 'TELEMETRY HIJACK · 2026-07', '外场测试中出现遥测数据被第三方地面站接收并回注指令的事件，根因为默认系统 ID 与未启用签名，影响 3 架测试机。', ['事件', '遥测', '劫持'], ['事件时间线', '影响范围', '根因分析', '处置与复盘']],
    ['GPS 欺骗复盘记录', 'GPS SPOOFING POSTMORTEM', '模拟器复现 GPS 欺骗场景，记录 EKF 在信号漂移下的行为，以及多源融合阈值调整后的效果对比。', ['GPS', '欺骗', 'EKF'], ['复现环境', 'EKF 行为', '阈值调整', '效果对比']],
    ['密钥泄露应急记录', 'KEY LEAK RESPONSE LOG', '一次构建日志中泄露签名私钥后的 48 小时应急响应：吊销、重签、终端轮换与审计。', ['密钥', '应急', '审计'], ['发现经过', '吊销与重签', '终端轮换', '审计结论']],
  ],
  E: [
    ['飞行日志数据集 v3', 'FLIGHT LOG DATASET V3', '共 1,920 次飞行、约 640 小时的 ULog 日志，包含 23 类异常标注，可用于故障诊断模型训练。', ['数据集', 'ULog', '标注'], ['采集方式', '字段说明', '异常标注规范', '划分与基线']],
    ['协议流量采样集', 'PROTOCOL TRAFFIC SAMPLES', '覆盖 MAVLink / CAN / RTPS 的 86 GB 原始流量采样，含正常、攻击与故障三类标签。', ['流量', 'PCAP', '标签'], ['采样场景', '标签体系', '隐私处理', '使用约束']],
    ['CVE 标注语料', 'CVE ANNOTATED CORPUS', '从公开 CVE 中筛选 2,400 条与嵌入式/机器人相关的条目，补充代码片段与修复补丁对照。', ['CVE', '语料', '补丁'], ['筛选标准', '代码对照', '补丁对齐', '质量抽检']],
  ],
  F: [
    ['任务调度器设计稿', 'MISSION SCHEDULER DESIGN', '任务调度器的状态机、优先级抢占与超时策略设计，含与飞控主循环的时序配合说明。', ['设计', '调度', '状态机'], ['需求与约束', '状态机', '抢占与超时', '时序配合']],
    ['权限模型设计 v2', 'PERMISSION MODEL V2', '面向多操作员地面站的 RBAC + 指令级授权模型，引入高危指令二次确认与审计追踪。', ['权限', 'RBAC', '审计'], ['角色划分', '指令级授权', '二次确认', '审计追踪']],
    ['日志归档系统设计', 'LOG ARCHIVE SYSTEM DESIGN', '日志冷热分层、压缩编码与检索索引设计，目标是在 30 秒内定位任意一次飞行的关键事件。', ['日志', '归档', '检索'], ['分层存储', '压缩编码', '检索索引', '容量规划']],
  ],
};

/* procedural fillers per shelf */
const GEN = {
  A: { pre: ['边缘节点', '多机协同', '视觉导航', '固件更新', '遥控链路', '传感器融合', '载荷控制', '电源管理'], suf: ['风险评估报告', '安全性研究', '可靠性分析', '对比研究', '调研综述'], tag: ['研究', '评估'] },
  B: { pre: ['uORB 消息总线', 'ekf2 估计器', 'mixer 混控', 'commander 状态', 'navigator 航点', 'sensors 驱动', 'logger 记录器', 'param 参数'], suf: ['代码走读', '实现分析', '数据流追踪', '缺陷清单', '重构评估'], tag: ['源码', 'C++'] },
  C: { pre: ['RTPS / DDS', 'TLS 1.3', 'UAVCAN', '遥测链路', '数传电台', '时间同步', '远程 ID', '视频回传'], suf: ['通信规范', '握手流程', '接口约定', '报文格式', '兼容性说明'], tag: ['协议', '接口'] },
  D: { pre: ['地面站越权', '固件回滚', '传感器失效', '链路中断', '参数篡改', '电池告警', '电机异常', '日志丢失'], suf: ['事件记录', '复盘报告', '处置记录', '告警分析'], tag: ['事件', '复盘'] },
  E: { pre: ['传感器噪声', '攻击轨迹', '图像标注', '电机振动', '链路质量', '气象环境', '操作员行为', '仿真场景'], suf: ['样本库', '数据集', '采样集', '基准集'], tag: ['数据', '样本'] },
  F: { pre: ['地面站 UI', '通信冗余', '告警分级', '插件框架', '配置中心', '仿真平台', '测试流水线', '部署架构'], suf: ['设计说明', '设计稿', '架构方案', '接口设计'], tag: ['设计', '架构'] },
};
const EN = { A: 'RESEARCH', B: 'CODE STUDY', C: 'SPEC', D: 'INCIDENT', E: 'DATASET', F: 'DESIGN DOC' };
const SRC = ['内部研究', '外场测试', '红队演练', '开源社区', '合作单位', '代码审计组'];
const WHO = ['GUEST-0417', 'OPERATOR-12', 'AUDIT-BOT', 'R.LIN', 'K.ZHOU', 'S.PORTER'];
const ACT = ['读取', '引用至推演', '导出 MD', '收藏', '更新章节', '添加关联'];
const BODY = [
  '本章节梳理了{t}的背景与边界条件，并给出后续分析所依赖的关键假设。',
  '通过对比 {n} 组样本，发现主要问题集中在输入校验与异常路径处理上，正常路径表现稳定。',
  '给出了可直接落地的检查清单，共 {n} 项，其中高优先级 {m} 项建议在下个迭代内完成。',
  '与相关档案交叉引用后，确认该结论在不同固件版本间具有一致性，置信度较高。',
  '附录包含复现步骤、原始数据位置与度量口径说明，便于在推理评估模块中作为上下文输入。',
];

const r = rng(20261019);
const pick = (a) => a[Math.floor(r() * a.length)];
const PER = 16;

function mk(shelf, idx, seed) {
  const id = `${shelf.k}-${pad(idx + 1, 3)}`;
  let title, en, summary, tags, trackNames;
  if (seed) [title, en, summary, tags, trackNames] = seed;
  else {
    const g = GEN[shelf.k];
    const pre = g.pre[(idx * 5 + 3) % g.pre.length], suf = g.suf[(idx * 3 + 1) % g.suf.length];
    title = `${pre}${suf}`;
    en = `${pre.replace(/[^A-Za-z0-9 /.]/g, '').trim().toUpperCase() || shelf.en} ${EN[shelf.k]} ${pad(idx + 1)}`.replace(/\s+/g, ' ').trim();
    summary = `围绕${pre}展开的${suf.replace(/报告|说明|记录/, '')}，覆盖关键流程、已知问题与改进建议，可作为推理评估的上下文资料。`;
    tags = [...g.tag, pre.split(/[ /]/)[0]];
    trackNames = ['概述与范围', `${pre}现状`, '问题与发现', '建议与后续'].slice(0, 3 + Math.floor(r() * 2));
  }
  const tracks = trackNames.map((t, k) => ({
    t,
    dur: `${pad(2 + Math.floor(r() * 7))}:${pad(Math.floor(r() * 60))}`,
    body: BODY[(k + idx) % BODY.length].replace('{t}', t).replace('{n}', 3 + Math.floor(r() * 20)).replace('{m}', 1 + Math.floor(r() * 4)),
  }));
  const pages = 8 + Math.floor(r() * 60);
  const m = 1 + Math.floor(r() * 9), d = 1 + Math.floor(r() * 28);
  return {
    id, shelf: shelf.k, title, en, summary, tags,
    source: pick(SRC), level: pick(['L1 · 公开', 'L2 · 内部可引用', 'L2 · 内部可引用', 'L3 · 受限']),
    updated: `2026.${pad(m)}.${pad(d)} ${pad(8 + Math.floor(r() * 12))}:${pad(Math.floor(r() * 60))}`,
    pages, words: `${(pages * (0.3 + r() * 0.3)).toFixed(1)}K`,
    status: pick(['已归档 · 可读取', '已归档 · 可读取', '修订中', '待审阅']),
    tracks, related: [], log: Array.from({ length: 4 + Math.floor(r() * 4) }, (_, k) => ({
      time: `2026.${pad(Math.max(1, m - Math.floor(k / 2)))}.${pad(Math.max(1, d - k * 2))} ${pad(9 + k)}:${pad(Math.floor(r() * 60))}`,
      who: pick(WHO), act: pick(ACT),
    })),
  };
}

SHELVES.forEach((s) => { s.records = Array.from({ length: PER }, (_, i) => mk(s, i, SEED[s.k][i])); });
export const RECORDS = SHELVES.flatMap((s) => s.records);
export const BY_ID = new Map(RECORDS.map((x) => [x.id, x]));
// related: 3 records sharing a tag or neighbouring shelves
RECORDS.forEach((x, i) => {
  const same = RECORDS.filter((y) => y !== x && y.tags.some((t) => x.tags.includes(t)));
  const pool = same.length >= 3 ? same : RECORDS.filter((y) => y !== x);
  x.related = [0, 1, 2].map((k) => pool[(i * 7 + k * 11) % pool.length].id).filter((v, j, a) => a.indexOf(v) === j);
});
export const TOTAL = RECORDS.length;

/** markdown export of a record */
export function recordToMarkdown(x) {
  const s = SHELVES.find((q) => q.k === x.shelf);
  return `# ${x.id} · ${x.title}\n\n> ${x.en}\n\n| 字段 | 值 |\n|---|---|\n| 类别 | ${s.zh} / ${s.en} |\n| 来源 | ${x.source} |\n| 密级 | ${x.level} |\n| 更新 | ${x.updated} |\n| 体量 | ${x.pages} 页 · ${x.words} 字 |\n| 状态 | ${x.status} |\n| 标签 | ${x.tags.join(', ')} |\n\n## 概述\n\n${x.summary}\n\n${x.tracks.map((t, i) => `## ${pad(i + 1)} ${t.t}\n\n${t.body}\n`).join('\n')}\n## 关联档案\n\n${x.related.map((id) => `- ${id} ${BY_ID.get(id)?.title || ''}`).join('\n')}\n`;
}
