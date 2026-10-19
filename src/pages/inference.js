/* =========================================================
   03 INFERENCE · 信息推理与评估
   input cargo (files / samples / paste / archive records)
   -> local heuristic engine (src/data/inference.js)
   -> animated reasoning trace -> interactive evaluation
   ========================================================= */
import './inference.css';
import { clamp, lerp, seg, ease, damp, pad, nf, fitCanvas, hexPath, $, $$, esc, Bag, download } from '../core/util.js';
import { SAMPLES, GOALS, DIMS, analyze, kindOf, extOf, estTokens } from '../data/inference.js';
import { BY_ID, recordToMarkdown } from '../data/archive.js';

/* ---------------- constants ---------------- */
const MAXC = 8;
const FLY = 380, SCAN = 720;
const R0 = 300, STEP = 680, NSTEP = 7, R1 = R0 + STEP * NSTEP, E0 = R1 + 100, EEND = E0 + 3000;
const KIND = {
  doc: { sub: 'DOC', col: '#2bb5ee', zh: '需求 / 设计文档' },
  code: { sub: 'SRC', col: '#5fe3a6', zh: '代码上下文' },
  patch: { sub: 'PATCH', col: '#e3a23a', zh: '变更记录' },
  text: { sub: 'TEXT', col: '#e9f1f4', zh: '补充上下文' },
  record: { sub: 'ARCH', col: '#86e3ff', zh: '档案库记录' },
};
const NODES = [
  { en: 'PARSE', zh: '解析输入', fx: 0.09, fy: 0.5 },
  { en: 'EXTRACT', zh: '实体抽取', fx: 0.295, fy: 0.29 },
  { en: 'MAP', zh: '代码路径映射', fx: 0.295, fy: 0.71 },
  { en: 'HYPOTHESIZE', zh: '假设生成', fx: 0.5, fy: 0.5 },
  { en: 'VERIFY', zh: '证据验证', fx: 0.705, fy: 0.29 },
  { en: 'IMPACT', zh: '影响建模', fx: 0.705, fy: 0.71 },
  { en: 'SCORE', zh: '评分合成', fx: 0.91, fy: 0.5 },
];
const EDGES = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]];
const BIN_EXT = /^(pdf|png|jpe?g|gif|webp|zip|rar|7z|gz|exe|dll|so|bin|docx?|xlsx?|pptx?|mp[34]|wav|mov|woff2?|ttf)$/i;
const LIKE_SVG = '<svg viewBox="0 0 24 24"><path d="M2 10h4v11H2zM8 21h9.6a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 19 10h-5.4l.8-4.2A1.8 1.8 0 0 0 12.6 3.6L8 9.2z" fill="#e9f1f4"/></svg>';

let S = null;   // page state (null when unmounted)
const KEEP = { cargo: [], goal: null };   // manifest + goal survive leaving the page

/* ---------------- helpers ---------------- */
const fmtT = (ms) => { ms = Math.max(0, ms); return pad(Math.floor(ms / 60000)) + ':' + pad(Math.floor(ms / 1000) % 60) + '.' + pad(Math.floor(ms / 10) % 100); };
const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const bez = (a, b) => { const dx = b.x - a.x; return [a, { x: a.x + dx * 0.5, y: a.y }, { x: b.x - dx * 0.5, y: b.y }, b]; };
const bpt = (P, t) => { const u = 1 - t; return { x: u * u * u * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t * t * t * P[3].x, y: u * u * u * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t * t * t * P[3].y }; };
function bdraw(g, P, p) {
  g.beginPath();
  const N = 36;
  for (let i = 0; i <= N * p; i++) { const q = bpt(P, i / N); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
  if (p < 1) { const q = bpt(P, p); g.lineTo(q.x, q.y); }
  g.stroke();
}
function integrityOf(kind, text) {
  if (/�/.test(text)) return { v: 88, warn: '含无法解码字符' };
  if (kind === 'patch') {
    // verify hunk headers against actual line counts
    const L = text.split('\n');
    let bad = 0;
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
      if (!m) continue;
      let o = 0, n = 0;
      for (let j = i + 1; j < L.length && !/^@@|^diff --git/.test(L[j]); j++) {
        const c = L[j][0];
        if (c === '-') o++; else if (c === '+') n++; else if (c === ' ' || L[j] === '') { o++; n++; }
      }
      if (Math.abs(o - +(m[1] ?? 1)) > 1 || Math.abs(n - +(m[2] ?? 1)) > 1) bad++;
    }
    if (bad) return { v: 92, warn: `${bad} 个 hunk 行数与头部不一致` };
  }
  if (text.split('\n').some((l) => l.length > 600)) return { v: 95, warn: '存在超长行' };
  return { v: 100, warn: '' };
}
const KW_RE = /(\/\/.*$|#(?!include|define|ifn?def|endif|pragma).*$|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|return|if|else|elif|for|while|in|import|from|try|except|with|as|class|not|and|or|None|True|False|int|char|void|size_t|long|const|struct|typedef|static|unsigned|function|let|var|new|async|await|break|continue|#include|#define)\b|\b([A-Za-z_]\w*)(?=\s*\()/g;
function hlLine(src, kind) {
  if (kind === 'patch') return `<span class="${src[0] === '+' ? 'add' : src[0] === '-' ? 'del' : ''}">${esc(src)}</span>`;
  if (kind !== 'code') return esc(src);
  let out = '', last = 0;
  for (const m of src.matchAll(KW_RE)) {
    out += esc(src.slice(last, m.index));
    out += `<span class="${m[1] ? 'cm' : m[2] ? 'sv' : m[3] ? 'kw' : 'fn2'}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}
function codeHTML(file, line, before = 2, after = 3) {
  const a = Math.max(1, line - before), b = Math.min(file.lines.length, line + after);
  let html = '';
  for (let i = a; i <= b; i++) html += `<span class="l${i === line ? ' hl' : ''}"><span class="n">${i}</span>${hlLine(file.lines[i - 1], file.kind)}</span>`;
  return { html, a, b };
}

/* ---------------- cargo ---------------- */
function makeCargo({ id, name, kind, text, size }) {
  const k = KIND[kind] ? kind : 'text';
  const e = extOf(name).toUpperCase();
  const ext = k === 'patch' ? 'DIFF' : k === 'record' ? 'REC' : (e || 'TXT').slice(0, 4);
  const lines = text.split('\n').length;
  const integ = integrityOf(k, text);
  return { id: id || 'u-' + name + '-' + text.length, name, kind: k, text, size: size ?? new Blob([text]).size, lines, tok: estTokens(text),
    ext, ...KIND[k], integ: integ.v, warn: integ.warn, t0: 0, el: null, ph: 0 };
}
function cargoFromStore(item) {
  if (item.text) return makeCargo({ id: item.id, name: item.name || item.id, kind: item.kind || 'text', text: item.text, size: item.size });
  const rec = item.from || BY_ID.get(item.id);
  if (!rec) return null;
  return makeCargo({ id: item.id || rec.id, name: `${rec.id} ${rec.title}.md`, kind: 'record', text: recordToMarkdown(rec) });
}

function addCargo(c, delay = 0) {
  if (!c) return false;
  if (S.phase === 'running') { S.ctx.toast('推演进行中，暂不能装载'); S.ctx.sfx.play('deny'); return false; }
  if (S.cargo.some((x) => x.id === c.id || x.name === c.name)) { S.ctx.toast(`「${esc(c.name)}」已在货单中`); return false; }
  if (S.cargo.length >= MAXC) { S.ctx.toast(`货单已满（最多 ${MAXC} 件）`); S.ctx.sfx.play('deny'); return false; }
  c.t0 = S.t + delay;
  S.cargo.push(c);
  if (S.phase === 'done') S.stale = true;
  renderSlots();
  return true;
}
function removeCargo(id) {
  if (S.phase === 'running') return;
  const i = S.cargo.findIndex((x) => x.id === id);
  if (i < 0) return;
  S.cargo.splice(i, 1);
  const si = S.ctx.store.cargo.findIndex((x) => x.id === id);
  if (si >= 0) S.ctx.store.cargo.splice(si, 1);
  if (S.phase === 'done') S.stale = true;
  S.ctx.sfx.play('back');
  renderSlots();
}
function renderSlots() {
  const box = S.el.slots;
  // keep existing card elements, rebuild the order
  const frag = document.createDocumentFragment();
  S.cargo.forEach((c, i) => {
    if (!c.el) {
      c.el = document.createElement('div');
      c.el.className = 'slot';
      c.el.innerHTML = `<div class="card"><div class="scanband"></div><div class="scan"></div>
        <div class="ico" style="--c:${c.col}"><b>${esc(c.ext)}</b><i>${c.sub}</i></div>
        <div class="cb"><div class="r1"><span class="fn" title="${esc(c.name)}">${esc(c.name)}</span><span class="st">QUEUED</span></div>
          <div class="r2">${c.zh} · <b>${fmtSize(c.size)}</b> · <b>${nf(c.lines)} 行</b>${c.warn ? ` · <span class="c-gold">${c.warn}</span>` : ''}</div>
          <div class="r3"><div class="segs">${'<i></i>'.repeat(24)}</div><span class="pc">0%</span></div></div>
        <span class="x" data-rm="${esc(c.id)}" data-h title="移除">✕</span></div>`;
      c.q = { card: $('.card', c.el), scan: $('.scan', c.el), band: $('.scanband', c.el), st: $('.st', c.el), segs: $$('.segs i', c.el), pc: $('.pc', c.el) };
      c.ph = 0;
    }
    c.idx = i;
    frag.appendChild(c.el);
  });
  for (let i = S.cargo.length; i < 3; i++) {
    const e = document.createElement('div');
    e.className = 'slot';
    e.innerHTML = `<div class="empty">SLOT ${pad(i + 1)} &nbsp;—&nbsp; EMPTY</div>`;
    frag.appendChild(e);
  }
  box.replaceChildren(frag);
  S.el.cargoN.textContent = `CARGO ${S.cargo.length}/${MAXC}`;
  // legend by kind
  const kinds = [...new Set(S.cargo.map((c) => c.kind))];
  S.el.comp.innerHTML = kinds.map((k) => `<i data-k="${k}" style="background:${KIND[k].col};width:0"></i>`).join('');
  S.el.legend.innerHTML = kinds.map((k) => `<span data-k="${k}"><s style="background:${KIND[k].col}"></s>${KIND[k].sub}<b>--</b></span>`).join('');
  renderMenu();
}

async function readFiles(list) {
  const files = [...list];
  let delay = 0;
  for (const f of files) {
    const e = extOf(f.name);
    if (BIN_EXT.test(e)) { S.ctx.toast(`「${esc(f.name)}」是二进制格式，请转为文本后再装载`); S.ctx.sfx.play('deny'); continue; }
    if (f.size > 2 * 1048576) { S.ctx.toast(`「${esc(f.name)}」超过 2 MB`); S.ctx.sfx.play('deny'); continue; }
    let text;
    try { text = await f.text(); } catch { S.ctx.toast('读取失败'); continue; }
    const head = text.slice(0, 4000);
    const bad = (head.match(/�/g) || []).length;
    if (/\u0000/.test(head) || bad > head.length * 0.05) { S.ctx.toast(`「${esc(f.name)}」不是文本文件`); S.ctx.sfx.play('deny'); continue; }
    if (!S) return;
    if (addCargo(makeCargo({ id: 'f-' + f.name + '-' + f.size, name: f.name, kind: kindOf(f.name, text), text, size: f.size }), delay)) delay += 160;
  }
}

/* ---------------- run ---------------- */
function ready() { return S.cargo.length > 0 && S.cargo.every((c) => S.t >= c.t0 + FLY + SCAN); }
function startRun() {
  if (S.phase === 'running') return;
  if (!ready()) { S.ctx.sfx.play('deny'); S.ctx.toast(S.cargo.length ? '货物装载中…' : '请先装载原始资料'); return; }
  const goal = S.el.goal.value.trim() || GOALS[0][1];
  S.result = analyze(S.cargo.map((c) => ({ name: c.name, kind: c.kind, text: c.text })), goal);
  S.goalUsed = goal;
  S.run = { t0: S.t, fired: new Set() };
  S.phase = 'running';
  S.stale = false;
  S.autoScroll = true;
  S.dimSel = -1;
  S.likes = S.result.likes;
  S.finalized = false;
  closePeek();
  S.root.classList.add('running');
  buildResultDOM();
  S.ctx.sfx.play('confirm');
}
function clearAll() {
  if (S.phase === 'running') return;
  S.cargo.forEach((c) => { const si = S.ctx.store.cargo.findIndex((x) => x.id === c.id); if (si >= 0) S.ctx.store.cargo.splice(si, 1); });
  S.cargo = [];
  S.phase = 'idle'; S.run = null; S.result = null; S.stale = false;
  closePeek();
  S.el.logc.innerHTML = '';
  S.lines = [];
  renderSlots();
  resetRight();
  S.ctx.sfx.play('back');
}

/* ---------------- result DOM ---------------- */
function segHTML(segs, n) {
  let out = '', left = n;
  for (const [ty, tx] of segs) {
    if (left <= 0) break;
    const s = tx.slice(0, left), full = s.length === tx.length;
    left -= tx.length;
    if (ty === 't') out += esc(s);
    else if (ty === 'c') {
      const [f, l] = tx.split(':L');
      out += full ? `<span class="c" data-f="${esc(f)}" data-l="${l}" data-h>[${esc(tx)}]</span>` : `<span class="c">[${esc(s)}</span>`;
    } else out += `<span class="${ty}">${esc(s)}</span>`;
  }
  return out;
}
function buildResultDOM() {
  const R = S.result;
  const logc = S.el.logc;
  logc.innerHTML = '';
  const per = {};
  S.lines = R.log.map((L) => {
    const n = (per[L.step] = (per[L.step] || 0) + 1) - 1;
    const count = R.log.filter((x) => x.step === L.step).length;
    const st = R0 + L.step * STEP + 80 + n * Math.min(190, (STEP - 120) / Math.max(1, count - 1 || 1));
    const el = document.createElement('div');
    let len = 0;
    if (L.sub === 'code') {
      const file = R.files.find((f) => f.name === L.cite.f);
      const { html, a, b } = codeHTML(file, L.cite.l);
      el.className = 'code';
      const ei = R.findings.findIndex((x) => x.file === L.cite.f && x.line === L.cite.l);
      el.innerHTML = `<div class="hd"><b>${esc(file.name)}</b><span>L${a} – L${b}</span><span style="margin-left:auto">EVIDENCE #${pad(ei + 1)}</span></div><pre>${html}</pre>`;
    } else {
      el.className = 'ln' + (L.sub ? ' sub' : '');
      el.innerHTML = `<span class="ts"></span><span class="tg">${L.sub ? '' : `<i>${pad(L.step + 1)}</i><b>${NODES[L.step].en}</b>`}</span><span class="msg"></span>`;
      len = L.segs.reduce((a, s) => a + s[1].length + (s[0] === 'c' ? 2 : 0), 0);
    }
    el.style.display = 'none';
    el.dataset.tag = L.tag;
    logc.appendChild(el);
    return { L, el, st, dur: L.sub === 'code' ? 280 : Math.min(360, 90 + len * 7), len, msg: el.querySelector('.msg'), ts: el.querySelector('.ts'), n: -1, shown: false };
  });
  // right column
  S.el.dims.innerHTML = DIMS.map((d, i) => `<div class="dim" data-dim="${i}" data-h><span class="dn">${d.zh}</span><span class="de">${d.en}</span><div class="db"><i></i><b></b></div><span class="dv">--</span><span class="vd" title="${esc(R.verdict[i])}">${esc(R.verdict[i])}</span></div>`).join('');
  S.el.dimEls = $$('.dim', S.el.dims).map((el) => ({ el, bar: $('.db i', el), dv: $('.dv', el), vd: $('.vd', el) }));
  S.el.scope.innerHTML = R.scope.map((s, k) => `<div class="srow"><span class="sn">${s.zh}</span><span class="sg">${'<i></i>'.repeat(5)}</span><span class="sc2" title="${esc(s.txt)}">${esc(s.txt)}</span></div>`).join('') +
    `<div class="cost">修复成本 <b>${R.cost.toFixed(1)}</b> 人日 · 回归测试 <b>${R.findings.length + R.endpoints.length * 2}</b> 项</div>`;
  S.el.chain.innerHTML = R.chain.map((c, i) => `${i ? '<span class="ar">▸</span>' : ''}<div class="cn${i === R.chain.length - 1 ? ' end' : ''}" title="${esc(c)}">${esc(c)}</div>`).join('');
  S.el.recs.innerHTML = R.recs.slice(0, 6).map((r) => `<div class="rec" data-f="${esc(r.ref.f)}" data-l="${r.ref.l}" data-h title="${esc(r.tx)}"><span class="p ${r.p.toLowerCase()}">${r.p}</span><span class="tx">${esc(r.tx)}</span><span class="es">${r.d.toFixed(1)}D</span></div>`).join('');
  S.el.risk.className = 'chip risk ' + R.risk;
  S.el.risk.innerHTML = `<span class="d"></span>RISK · ${R.risk}<span class="en"> ${R.riskZh}</span>`;
  S.el.conf.textContent = `CONF ${R.confidence.toFixed(2)}`;
  S.el.grade.innerHTML = `GRADE <b>${R.grade}</b>`;
  applyFilter();
}
function resetRight() {
  S.el.dims.innerHTML = DIMS.map((d) => `<div class="dim"><span class="dn">${d.zh}</span><span class="de">${d.en}</span><div class="db"><i></i><b></b></div><span class="dv">--</span><span class="vd">—</span></div>`).join('');
  S.el.dimEls = null;
  S.el.scope.innerHTML = ['模块', '系统', '外部接口'].map((z) => `<div class="srow"><span class="sn">${z}</span><span class="sg">${'<i></i>'.repeat(5)}</span><span class="sc2">—</span></div>`).join('') + '<div class="cost">修复成本 <b>--</b> 人日</div>';
  S.el.chain.innerHTML = ['输入', '缺陷', '传播', '后果'].map((c, i) => `${i ? '<span class="ar" style="opacity:.25">▸</span>' : ''}<div class="cn" style="opacity:.22;border-style:dashed;color:transparent">${c}</div>`).join('');
  S.el.recs.innerHTML = ['P0', 'P1', 'P2'].map((p) => `<div class="rec" style="opacity:.25"><span class="p ${p.toLowerCase()}">${p}</span><span class="tx">—</span></div>`).join('');
  S.el.risk.className = 'chip risk';
  S.el.risk.innerHTML = '<span class="d"></span>RISK · --';
  S.el.conf.textContent = 'CONF --';
  S.el.grade.innerHTML = 'GRADE <b>-</b>';
  S.el.score.innerHTML = '--<small>/100</small>';
  S.el.like.style.opacity = 0;
  [S.el.grade, S.el.risk, S.el.conf].forEach((e) => { e.style.opacity = 0.3; e.style.transform = ''; });
  S.el.grade.classList.remove('on');
  S.el.await1.style.display = S.el.await2.style.display = 'flex';
  S.el.await1.style.opacity = S.el.await2.style.opacity = 1;
  S.el.rr.textContent = 'R = S × L'; S.el.rr.style.color = '';
}
function applyFilter() {
  if (!S.lines) return;
  const f = S.filter, sel = S.dimSel >= 0 ? DIMS[S.dimSel].k : null;
  S.lines.forEach((x) => {
    const tag = x.L.tag;
    x.match = f === 'all' || (f === 'evidence' && tag === 'evidence') || (f === 'hypothesis' && tag === 'hypothesis');
    const hl = sel && x.L.dims.includes(sel);
    x.el.classList.toggle('hl', !!hl && x.L.sub !== 'code');
    x.el.classList.toggle('fade', !!sel && !hl);
  });
  $$('.loghd .chip', S.root).forEach((c) => c.classList.toggle('on', c.dataset.f === f));
}

/* ---------------- peek ---------------- */
function openPeek(fname, line, anchor) {
  const file = (S.result?.files || []).find((f) => f.name === fname) || (() => {
    const c = S.cargo.find((x) => x.name === fname);
    return c && { name: c.name, kind: c.kind === 'record' ? 'doc' : c.kind, lines: c.text.replace(/\r\n?/g, '\n').split('\n') };
  })();
  if (!file) return;
  const { html, a, b } = codeHTML(file, line, 3, 4);
  const p = S.el.peek;
  const idx = S.result ? S.result.findings.findIndex((x) => x.file === fname && x.line === line) : -1;
  p.innerHTML = `<div class="hd"><b>${esc(file.name)}</b><span>L${a} – L${b}</span><span>${idx >= 0 ? 'EVIDENCE #' + pad(idx + 1) : 'REFERENCE'}</span><span class="cl" data-h>✕</span></div><pre>${html}</pre>`;
  const C = S.el.C.getBoundingClientRect(), r = anchor.getBoundingClientRect();
  const w = Math.min(560, C.width - 32);
  p.style.width = w + 'px';
  p.style.display = 'block';
  const ph = p.offsetHeight;
  let x = clamp(r.left - C.left - 40, 16, C.width - w - 16);
  let y = r.bottom - C.top + 6;
  if (y + ph > C.height - 10) y = r.top - C.top - ph - 6;
  if (anchor.closest('#R1,#R2')) { x = C.width - w - 16; y = clamp(r.top - C.top - ph / 2, 40, C.height - ph - 10); }
  p.style.left = x + 'px'; p.style.top = Math.max(36, y) + 'px';
  S.peekT = S.t;
  S.ctx.sfx.play('slide');
}
function closePeek() { if (S?.el.peek) S.el.peek.style.display = 'none'; }

/* ---------------- export ---------------- */
function exportReport() {
  const R = S.result;
  if (!R) return;
  const md = [`# CHIRAL ATLAS · 推理评估报告`, '', `> 生成时间 ${new Date().toLocaleString('zh-CN')} · 引擎 CHIRAL-R1（本地启发式）`, '',
    `**评估目标**：${S.goalUsed}`, '', `## 输入货物`, '', ...R.files.map((f) => `- \`${f.name}\` · ${f.kind} · ${f.lines.length} 行`), '',
    `## 结论`, '', `- 综合评分 **${R.overall} / 100**，等级 **${R.grade}**`, `- 风险 **${R.risk}**（R = ${R.S} × ${R.L} = ${R.R}），置信度 ${R.confidence.toFixed(2)}`, '',
    `| 维度 | 分数 | 结论 |`, `|---|---|---|`, ...DIMS.map((d, i) => `| ${d.zh} | ${R.scores[i]} | ${R.verdict[i]} |`), '',
    `## 假设验证`, '', ...R.hyps.map((h) => `- ${h.id} ${h.title}：${h.ok ? '成立' : '否决'}${h.ok && h.ev[0] ? `（${h.ev[0].file}:L${h.ev[0].line}）` : h.rejEv ? `（${h.rejEv.file}:L${h.rejEv.line}）` : ''}`), '',
    `## 影响效果`, '', `影响链：${R.chain.join(' → ')}`, '', ...R.scope.map((s) => `- ${s.zh}：${s.txt}`), '',
    `## 处置建议`, '', ...R.recs.map((r) => `- **${r.p}** ${r.tx}（${r.d.toFixed(1)} 人日 · ${r.ref.f}:L${r.ref.l}）`), '',
    `## 证据清单`, '', ...R.findings.map((x, i) => `${i + 1}. [${x.file}:L${x.line}] ${x.msg}`), '',
    `## 推理日志`, '', ...R.log.filter((l) => l.segs).map((l) => `- ${pad(l.step + 1)} ${NODES[l.step].en} · ${l.segs.map((s) => s[1]).join('')}`), ''].join('\n');
  download(`inference_report_${Date.now()}.md`, md);
  S.ctx.sfx.play('confirm');
  S.ctx.toast('报告已导出为 Markdown');
}

/* ---------------- canvases ---------------- */
function fitAll() {
  const c = S.cv;
  c.graph = fitCanvas(S.el.graph, 2);
  c.ring = fitCanvas(S.el.ring, 2);
  c.radar = fitCanvas(S.el.radar, 2);
  c.mx = fitCanvas(S.el.mx, 2);
  c.fx = fitCanvas(S.el.fx, 1.5);
  const { w, h } = c.graph;
  const r = (S.nodeR = clamp(Math.min(w / 34, h / 12.5), 14, 22));
  S.compact = w < 660 || h < 270;
  // rows: room above the top row for satellite labels, room below the bottom row for node labels
  const top = S.compact ? r * 2.6 + 24 : r * 3.2 + 28, bot = h - (r + (S.compact ? 46 : 54)), mid = (top + bot) / 2;
  S.nodes = NODES.map((n) => ({ x: n.fx * w, y: n.fy < 0.4 ? top : n.fy > 0.6 ? bot : mid }));
  S.needFit = false;
}

function satPos(i, j, n) {
  const N = S.nodes[i], r = S.nodeR;
  if (i === 0) { const q = (S.compact ? [[-1, -1], [-1, 1]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]])[j] || [0, 1]; return { x: N.x + q[0] * r * 1.7, y: N.y + q[1] * r * (q[0] < 0 ? 2.9 : 3.4), side: q[1] < 0 ? 't' : 'b' }; }
  if (i === 1 || i === 3 || i === 4) {
    // fan above the node: outer labels grow away from the node, the middle one sits highest
    const slot = n === 1 ? 1 : n === 2 ? j * 2 : j;
    const c = S.compact ? 0.8 : 1;
    if (slot === 1) return { x: N.x, y: N.y - r * 3.2 * c, side: 't' };
    return { x: N.x + (slot ? 1 : -1) * r * 2.1, y: N.y - r * 2.2 * c, side: slot ? 'r' : 'L' };
  }
  if (i === 2 || i === 5) return { x: N.x + r * 1.9, y: N.y + r * 0.95 + j * 19, side: 'r' };
  return { x: N.x, y: N.y, side: 'r' };
}

function drawGraph(T, running) {
  const { g, w, h } = S.cv.graph;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(180,220,235,.10)';
  for (let x = 16; x < w; x += 24) for (let y = 14; y < h; y += 24) g.fillRect(x, y, 1, 1);
  const k = running ? (T < R0 ? -1 : Math.min(NSTEP, Math.floor((T - R0) / STEP))) : -1;
  const st = (i) => (k < 0 || i > k ? 0 : i < k ? 2 : 1);
  const sS = (i) => R0 + i * STEP;
  const r = S.nodeR, P = S.nodes;
  EDGES.forEach(([a, b], ei) => {
    const E = bez(P[a], P[b]);
    g.setLineDash([3, 5]); g.lineWidth = 1; g.strokeStyle = 'rgba(190,220,232,.16)';
    bdraw(g, E, 1); g.setLineDash([]);
    if (k < 0) return;
    const lp = ease.io(seg(T, sS(b) - 40, sS(b) + 300));
    if (lp <= 0) return;
    g.strokeStyle = 'rgba(227,162,58,.75)'; g.lineWidth = 1.3; g.shadowColor = 'rgba(227,162,58,.8)'; g.shadowBlur = 6;
    bdraw(g, E, lp); g.shadowBlur = 0;
    if (lp >= 1) for (let j = 0; j < 2; j++) {
      const q = (T / 1500 + j / 2 + ei * 0.137) % 1;
      for (let tr = 0; tr < 5; tr++) {
        const pp = bpt(E, clamp(q - tr * 0.018));
        g.fillStyle = `rgba(255,210,126,${(1 - tr / 5) * 0.9})`;
        g.beginPath(); g.arc(pp.x, pp.y, tr ? 1.4 : 2.2, 0, 7); g.fill();
      }
    }
  });
  // satellites
  if (S.result && k >= 0) S.result.sats.forEach((full, i) => {
    if (i > k) return;
    // narrow graph: keep at most two satellites per node (first + last)
    const list = S.compact && full.length > 2 ? [full[0], full[full.length - 1]] : full;
    const N = P[i];
    list.forEach((s, j) => {
      const t0 = sS(i) + 160 + j * 140, p = ease.out(seg(T, t0, t0 + 260));
      if (p <= 0) return;
      const q = satPos(i, j, list.length);
      const col = s.tone === 'w' ? '255,90,60' : s.tone === 'g' ? '95,227,166' : '190,220,232';
      g.strokeStyle = `rgba(${col},.32)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(N.x, N.y); g.lineTo(lerp(N.x, q.x, p), lerp(N.y, q.y, p)); g.stroke();
      g.fillStyle = `rgba(${col},${p})`; g.beginPath(); g.arc(q.x, q.y, 3, 0, 7); g.fill();
      g.strokeStyle = `rgba(${col},${0.5 * p})`; g.beginPath(); g.arc(q.x, q.y, 6, 0, 7); g.stroke();
      g.globalAlpha = seg(T, t0 + 120, t0 + 360);
      g.font = `${S.compact ? 9 : 10}px "Share Tech Mono","Microsoft YaHei"`;
      g.fillStyle = s.tone ? `rgb(${col})` : '#a3b6bf';
      if (q.side === 't') { g.textAlign = 'center'; g.fillText(s.t, q.x, q.y - 11); }
      else if (q.side === 'b') { g.textAlign = 'center'; g.fillText(s.t, q.x, q.y + 19); }
      else if (q.side === 'L') { g.textAlign = 'right'; g.fillText(s.t, q.x - 10, q.y + 3.5); }
      else { g.textAlign = 'left'; g.fillText(s.t, q.x + 10, q.y + 3.5); }
      g.globalAlpha = 1;
    });
  });
  // nodes
  NODES.forEach((N, i) => {
    const s = st(i), { x, y } = P[i];
    const hov = S.hoverNode === i;
    const ap = s === 1 ? seg(T, sS(i), sS(i) + 260) : 1;
    const sp = s === 1 ? seg(T, sS(i), sS(i) + STEP) : 0;
    g.lineWidth = s ? 1.4 : 1;
    if (s === 2) {
      const dp = ease.out(seg(T, sS(i + 1), sS(i + 1) + 220));
      hexPath(g, x, y, r); g.fillStyle = `rgba(233,241,244,${0.15 + 0.85 * dp})`; g.fill();
      g.strokeStyle = '#e9f1f4'; g.stroke();
      hexPath(g, x, y, r + 7); g.strokeStyle = hov ? 'rgba(134,227,255,.8)' : 'rgba(233,241,244,.25)'; g.lineWidth = 1; g.stroke();
      g.strokeStyle = '#05080b'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - r * 0.32, y); g.lineTo(x - r * 0.09, y + r * 0.23); g.lineTo(x + r * 0.36, y - r * 0.27); g.stroke();
    } else if (s === 1) {
      g.shadowColor = 'rgba(43,181,238,.9)'; g.shadowBlur = 18 * ap;
      hexPath(g, x, y, r); g.fillStyle = `rgba(43,181,238,${0.12 + 0.1 * Math.sin(T / 120)})`; g.fill();
      g.strokeStyle = '#2bb5ee'; g.stroke(); g.shadowBlur = 0;
      g.save(); g.translate(x, y); g.rotate(T / 600); g.setLineDash([4, 6]); g.strokeStyle = 'rgba(134,227,255,.6)'; g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, r * 1.5, 0, 7); g.stroke(); g.setLineDash([]); g.restore();
      g.strokeStyle = '#86e3ff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 1.72, -Math.PI / 2, -Math.PI / 2 + sp * Math.PI * 2); g.stroke();
      const pu = ((T - sS(i)) % 700) / 700;
      hexPath(g, x, y, r + pu * 26); g.strokeStyle = `rgba(43,181,238,${0.5 * (1 - pu)})`; g.lineWidth = 1; g.stroke();
      g.font = '12px "Share Tech Mono"'; g.fillStyle = '#86e3ff'; g.textAlign = 'center'; g.fillText(pad(i + 1), x, y + 4);
    } else {
      hexPath(g, x, y, r); g.fillStyle = 'rgba(7,13,18,.95)'; g.fill();
      g.strokeStyle = 'rgba(190,220,232,.32)'; g.stroke();
      g.font = '11px "Share Tech Mono"'; g.fillStyle = '#5d727c'; g.textAlign = 'center'; g.fillText(pad(i + 1), x, y + 4);
    }
    g.textAlign = 'center';
    const cp = S.compact;
    g.font = `600 ${cp ? 12 : 13}px "Barlow Condensed"`; g.letterSpacing = cp ? '1.5px' : '2px';
    g.fillStyle = s === 1 ? '#86e3ff' : s === 2 ? (hov ? '#86e3ff' : '#e9f1f4') : '#6d838d';
    g.fillText(N.en, x + 1, y + r + (cp ? 22 : 32));
    g.letterSpacing = '0px';
    g.font = `${cp ? 10 : 11}px "Microsoft YaHei"`; g.fillStyle = s ? '#a3b6bf' : '#4a5d66';
    g.fillText(N.zh, x, y + r + (cp ? 36 : 47));
  });
  if (S.result && T >= R1) {
    const p = ease.out(seg(T, R1, R1 + 300));
    g.globalAlpha = p; g.font = '300 20px "Barlow Condensed"'; g.fillStyle = '#e3a23a'; g.textAlign = 'center';
    g.fillText(String(S.result.overall), P[6].x, P[6].y - r - 16); g.globalAlpha = 1;
  }
}

function drawRing(T, p, score) {
  const { g, w, h } = S.cv.ring;
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = w * 0.43;
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * Math.PI * 2, L = i % 5 ? 3 : 6;
    g.strokeStyle = i / 60 < (p * score) / 100 ? 'rgba(233,241,244,.85)' : 'rgba(190,220,232,.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6)); g.lineTo(cx + Math.cos(a) * (R + 6 + L), cy + Math.sin(a) * (R + 6 + L)); g.stroke();
  }
  g.strokeStyle = 'rgba(190,220,232,.12)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  if (p > 0) {
    const a1 = -Math.PI / 2 + ((p * score) / 100) * Math.PI * 2;
    const col = score < 60 ? '#ff5a3c' : '#2bb5ee';
    g.shadowColor = col; g.shadowBlur = 12; g.strokeStyle = col; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, a1); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = '#e9f1f4'; g.beginPath(); g.arc(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, 3.2, 0, 7); g.fill();
  }
  const at = -Math.PI / 2 + 0.7 * Math.PI * 2;
  g.strokeStyle = '#e3a23a'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx + Math.cos(at) * (R - 7), cy + Math.sin(at) * (R - 7)); g.lineTo(cx + Math.cos(at) * (R + 3), cy + Math.sin(at) * (R + 3)); g.stroke();
  g.save(); g.translate(cx, cy); g.rotate(T / 2200); g.setLineDash([2, 6]); g.strokeStyle = 'rgba(134,227,255,.3)'; g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, R - 12, 0, 7); g.stroke(); g.restore();
}

function drawRadar(T, active) {
  const { g, w, h } = S.cv.radar;
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 2, R = Math.min(h * 0.34, w * 0.27);
  const ang = (i) => -Math.PI / 2 + (i * Math.PI) / 3;
  [0.25, 0.5, 0.75, 1].forEach((f, j) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = ang(i); g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f); }
    g.closePath();
    g.strokeStyle = j === 3 ? 'rgba(190,220,232,.3)' : 'rgba(190,220,232,.11)'; g.lineWidth = 1;
    if (!active && j === 3) g.setLineDash([3, 4]);
    g.stroke(); g.setLineDash([]);
  });
  for (let i = 0; i < 6; i++) {
    const a = ang(i);
    g.strokeStyle = S.dimSel === i ? 'rgba(227,162,58,.8)' : 'rgba(190,220,232,.1)';
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
  }
  const sc = S.result?.scores;
  if (active && sc) {
    const pts = sc.map((v, i) => { const p = ease.back(seg(T, E0 + 200 + i * 70, E0 + 900 + i * 70)); const rr = (R * v / 100) * p; return { x: cx + Math.cos(ang(i)) * rr, y: cy + Math.sin(ang(i)) * rr, p }; });
    if (pts.some((q) => q.p > 0)) {
      g.beginPath(); pts.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](q.x, q.y)); g.closePath();
      g.fillStyle = 'rgba(43,181,238,.18)'; g.fill();
      g.shadowColor = '#2bb5ee'; g.shadowBlur = 8; g.strokeStyle = '#2bb5ee'; g.lineWidth = 1.5; g.stroke(); g.shadowBlur = 0;
      pts.forEach((q, i) => { const low = sc[i] < 60; g.fillStyle = low ? '#ff5a3c' : '#e9f1f4'; g.beginPath(); g.arc(q.x, q.y, low || S.dimSel === i ? 3.4 : 2.2, 0, 7); g.fill(); });
    }
  }
  DIMS.forEach((d, i) => {
    const a = ang(i), lx = cx + Math.cos(a) * (R + 20), ly = cy + Math.sin(a) * (R + 14);
    const vert = Math.abs(Math.cos(a)) < 0.1;
    g.textAlign = vert ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
    const ox = vert ? 0 : Math.cos(a) > 0 ? -10 : 10;
    g.font = '11px "Microsoft YaHei"';
    g.fillStyle = S.dimSel === i ? '#ffd27e' : active && sc && sc[i] < 60 ? '#ff5a3c' : '#a3b6bf';
    g.fillText(d.zh, lx + ox, ly + 4);
  });
}

function drawMatrix(T, active) {
  const { g, w, h } = S.cv.mx;
  g.clearRect(0, 0, w, h);
  const cs = Math.floor(Math.min((w - 22) / 5, (h - 18) / 5)) - 2, gp = 2, ox = 18, oy = 2;
  g.font = '9px "Share Tech Mono"'; g.fillStyle = '#5d727c';
  g.save(); g.translate(8, oy + (5 * (cs + gp)) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('SEVERITY', 0, 0); g.restore();
  g.textAlign = 'center'; g.fillText('LIKELIHOOD', ox + (5 * (cs + gp)) / 2, oy + 5 * (cs + gp) + 11);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const risk = (5 - r) * (c + 1);
    const p = active ? seg(T, E0 + 1300 + (r + c) * 40, E0 + 1600 + (r + c) * 40) : 0;
    const col = risk >= 15 ? '255,90,60' : risk >= 8 ? '227,162,58' : '95,227,166';
    g.fillStyle = `rgba(${col},${0.05 + p * (0.08 + (risk / 25) * 0.22)})`;
    g.fillRect(ox + c * (cs + gp), oy + r * (cs + gp), cs, cs);
    g.strokeStyle = 'rgba(190,220,232,.12)'; g.strokeRect(ox + c * (cs + gp) + 0.5, oy + r * (cs + gp) + 0.5, cs - 1, cs - 1);
  }
  if (!active || !S.result) return;
  const lp = seg(T, E0 + 1750, E0 + 2150);
  if (lp <= 0) return;
  const { S: sv, L: lk } = S.result;
  const col = S.result.risk === 'HIGH' ? '#ff5a3c' : S.result.risk === 'MEDIUM' ? '#e3a23a' : '#5fe3a6';
  const tx = ox + (lk - 1) * (cs + gp) + cs / 2, ty = oy + (5 - sv) * (cs + gp) + cs / 2;
  const y = lerp(oy + 5 * (cs + gp), ty, ease.back(lp));
  g.strokeStyle = col; g.globalAlpha = 0.5 * lp; g.setLineDash([2, 3]); g.lineWidth = 1;
  g.beginPath(); g.moveTo(ox, y); g.lineTo(ox + 5 * (cs + gp) - gp, y); g.moveTo(tx, oy); g.lineTo(tx, oy + 5 * (cs + gp) - gp); g.stroke();
  g.setLineDash([]); g.globalAlpha = 1;
  g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10;
  g.beginPath(); g.arc(tx, y, 4, 0, 7); g.fill(); g.shadowBlur = 0;
  if (lp >= 1) { const pu = ((T - E0) % 1100) / 1100; g.strokeStyle = col; g.globalAlpha = 1 - pu; g.beginPath(); g.arc(tx, y, 4 + pu * 12, 0, 7); g.stroke(); g.globalAlpha = 1; }
}

function drawFx(T) {
  const { g, w, h } = S.cv.fx;
  g.clearRect(0, 0, w, h);
  if (!S.run) return;
  const root = S.root.getBoundingClientRect();
  const gr = S.el.graph.getBoundingClientRect();
  const nodeP = (i) => ({ x: gr.left - root.left + S.nodes[i].x, y: gr.top - root.top + S.nodes[i].y });
  const a = seg(T, 0, 700), fo = 1 - seg(T, R0 + STEP * 0.9, R0 + STEP * 1.5);
  if (a > 0 && fo > 0) {
    const box = S.el.slots.getBoundingClientRect();
    S.cargo.forEach((c, i) => {
      const r = c.q.card.getBoundingClientRect();
      if (r.bottom < box.top || r.top > box.bottom) return;
      const A = { x: r.right - root.left, y: r.top - root.top + r.height / 2 }, B = nodeP(0);
      const E = [A, { x: A.x + 60, y: A.y }, { x: B.x - 90, y: B.y }, B];
      g.strokeStyle = `rgba(227,162,58,${0.55 * fo})`; g.lineWidth = 1.2; g.shadowColor = 'rgba(227,162,58,.9)'; g.shadowBlur = 8;
      bdraw(g, E, ease.io(clamp(a * 1.3 - i * 0.1))); g.shadowBlur = 0;
      for (let j = 0; j < 3; j++) {
        const q = (T / 900 + j / 3 + i * 0.21) % 1;
        if (q > a) continue;
        const pp = bpt(E, q);
        g.fillStyle = `rgba(255,210,126,${fo})`; g.beginPath(); g.arc(pp.x, pp.y, 2, 0, 7); g.fill();
      }
    });
  }
  const b = seg(T, R1 - 150, R1 + 450), bo = 1 - seg(T, E0 + 900, E0 + 1400);
  if (b > 0 && bo > 0) {
    const rr = S.el.ring.getBoundingClientRect();
    const A = nodeP(6), B = { x: rr.left - root.left + 4, y: rr.top - root.top + rr.height / 2 };
    const E = [A, { x: A.x + 40, y: A.y }, { x: B.x - 70, y: B.y }, B];
    g.strokeStyle = `rgba(134,227,255,${0.7 * bo})`; g.lineWidth = 1.3; g.shadowColor = '#2bb5ee'; g.shadowBlur = 10;
    bdraw(g, E, ease.io(b)); g.shadowBlur = 0;
    for (let j = 0; j < 4; j++) {
      const q = ((T - R1) / 700 + j / 4) % 1;
      if (q > b) continue;
      const pp = bpt(E, q);
      g.fillStyle = `rgba(233,241,244,${bo})`; g.beginPath(); g.arc(pp.x, pp.y, 2, 0, 7); g.fill();
    }
  }
}

/* ---------------- per-frame updates ---------------- */
function updLeft(t) {
  const el = S.el, sfx = S.ctx.sfx;
  let tok = 0;
  const tokBy = {};
  S.cargo.forEach((c) => {
    const f = seg(t, c.t0, c.t0 + FLY), s = seg(t, c.t0 + FLY, c.t0 + FLY + SCAN);
    const q = c.q;
    if (c.ph < 3 || (S.phase === 'running')) {
      if (c.ph === 0 && t >= c.t0) { c.ph = 1; sfx.play('drop'); }
      if (c.ph === 1 && s > 0) { c.ph = 2; sfx.play('scan'); }
      if (c.ph === 2 && s >= 1) { c.ph = 3; sfx.play('tick'); }
      q.card.style.opacity = t < c.t0 ? 0 : ease.out(f);
      q.card.style.transform = f < 1 ? `translateY(${(1 - ease.out(f)) * -(c.idx * 70 + 80)}px) scale(${lerp(0.94, 1, ease.out(f))})` : '';
      const sc = s > 0 && s < 1;
      q.scan.style.display = q.band.style.display = sc ? 'block' : 'none';
      if (sc) { q.scan.style.left = s * 100 + '%'; q.band.style.width = s * 100 + '%'; }
      const fill = Math.round((s * c.integ / 100) * 24);
      q.segs.forEach((e, k) => { e.className = k < fill ? (sc ? 's' : c.integ < 100 && k >= Math.round(c.integ / 100 * 24) - 2 ? 'w' : 'f') : ''; });
      q.pc.textContent = Math.round(s * c.integ) + '%';
      q.pc.style.color = s >= 1 && c.integ < 100 ? 'var(--gold)' : '';
      let st = 'QUEUED', cls = 'st';
      if (sc) { st = 'SCANNING'; cls = 'st scan'; q.st.style.opacity = 0.55 + 0.45 * Math.abs(Math.sin(t / 140)); }
      else q.st.style.opacity = 1;
      if (s >= 1) { st = c.integ < 100 ? 'LOADED △' : 'LOADED'; cls = c.integ < 100 ? 'st warn' : 'st ok'; }
      if (q.st.textContent !== st) q.st.textContent = st;
      if (q.st.className !== cls) q.st.className = cls;
      const pulling = S.phase === 'running' && t - S.run.t0 < R0 + STEP;
      q.card.style.borderColor = pulling ? `rgba(227,162,58,${0.3 + 0.5 * Math.abs(Math.sin((t - c.idx * 90) / 120))})` : '';
    }
    tok += c.tok * s;
    tokBy[c.kind] = (tokBy[c.kind] || 0) + c.tok * s;
  });
  el.tok.textContent = nf(tok);
  el.tokbar.style.width = Math.min(100, (tok / 128000) * 100 * 8) + '%';
  $$('i', el.comp).forEach((e) => { e.style.width = (tok ? (tokBy[e.dataset.k] / tok) * 100 : 0) + '%'; });
  $$('span', el.legend).forEach((e) => { e.querySelector('b').textContent = tok ? Math.round((tokBy[e.dataset.k] / tok) * 100) + '%' : '--'; });

  // drop zone
  const hot = t - S.dragAt < 160;
  el.drop.classList.toggle('hot', hot);
  const t1 = hot ? 'RELEASE TO LOAD' : 'DROP CARGO', t2 = hot ? '释放以装载 · 支持文本 / 源码 / 补丁' : '拖入原始资料 · 或点击选择文件';
  if (el.dt1.textContent !== t1) { el.dt1.textContent = t1; el.dt2.textContent = t2; }
  el.dring.setAttribute('transform', `rotate(${(t / (hot ? 12 : 40)) % 360} 22 22)`);
  el.dsw.style.left = (((t / 2600) % 1) * 1.6 - 0.3) * 100 + '%';
  el.dsw.style.opacity = hot ? 1 : 0.5;

  // start button
  const btn = el.start;
  let html, cls, prog = 0;
  if (S.phase === 'running') {
    const T = t - S.run.t0, k = clamp(Math.floor((T - R0) / STEP), 0, 6);
    const flash = 1 - seg(T, 0, 260);
    html = `<span>◆</span><span class="zh">推演中</span><span class="en">RUNNING</span> ${pad(k + 1)}/07`;
    cls = 'start btn run';
    prog = (T - R0) / (R1 - R0);
    btn.style.background = flash > 0 ? `rgb(${lerp(43, 233, flash)},${lerp(181, 241, flash)},${lerp(238, 244, flash)})` : '';
  } else {
    btn.style.background = '';
    if (!S.cargo.length) { html = '<span>◇</span><span class="zh">等待装载</span><span class="en">AWAITING CARGO</span>'; cls = 'start btn dis'; }
    else if (!ready()) { html = '<span>◇</span><span class="zh">装载中</span><span class="en">LOADING…</span>'; cls = 'start btn dis'; }
    else if (S.phase === 'done' && !S.stale) { html = '<span>✓</span><span class="zh">推演完成 · 导出报告</span><span class="en">EXPORT</span>'; cls = 'start btn done'; }
    else { html = S.stale ? '<span>▶</span><span class="zh">重新推演</span><span class="en">RE-RUN</span>' : '<span>▶</span><span class="zh">开始推演</span><span class="en">START INFERENCE</span>'; cls = 'start btn ready'; }
  }
  if (S._btnH !== html) { el.slb.innerHTML = html; S._btnH = html; }
  if (btn.className !== cls) btn.className = cls;
  el.sprog.style.width = clamp(prog) * 100 + '%';
  el.rerun.classList.toggle('dis', !(S.phase === 'done' && ready()));
  el.clear.classList.toggle('dis', S.phase === 'running' || !S.cargo.length);
}

function updCenter(t, dt) {
  const el = S.el, sfx = S.ctx.sfx;
  const running = !!S.run;
  const T = running ? t - S.run.t0 : 0;
  const k = running ? (T < R0 ? -1 : Math.min(NSTEP, Math.floor((T - R0) / STEP))) : -1;
  const done = running && T >= R1;
  const R = S.result;
  el.sStep.innerHTML = k < 0 ? '--<small>/07</small>' : `${pad(Math.min(k + 1, 7))}<small>/07</small>`;
  el.sTime.textContent = fmtT(running ? Math.min(T, R1) - R0 : 0);
  const conf = k < 0 || !R ? 0 : clamp(0.18 + (R.confidence - 0.18) * ((Math.min(T, R1) - R0) / (R1 - R0)), 0, R.confidence);
  el.sConf.textContent = k < 0 ? '--' : conf.toFixed(2);
  el.sConfBar.style.width = conf * 100 + '%';
  el.sEvi.textContent = k < 0 || !R ? '--' : done ? R.evidence : Math.round(R.evidence * clamp((T - R0) / (R1 - R0)));
  const trs = done ? 'COMPLETE' : running ? 'LIVE' : 'STANDBY';
  if (el.trace.textContent !== trs) { el.trace.textContent = trs; el.trace.style.color = done ? 'var(--green)' : running ? 'var(--cyan)' : ''; }
  // idle band
  const io = running ? 1 - seg(T, 0, 260) : 1;
  el.idle.style.opacity = io; el.idle.style.display = io > 0 ? 'flex' : 'none';
  if (io > 0) {
    const rd = S.cargo.length && ready();
    const a = rd ? 'READY · 待命' : S.cargo.length ? 'LOADING · 装载中' : 'AWAITING CARGO';
    const b = rd ? `${S.cargo.length} 件货物已装载 · 点击开始推演` : S.cargo.length ? '正在扫描货物完整度' : '等待货物装载 · 装载完成后开始推演';
    if (el.idleA.textContent !== a) { el.idleA.textContent = a; el.idleB.textContent = b; }
  }
  el.noTrace.style.display = running && T >= R0 + 80 ? 'none' : 'block';
  if (!running || !S.lines) return;

  // node activation sounds
  for (let i = 0; i <= Math.min(k, 6); i++) if (!S.run.fired.has('n' + i)) { S.run.fired.add('n' + i); sfx.play('node', { pitch: 0.9 + i * 0.07 }); }
  if (T > R0 && T < R1 && Math.floor(T / 520) !== S.run.pk) { S.run.pk = Math.floor(T / 520); sfx.play('packet', { vol: 0.8 }); }

  let typing = false;
  if (!S.finalized) S.lines.forEach((x) => {
    const vis = T >= x.st;
    const show = vis && x.match !== false;
    if (x.shown !== show) { x.el.style.display = show ? '' : 'none'; x.shown = show; }
    if (!vis) return;
    const p = seg(T, x.st, x.st + x.dur);
    if (x.L.sub === 'code') { x.el.style.maxHeight = ease.out(p) * 140 + 'px'; return; }
    if (!x.tsSet) { x.ts.textContent = fmtT(x.st - R0); x.tsSet = true; }
    const n = Math.round(p * x.len);
    if (p < 1) typing = true;
    const cursor = (p < 1 || (x === S.lines.filter((y) => T >= y.st).pop() && !done)) && Math.floor(T / 260) % 2 === 0;
    const key = n * 2 + (cursor ? 1 : 0);
    if (x.n !== key) { x.n = key; x.msg.innerHTML = segHTML(x.L.segs, n) + (cursor ? '<span class="cur"></span>' : ''); }
  });
  else S.lines.forEach((x) => { const show = x.match !== false; if (x.shown !== show) { x.el.style.display = show ? '' : 'none'; x.shown = show; } });
  if (typing && t - (S.lastType || 0) > 75) { S.lastType = t; sfx.play('type', { vol: 0.7 }); }
  if (S.autoScroll && !S.finalized) {
    const v = el.logv, target = Math.max(0, v.scrollHeight - v.clientHeight);
    v.scrollTop = damp(v.scrollTop, target, 8, dt);
  }
  // flash after node click
  if (S.flash && t - S.flash.t > 900) { S.flash.el.classList.remove('flash'); S.flash = null; }
}

function updRight(t) {
  const el = S.el, sfx = S.ctx.sfx, R = S.result;
  const T = S.run ? t - S.run.t0 : -1;
  const act = !!S.run && T >= E0;
  if (!S.run) { drawRing(t, 0, 0); drawRadar(t, false); drawMatrix(t, false); return; }
  const fin = S.finalized;
  if (!fin) {
    const aw = 1 - seg(T, E0 - 100, E0 + 150);
    el.await1.style.opacity = el.await2.style.opacity = aw;
    el.await1.style.display = el.await2.style.display = aw > 0 ? 'flex' : 'none';
    const sp = seg(T, E0 - 60, E0 + 700);
    el.rscan.style.display = sp > 0 && sp < 1 ? 'block' : 'none';
    el.rscan.style.top = 34 + sp * (el.R1.clientHeight - 40) + 'px';
  }
  const sp1 = act ? ease.out(seg(T, E0, E0 + 1500)) : 0;
  if (!fin) {
    el.score.innerHTML = act ? `${Math.round(R.overall * sp1)}<small>/100</small>` : '--<small>/100</small>';
    if (act && sp1 < 1 && t - (S.lastScore || 0) > 70) { S.lastScore = t; sfx.play('score', { pitch: 0.8 + sp1 * 0.6 }); }
    if (act && T >= E0 + 1500 && !S.run.fired.has('ding')) { S.run.fired.add('ding'); sfx.play('ding'); }
    [el.grade, el.risk, el.conf].forEach((e, i) => {
      const p = act ? ease.out(seg(T, E0 + 1300 + i * 120, E0 + 1600 + i * 120)) : 0;
      e.style.opacity = 0.18 + 0.82 * p; e.style.transform = `translateY(${(1 - p) * 4}px)`;
    });
    el.grade.classList.toggle('on', act && T > E0 + 1300);
    if (S.el.dimEls) S.el.dimEls.forEach((d, i) => {
      const v = R.scores[i], p = act ? ease.out(seg(T, E0 + 400 + i * 110, E0 + 1100 + i * 110)) : 0;
      d.bar.style.width = v * p + '%';
      d.bar.style.background = v < 60 ? 'var(--red)' : v >= 80 ? 'var(--ink)' : 'var(--blue)';
      d.bar.style.boxShadow = v < 60 ? '0 0 8px rgba(255,90,60,.7)' : '';
      d.dv.textContent = act ? Math.round(v * p) : '--';
      d.dv.style.color = v < 60 && act ? 'var(--red)' : '';
      d.vd.style.color = v < 60 && act ? 'rgba(255,90,60,.85)' : '';
      d.vd.style.opacity = act ? seg(T, E0 + 900 + i * 110, E0 + 1200 + i * 110) : 0;
    });
    const landed = act && T > E0 + 2150;
    if (landed && !S.run.fired.has('land')) { S.run.fired.add('land'); sfx.play('lift', { pitch: 0.8 }); }
    el.rr.textContent = landed ? (S.compact ? `R = ${R.R} · ${R.risk}` : `R = ${R.S} × ${R.L} = ${R.R} · ${R.risk}`) : 'R = S × L';
    el.rr.style.color = landed ? (R.risk === 'HIGH' ? 'var(--red)' : R.risk === 'MEDIUM' ? 'var(--gold)' : 'var(--green)') : '';
    $$('.srow', el.scope).forEach((r, k) => {
      const sc = R.scope[k];
      $$('.sg i', r).forEach((e, j) => { const on = act && T > E0 + 1900 + k * 140 + j * 50 && j < sc.n; e.className = on ? (sc.hi ? 'hi' : 'on') : ''; });
      r.querySelector('.sc2').style.opacity = act ? seg(T, E0 + 2100 + k * 140, E0 + 2300 + k * 140) : 0;
    });
    const cost = $('.cost', el.scope); if (cost) cost.style.opacity = act ? seg(T, E0 + 2400, E0 + 2700) : 0;
    [...el.chain.children].forEach((e, j) => {
      const p = act ? ease.out(seg(T, E0 + 2100 + j * 70, E0 + 2400 + j * 70)) : 0;
      e.style.opacity = p; e.style.transform = `translateX(${(1 - p) * -8}px)`;
    });
    $$('.rec', el.recs).forEach((e, j) => {
      const p = act ? ease.out(seg(T, E0 + 2500 + j * 140, E0 + 2900 + j * 140)) : 0;
      if (p > 0 && !S.run.fired.has('r' + j)) { S.run.fired.add('r' + j); sfx.play('slide'); }
      e.style.opacity = p; e.style.transform = `translateX(${(1 - p) * 18}px)`;
    });
    if (act && T >= E0 + 2700 && !S.run.fired.has('like')) { S.run.fired.add('like'); sfx.play('like'); S.likeT = t; }
    if (T >= EEND + 200) {
      S.finalized = true;
      S.phase = 'done';
      S.root.classList.remove('running');
      el.rscan.style.display = 'none';
      el.await1.style.display = el.await2.style.display = 'none';
      // settle every typed line to its final markup
      S.lines.forEach((x) => { if (x.msg) x.msg.innerHTML = segHTML(x.L.segs, 1e9); if (x.L.sub === 'code') x.el.style.maxHeight = ''; if (x.ts && !x.tsSet) { x.ts.textContent = fmtT(x.st - R0); x.tsSet = true; } });
      applyFilter();
      S.lines.forEach((x) => { const show = x.match !== false; x.el.style.display = show ? '' : 'none'; x.shown = show; });
    }
  }
  // like (always live: user can add likes)
  const lk = act ? seg(t, S.likeT, S.likeT + 350) : 0;
  el.like.style.opacity = act && T >= E0 + 2700 ? 1 : 0;
  el.like.style.transform = `scale(${lk > 0 && lk < 1 ? lerp(1.35, 1, ease.out(lk)) : 1})`;
  el.likeLk.style.borderColor = lk > 0 && lk < 1 ? 'var(--cyan)' : '';
  if (el.likeN._v !== S.likes) { el.likeN.innerHTML = `<span class="en">LIKE </span>×${S.likes}`; el.likeN._v = S.likes; }
  drawRing(t, sp1, R.overall);
  drawRadar(T, act);
  drawMatrix(T, act);
}

/* ---------------- page ---------------- */
export default {
  hints: [[['●', '选择'], ['CTRL+↵', '开始推演', 'sq'], ['CTRL+V', '粘贴为货物', 'sq'], ['ESC', '返回', 'sq']],
    ['SECTOR 03 · INFERENCE', 'ENGINE · CHIRAL-R1 <b>LOCAL</b>']],

  mount(root, ctx) {
    const bag = new Bag();
    root.innerHTML = `
    <div class="inf">
      <section class="col panel" id="L"><div class="brk"></div>
        <div class="ph"><span class="sq"></span><span class="t">INPUT</span><span class="zh">原始信息</span><span class="r lbl" id="cargoN">CARGO 0/${MAXC}</span></div>
        <div class="drop" id="drop" data-h title="点击选择文件，或把文件拖到这里"><div class="brk"></div><div class="sweep" id="dsw"></div>
          <svg viewBox="0 0 44 44"><g id="dring"><polygon points="22,2 39.3,12 39.3,32 22,42 4.7,32 4.7,12" fill="none" stroke="#a3b6bf" stroke-width="1" stroke-dasharray="3 3"/></g>
            <path d="M22 13v14M16 21l6 6 6-6" fill="none" stroke="#e9f1f4" stroke-width="1.6"/><path d="M14 31h16" stroke="#2bb5ee" stroke-width="1.6"/></svg>
          <div style="min-width:0"><div class="t1" id="dt1">DROP CARGO</div><div class="t2" id="dt2">拖入原始资料 · 或点击选择文件</div><div class="t3">MD · TXT · SRC · PATCH · ≤2MB</div></div>
        </div>
        <div class="tools">
          <span class="tb" id="smpBtn" data-h>样例货物<span class="en"> SAMPLES</span> ▾</span>
          <span class="tb" id="pasteBtn" data-h><span class="zh">粘贴</span>PASTE</span>
          <span class="sp"></span>
          <span class="tb" id="rerun" data-h title="重新推演 RE-RUN">↻</span>
          <span class="tb" id="clear" data-h title="清空货单 CLEAR">✕</span>
          <div class="menu" id="menu" style="display:none"></div>
        </div>
        <div class="sec lbl">MANIFEST<span class="zh">货单</span></div>
        <div class="slots scroll" id="slots"></div>
        <div class="sec lbl">OBJECTIVE<span class="zh">评估目标</span></div>
        <div class="goal"><span class="k">GOAL ▸</span><textarea id="goal" spellcheck="false"></textarea></div>
        <div class="gchips">${GOALS.map((g, i) => `<span class="chip" data-goal="${i}" data-h>${g[0]}</span>`).join('')}</div>
        <div class="tok">TOKENS <b id="tok">0</b> / 128K<div class="bar"><i id="tokbar" style="width:0"></i></div></div>
        <div class="comp" id="comp"></div>
        <div class="legend" id="legend"></div>
        <div class="startwrap"><div class="start btn dis" id="start" data-h><div class="prog" id="sprog"></div><div class="lb" id="slb"></div></div><div class="glow brk"></div></div>
      </section>

      <section class="col panel" id="C"><div class="brk"></div>
        <div class="ph"><span class="sq"></span><span class="t">REASONING</span><span class="zh">推理过程</span><span class="r lbl">ENGINE · CHIRAL-R1 &nbsp; ◆ TRACE <span id="trace">STANDBY</span></span></div>
        <div class="stat">
          <div><div class="lbl">STEP<span class="en"> 步骤</span></div><div class="v" id="sStep">--<small>/07</small></div></div>
          <div><div class="lbl">ELAPSED<span class="en"> 用时</span></div><div class="v" id="sTime">00:00.00</div></div>
          <div><div class="lbl">CONFIDENCE<span class="en"> 置信度</span></div><div class="v" id="sConf">--</div><div class="cbar"><i id="sConfBar" style="width:0"></i><b></b></div></div>
          <div><div class="lbl">EVIDENCE<span class="en"> 证据</span></div><div class="v" id="sEvi">--</div></div>
        </div>
        <div class="gwrap"><canvas id="graph"></canvas>
          <div class="idle" id="idle"><div class="band"><div class="a" id="idleA">AWAITING CARGO</div><div class="b" id="idleB">等待货物装载 · 装载完成后开始推演</div></div></div>
        </div>
        <div class="loghd"><span class="sq" style="width:6px;height:6px;background:var(--gold)"></span><span class="t">TRACE LOG</span><span class="zh">推理日志</span>
          <span class="chip on" data-f="all" data-h>ALL</span><span class="chip" data-f="evidence" data-h>EVIDENCE</span><span class="chip" data-f="hypothesis" data-h>HYPOTHESIS</span></div>
        <div class="logv scroll" id="logv"><div class="noTrace" id="noTrace">NO TRACE · 暂无推理记录</div><div class="logc" id="logc"></div></div>
        <div class="peek" id="peek"></div>
      </section>

      <div class="colR">
        <section class="panel" id="R1"><div class="brk"></div>
          <div class="ph"><span class="sq"></span><span class="t">EVALUATION</span><span class="zh">评估输出</span><span class="r lbl">6 DIMENSIONS</span></div>
          <div class="scorerow">
            <div class="ring"><canvas id="ring"></canvas><div class="in"><div class="sc" id="score">--<small>/100</small></div><div class="lb">OVERALL</div><div class="lz">综合评分</div></div></div>
            <canvas class="radar" id="radar"></canvas>
          </div>
          <div class="sumrow">
            <span class="chip grade" id="cGrade">GRADE <b>-</b></span>
            <span class="chip risk" id="cRisk">RISK · --</span>
            <span class="chip" id="cConf">CONF --</span>
            <span class="like" id="like" data-h title="点赞"><span class="lk" id="likeLk">${LIKE_SVG}</span><span id="likeN">×0</span></span>
          </div>
          <div class="dims" id="dims"></div>
          <div class="await" id="await1"><span>AWAITING INFERENCE · 等待推演结果</span></div>
          <div class="rscan" id="rscan"></div>
        </section>
        <section class="panel" id="R2"><div class="brk"></div>
          <div class="ph"><span class="sq" style="background:var(--red)"></span><span class="t">IMPACT</span><span class="zh">影响效果</span><span class="r lbl" id="rr">R = S × L</span></div>
          <div class="r2body scroll">
            <div class="imp"><canvas id="mx"></canvas><div class="scope"><div class="lbl" style="margin-bottom:5px">AFFECTED SCOPE<span class="en"> · 影响范围</span></div><div id="scope"></div></div></div>
            <div class="chain" id="chain"></div>
            <div class="sec lbl" style="margin-top:12px">RECOMMENDATIONS<span class="zh">处置建议</span></div>
            <div class="recs" id="recs"></div>
          </div>
          <div class="await" id="await2"><span>AWAITING INFERENCE · 等待推演结果</span></div>
        </section>
      </div>
    </div>
    <canvas class="fx" id="fx"></canvas>
    <input type="file" id="file" multiple hidden>
    <div class="paste" id="paste"><div class="box"><div class="brk"></div>
      <div class="ph"><span class="sq"></span><span class="t">PASTE CARGO</span><span class="zh">粘贴文本为货物</span></div>
      <div class="row"><input id="pName" placeholder="文件名，例如 snippet.py" spellcheck="false"></div>
      <textarea id="pText" placeholder="在此粘贴文档、代码或 diff…" spellcheck="false"></textarea>
      <div class="row" style="justify-content:flex-end"><span class="btn ghost" id="pCancel" data-h>取消</span><span class="btn" id="pOk" data-h>装载 LOAD</span></div>
    </div></div>`;

    const ids = ['L', 'C', 'R1', 'R2', 'cargoN', 'drop', 'dsw', 'dring', 'dt1', 'dt2', 'menu', 'slots', 'goal', 'tok', 'tokbar', 'comp', 'legend', 'start', 'sprog', 'slb', 'rerun', 'clear',
      'trace', 'sStep', 'sTime', 'sConf', 'sConfBar', 'sEvi', 'graph', 'idle', 'idleA', 'idleB', 'logv', 'logc', 'noTrace', 'peek',
      'ring', 'radar', 'score', 'like', 'likeLk', 'likeN', 'dims', 'await1', 'await2', 'rscan', 'rr', 'mx', 'scope', 'chain', 'recs', 'fx', 'file', 'paste', 'pName', 'pText'];
    const el = Object.fromEntries(ids.map((k) => [k, root.querySelector('#' + k)]));
    el.grade = root.querySelector('#cGrade'); el.risk = root.querySelector('#cRisk'); el.conf = root.querySelector('#cConf');
    S = { root, ctx, bag, el, cargo: [], phase: 'idle', run: null, result: null, lines: null, filter: 'all', dimSel: -1, likes: 0, likeT: -1e9,
      autoScroll: true, cv: {}, t: ctx.clock.t, dragAt: -1e9, needFit: true, hoverNode: -1, stale: false };
    el.goal.value = KEEP.goal ?? GOALS[0][1];
    renderSlots();
    resetRight();
    fitAll();
    const ro = new ResizeObserver(() => { if (S) S.needFit = true; });
    ro.observe(root); ro.observe(el.graph); ro.observe(el.radar);
    bag.add(() => ro.disconnect());

    /* ---- events ---- */
    const sfx = ctx.sfx;
    bag.on(root, 'pointerover', (e) => { const h = e.target.closest('[data-h]'); if (h && !h.contains(e.relatedTarget)) sfx.play('hover'); });
    bag.on(el.drop, 'click', () => { if (S.phase !== 'running') el.file.click(); });
    bag.on(el.file, 'change', () => { readFiles(el.file.files); el.file.value = ''; });
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    bag.on(window, 'dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); S.dragAt = S.t; e.dataTransfer.dropEffect = 'copy'; });
    bag.on(window, 'drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); S.dragAt = -1e9; readFiles(e.dataTransfer.files); });
    bag.on(el.slots, 'click', (e) => { const x = e.target.closest('[data-rm]'); if (x) removeCargo(x.dataset.rm); });
    bag.on(root.querySelector('#smpBtn'), 'click', (e) => { e.stopPropagation(); const open = el.menu.style.display === 'none'; el.menu.style.display = open ? 'block' : 'none'; sfx.play(open ? 'slide' : 'back'); });
    bag.on(el.menu, 'click', (e) => {
      e.stopPropagation();
      const mi = e.target.closest('[data-s]');
      if (!mi) return;
      if (mi.dataset.s === 'all') {
        let d = 0;
        SAMPLES.forEach((s) => { if (addCargo(makeCargo(s), d)) d += 220; });
        el.menu.style.display = 'none';
      } else { const s = SAMPLES.find((x) => x.id === mi.dataset.s); addCargo(makeCargo(s)); }
    });
    bag.on(document, 'click', (e) => {
      if (!e.target.closest('#menu,#smpBtn')) el.menu.style.display = 'none';
      if (el.peek.style.display === 'block' && !e.target.closest('#peek,.c,.rec')) closePeek();
    });
    bag.on(root.querySelector('#pasteBtn'), 'click', () => openPaste());
    bag.on(root.querySelector('#pCancel'), 'click', () => closePaste());
    bag.on(root.querySelector('#pOk'), 'click', () => {
      const text = el.pText.value;
      if (!text.trim()) { sfx.play('deny'); return; }
      const name = el.pName.value.trim() || `pasted_${pad(++S.pasteN || (S.pasteN = 1))}.txt`;
      if (addCargo(makeCargo({ id: 'p-' + name + '-' + text.length, name, kind: kindOf(name, text), text }))) closePaste();
    });
    bag.on(document, 'paste', (e) => {
      if (e.target.closest?.('input,textarea')) return;
      const text = e.clipboardData?.getData('text');
      if (!text || !text.trim()) return;
      S.pasteN = (S.pasteN || 0) + 1;
      const name = `pasted_${pad(S.pasteN)}.txt`;
      addCargo(makeCargo({ id: 'p-' + name + '-' + text.length, name, kind: kindOf(name, text), text }));
    });
    bag.on(root.querySelector('.gchips'), 'click', (e) => { const c = e.target.closest('[data-goal]'); if (c) { el.goal.value = GOALS[+c.dataset.goal][1]; sfx.play('select'); } });
    bag.on(el.goal, 'keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startRun(); } });
    bag.on(el.start, 'click', () => {
      if (S.phase === 'running') return;
      if (S.phase === 'done' && !S.stale) exportReport(); else startRun();
    });
    bag.on(el.rerun, 'click', () => startRun());
    bag.on(el.clear, 'click', () => clearAll());
    bag.on(root.querySelector('.loghd'), 'click', (e) => { const c = e.target.closest('[data-f]'); if (!c) return; S.filter = c.dataset.f; applyFilter(); sfx.play('select'); });
    bag.on(el.logv, 'wheel', () => { S.autoScroll = false; }, { passive: true });
    bag.on(el.logv, 'click', (e) => { const c = e.target.closest('.c[data-f]'); if (c) openPeek(c.dataset.f, +c.dataset.l, c); });
    bag.on(el.recs, 'click', (e) => { const r = e.target.closest('.rec[data-f]'); if (r) openPeek(r.dataset.f, +r.dataset.l, r); });
    bag.on(el.peek, 'click', (e) => { if (e.target.closest('.cl')) { closePeek(); sfx.play('back'); } });
    bag.on(el.dims, 'click', (e) => {
      const d = e.target.closest('[data-dim]');
      if (!d || !S.result) return;
      const i = +d.dataset.dim;
      S.dimSel = S.dimSel === i ? -1 : i;
      $$('.dim', el.dims).forEach((x, j) => x.classList.toggle('sel', j === S.dimSel));
      applyFilter();
      sfx.play('select');
      if (S.dimSel >= 0) { const first = S.lines.find((x) => x.shown && x.el.classList.contains('hl')); if (first) { S.autoScroll = false; first.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
    });
    bag.on(el.like, 'click', () => { if (!S.result) return; S.likes++; S.likeT = S.t; sfx.play('like'); });
    const nodeAt = (e) => {
      const r = el.graph.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      return S.nodes.findIndex((n) => Math.hypot(n.x - x, n.y - y) < S.nodeR + 8);
    };
    bag.on(el.graph, 'pointermove', (e) => {
      const i = nodeAt(e);
      const ok = i >= 0 && S.lines && S.lines.some((x) => x.L.step === i && x.shown);
      if (ok && S.hoverNode !== i) sfx.play('hover');
      S.hoverNode = ok ? i : -1;
      el.graph.style.cursor = ok ? 'pointer' : '';
    });
    bag.on(el.graph, 'pointerleave', () => { S.hoverNode = -1; });
    bag.on(el.graph, 'click', (e) => {
      const i = nodeAt(e);
      if (i < 0 || !S.lines) return;
      const first = S.lines.find((x) => x.L.step === i && x.shown);
      if (!first) return;
      S.autoScroll = false;
      first.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (S.flash) S.flash.el.classList.remove('flash');
      first.el.classList.add('flash'); S.flash = { el: first.el, t: S.t };
      sfx.play('select');
    });

    function openPaste() { if (S.phase === 'running') return; el.paste.style.display = 'flex'; el.pText.value = ''; el.pName.value = ''; setTimeout(() => el.pText.focus(), 30); sfx.play('slide'); }
    function closePaste() { el.paste.style.display = 'none'; sfx.play('back'); }
    S.closePaste = closePaste;

    // restore the previous manifest, then cargo sent from the archive ("送入推演")
    let d = 200;
    KEEP.cargo.forEach((c) => { if (addCargo(makeCargo(c), d)) d += 120; });
    ctx.store.cargo.forEach((it) => { if (addCargo(cargoFromStore(it), d)) d += 220; });
    bag.add(ctx.store.on('cargo', (list) => list.forEach((it) => { if (!S.cargo.some((c) => c.id === it.id)) addCargo(cargoFromStore(it)); })));
  },

  update(t, dt) {
    if (!S) return;
    S.t = t;
    if (S.needFit) fitAll();
    updLeft(t);
    updCenter(t, dt);
    drawGraph(S.run ? t - S.run.t0 : 0, !!S.run);
    updRight(t);
    drawFx(S.run ? t - S.run.t0 : 0);
  },

  onKey(e) {
    if (!S) return false;
    if (e.key === 'Escape') {
      if (S.el.paste.style.display === 'flex') { S.closePaste(); return true; }
      if (S.el.peek.style.display === 'block') { closePeek(); S.ctx.sfx.play('back'); return true; }
      if (S.el.menu.style.display === 'block') { S.el.menu.style.display = 'none'; return true; }
      return false;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { startRun(); return true; }
    return false;
  },

  unmount() {
    if (!S) return;
    KEEP.cargo = S.cargo.map(({ id, name, kind, text, size }) => ({ id, name, kind, text, size }));
    KEEP.goal = S.el.goal.value;
    S.bag.dispose();
    S = null;
  },
};

function renderMenu() {
  if (!S) return;
  S.el.menu.innerHTML = SAMPLES.map((s) => {
    const k = KIND[s.kind];
    const on = S.cargo.some((c) => c.id === s.id);
    return `<div class="mi" data-s="${s.id}" data-h><span class="k" style="background:${k.col}">${k.sub}</span><span class="n">${s.name}</span>${on ? '<span class="ok">LOADED</span>' : ''}</div>`;
  }).join('') + `<div class="mi all" data-s="all" data-h><span class="k" style="background:var(--ink)">ALL</span><span class="n">全部载入 · LOAD ALL SAMPLES</span></div>`;
}
