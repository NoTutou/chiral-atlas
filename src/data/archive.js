/* Static, source-backed catalog. Rebuild offline with tools/build_knowledge_base.py. */
import catalog from '../../knowledge-base/catalog.json';

export const SHELVES = [
  { k: 'A', zh: '内存与边界', en: 'MEMORY', col: '#e9f1f4' },
  { k: 'B', zh: '认证与通信', en: 'PROTOCOL', col: '#86e3ff' },
  { k: 'C', zh: '文件与权限', en: 'FILESYSTEM', col: '#2bb5ee' },
  { k: 'D', zh: '并发与生命周期', en: 'CONCURRENCY', col: '#ff5a3c' },
  { k: 'E', zh: '飞行逻辑', en: 'FLIGHT LOGIC', col: '#e3a23a' },
  { k: 'F', zh: '供应链与构建', en: 'BUILD CHAIN', col: '#5fe3a6' },
];
export const RECORDS = catalog.records;
export const BY_ID = new Map(RECORDS.map((r) => [r.id, r]));
SHELVES.forEach((s) => { s.records = RECORDS.filter((r) => r.shelf === s.k); });
export const TOTAL = RECORDS.length;
export const GROUP_TOTAL = catalog.groupCount;
export const VERIFIED_AT = catalog.verifiedAt.slice(0, 10);
export const RATING_POLICY = catalog.ratingPolicy;
export const ratingText = (x) => x.severity === 'Unknown' ? '未评级' : `${x.severity}${x.rating.score === null ? ' · 无分数' : ' · ' + x.rating.score}`;

/** Same evidence, uncertainty and relationships are exported and sent to inference. */
export function recordToMarkdown(x) {
  const shelf = SHELVES.find((s) => s.k === x.shelf);
  return `# ${x.id} · ${x.title}\n\n> ${x.en}\n\n` +
    [['分类', shelf.zh], ['组件', x.component], ['档案来源', x.origin], ['问题组', x.canonicalId],
      ['评级', `${ratingText(x)} / CVSS ${x.rating.version || '未提供'} / ${x.rating.source || '无评分来源'}`],
      ['受影响范围', x.affected], ['修复状态', x.fixed], ['首次来源发布', x.published || '未确认'],
      ['来源更新', x.updated || '未确认'], ['本次资料核验', x.verifiedAt], ['验证边界', x.verification],
      ['关联编号', x.aliases.join(', ') || '无'], ['标签', x.tags.join(', ')]].map(([k,v])=>`- ${k}：${v}`).join('\n') +
    `\n\n## 概述\n\n${x.summary}\n\n` + x.tracks.map((t)=>`## ${t.t}\n\n${t.body}\n`).join('\n') +
    `\n## 来源评级\n\n${RATING_POLICY}\n\n` + (x.ratings.map((r)=>`- ${r.source}：CVSS ${r.version} / ${r.severity} / ${r.score ?? '无分数'}\n  ${r.vector}`).join('\n') || '公开来源未提供评级。') +
    `\n\n## 关联档案\n\n` + x.related.map((r)=>`- ${r.id} · ${BY_ID.get(r.id).title}（${r.type}）：${r.reason}`).join('\n') +
    `\n\n## 来源与核验\n\n` + x.sources.map((s)=>`- [${s.label}](${s.url})\n  核验：${s.retrievedAt}；方法：${s.method}\n  快照：${s.snapshot}\n  SHA-256：${s.sha256}`).join('\n\n') +
    `\n\n## 来源时间线\n\n` + (x.timeline.map((e)=>`- ${e.time}：${e.event}（${e.source}）`).join('\n') || '未取得可确认的来源时间。') +
    (x.original ? `\n\n## 原始 BUGS.md 行（未经修正的输入）\n\n${x.original.join(' | ')}\n` : '\n');
}
