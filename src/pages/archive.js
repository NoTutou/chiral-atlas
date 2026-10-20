/* =========================================================
   SECTOR 02 · ARCHIVE — infinite CD-rack knowledge archive
   drag = pan · wheel = zoom (toward cursor) · click = open record
   / = search · WASD/arrows = pan · +/- = zoom · ESC = close / back
   ========================================================= */
import './archive.css';
import { clamp, lerp, seg, ease, decode, pad, mod, esc, Bag, download, fitCanvas, hash } from '../core/util.js';
import { SHELVES, RECORDS, BY_ID, TOTAL, GROUP_TOTAL, VERIFIED_AT, RATING_POLICY, ratingText, recordToMarkdown } from '../data/archive.js';
import { createRack, drawDisc, recordAt, shelfAt, PITCH_X, PITCH_Z, TX, LZ, HY, GAPV, GAPE } from './archive-rack.js';

let S = null;
const OPEN_END = 2100;

const TPL = `
<canvas class="rack"></canvas>
<div class="edge"></div><div class="shade"></div>
<div class="ovw">
  <div class="ttl">
    <div class="big">ARCHIVE<b> 02</b></div>
    <div class="zh">知识档案库</div>
    <div class="meta"><span class="lbl">PUBLIC VULNERABILITY RECORDS</span><span class="sep"></span>
      <span class="lbl" style="color:var(--ink-2)">${TOTAL} 档案 · ${GROUP_TOTAL} 问题组 · 核验 ${VERIFIED_AT}</span></div>
  </div>
  <div class="cats hit"></div>
  <div class="shelf"><div class="lbl">SHELF / 当前档案列</div><div class="n" data-r="shn">03<small>/ 06</small></div><div class="nm" data-r="shnm"></div></div>
  <div class="srch hit">
    <div class="sbox"><svg width="13" height="13" viewBox="0 0 13 13"><circle cx="5.5" cy="5.5" r="4.5" fill="none" stroke="#a3b6bf"/><path d="M9 9l3.5 3.5" stroke="#a3b6bf"/></svg>
      <input data-r="q" type="search" aria-label="检索档案" placeholder="检索档案 / SEARCH ARCHIVE" spellcheck="false"><span class="k">/</span>
      <div class="res scroll" data-r="res"></div></div>
    <div class="saved" data-r="savedBtn">★ SAVED <b data-r="savedN">00</b></div>
  </div>
  <div class="nav hit">
    <div class="row"><span class="lbl">POSITION / 坐标</span><span class="pos" data-r="pos">—</span></div>
    <div class="z"><button data-r="zo">−</button><div class="zb"><i data-r="zbar"></i></div><button data-r="zi">+</button><span class="zv" data-r="zv">1.00×</span></div>
    <div class="row"><span class="lbl" data-r="drawn">RENDER —</span><span class="home" data-r="home">⌂ RECENTER 归位</span></div>
  </div>
  <div class="help"><b>拖拽</b> 平移　·　<b>滚轮</b> 缩放　·　<b>点击</b> 读取档案　·　<b>WASD</b> 移动　·　<b>/</b> 检索</div>
  <div class="touch-help">单指拖动浏览 · 双指缩放 · 轻点 CD 读取</div>
</div>
<div class="tip"><div class="ln"></div><div class="card">
  <div class="id"><span data-r="tipId"></span><span data-r="tipCat"></span></div>
  <div class="nm" data-r="tipNm"></div>
  <div class="ft"><span data-r="tipMeta"></span><b>▶ CLICK 读取</b></div>
</div></div>
<canvas class="focus"></canvas>
<div class="det">
  <div class="back hit" data-r="back">← ARCHIVE OVERVIEW <span class="k">ESC</span></div>
  <div class="no blk"><div class="n" data-r="dNo"></div>
    <div class="s"><span class="lbl" data-r="dShelf"></span><span class="lbl" style="color:var(--ink-2)">REC <span data-r="dIdx"></span></span></div>
    <div class="pn hit"><span data-r="prev">◀ <b data-r="prevId"></b></span><span data-r="next"><b data-r="nextId"></b> ▶</span></div>
    <div class="mask"></div></div>
  <div class="dp hit">
    <div class="blk"><div class="hd"><span class="lbl" style="color:var(--ink)" data-r="dFile"></span><span class="lbl" data-r="dRef"></span></div>
      <h1 data-r="dT"></h1><h2><span data-r="dZh"></span><small data-r="dCat"></small></h2><div class="mask"></div></div>
    <div class="rule" data-r="rule"></div>
    <div class="blk"><div class="grid" data-r="grid"></div><div class="mask"></div></div>
    <div class="blk"><div class="tabsd" data-r="tabs">
      <div data-tab="0"><i>01</i>概述</div><div data-tab="1"><i>02</i>漏洞分析</div><div data-tab="2"><i>03</i>关联档案</div><div data-tab="3"><i>04</i>来源与核验</div>
    </div><div class="mask"></div></div>
    <div class="blk body scroll" data-r="body"><div data-r="bodyIn"></div><div class="mask"></div></div>
    <div class="blk"><div class="acts">
      <div class="btn" data-r="save">+ SAVE ARCHIVE<span>收藏档案</span></div>
      <div class="btn ghost" data-r="export">EXPORT ↓</div>
      <div class="go" data-r="send">送入推演 → 03 INFERENCE</div>
    </div><div class="mask"></div></div>
  </div>
</div>`;



export default {
  hints: [[['⇔', '拖拽平移', 'sq'], ['⇕', '滚轮缩放', 'sq'], ['●', '点击读取'], ['/', '检索', 'sq'], ['ESC', '返回', 'sq']], ['SECTOR 02 / ARCHIVE', 'CHIRAL LOOP ∞']],

  mount(root, ctx, params) {
    root.innerHTML = TPL;
    const r = {};
    root.querySelectorAll('[data-r]').forEach((el) => { r[el.dataset.r] = el; });
    const bag = new Bag();
    const rackC = root.querySelector('canvas.rack');
    const rack = createRack(rackC);
    S = {
      ctx, root, r, bag, rack, rackC, focus: fitCanvas(root.querySelector('canvas.focus'), 1.5),
      tip: root.querySelector('.tip'), det: root.querySelector('.det'), ovw: root.querySelector('.ovw'),
      masks: [...root.querySelectorAll('.det .mask')],
      hover: null, hoverSince: 0, hot: new Map(), over: false, open: null, drag: null, pointers: new Map(), pinch: null, keys: new Set(),
      tab: 0, track: 0, savedMode: false, sel: 0, matches: [], curShelf: -1, L: null, t0: ctx.clock.t,
    };
    rack.cam.x = 7 * PITCH_X; rack.cam.z = 2 * PITCH_Z;
    rack.saved = ctx.store.saved;
    rack.intro(ctx.clock.t + 250);
    mkFocusGrads();
    buildCats();
    paintSaved();

    /* ---- pointer on the rack ---- */
    bag.on(rackC, 'pointermove', (e) => {
      if (S.pointers.has(e.pointerId)) S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (S.pointers.size > 1) {
        const [a, b] = [...S.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (S.pinch) rack.zoomBy(distance / S.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        S.pinch = Math.max(1, distance); S.drag = null;
        return;
      }
      S.over = true;
      const d = S.drag;
      if (d) {
        const dx = e.clientX - d.lx, dy = e.clientY - d.ly;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) { d.moved = true; rackC.classList.add('grab'); }
        if (d.moved) {
          const bx = rack.cam.x, bz = rack.cam.z;
          rack.pan(dx, dy);
          const dt = Math.max(1, e.timeStamp - d.lt);
          d.vx = lerp(d.vx, (rack.cam.x - bx) / dt, 0.35); d.vz = lerp(d.vz, (rack.cam.z - bz) / dt, 0.35);
        }
        d.lx = e.clientX; d.ly = e.clientY; d.lt = e.timeStamp;
      }
    });
    bag.on(rackC, 'pointerleave', () => { S.over = false; });
    bag.on(rackC, 'pointerdown', (e) => {
      if (S.open || e.button !== 0) return;
      rackC.setPointerCapture(e.pointerId);
      S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      rack.cam.vx = rack.cam.vz = 0;
      if (S.pointers.size > 1) {
        const [a, b] = [...S.pointers.values()];
        S.pinch = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); S.drag = null;
        return;
      }
      S.drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, moved: false, vx: 0, vz: 0 };
      r.q.blur();
    });
    bag.on(rackC, 'pointerup', (e) => {
      S.pointers.delete(e.pointerId);
      if (S.pinch !== null) { if (!S.pointers.size) S.pinch = null; S.drag = null; rackC.classList.remove('grab'); return; }
      const d = S.drag; S.drag = null; rackC.classList.remove('grab');
      if (!d) return;
      if (d.moved) { rack.cam.vx = clamp(d.vx, -3, 3); rack.cam.vz = clamp(d.vz, -3, 3); return; }
      const hv = rack.pick(e.clientX, e.clientY, ctx.clock.t);
      if (hv) openCell(hv, ctx.clock.t);
    });
    const cancelPointer = (e) => { S.pointers.delete(e.pointerId); S.drag = null; if (!S.pointers.size) S.pinch = null; rackC.classList.remove('grab'); };
    bag.on(rackC, 'pointercancel', cancelPointer);
    bag.on(rackC, 'lostpointercapture', cancelPointer);
    bag.on(rackC, 'wheel', (e) => {
      e.preventDefault();
      if (S.open) return;
      rack.zoomBy(Math.exp(-e.deltaY * 0.0012), e.clientX, e.clientY);
      ctx.sfx.play('zoom', { pitch: e.deltaY < 0 ? 1.3 : 0.8 });
    }, { passive: false });

    /* ---- keyboard pan ---- */
    const isInput = (e) => e.target.closest?.('input,textarea');
    bag.on(window, 'keydown', (e) => { if (!isInput(e)) S.keys.add(e.key.toLowerCase()); });
    bag.on(window, 'keyup', (e) => S.keys.delete(e.key.toLowerCase()));
    bag.on(window, 'blur', () => S.keys.clear());

    /* ---- overview UI ---- */
    bag.on(r.zi, 'click', () => { rack.zoomBy(1.25, rack.W * 0.56, rack.H * 0.53); ctx.sfx.play('zoom', { pitch: 1.3 }); });
    bag.on(r.zo, 'click', () => { rack.zoomBy(0.8, rack.W * 0.56, rack.H * 0.53); ctx.sfx.play('zoom', { pitch: 0.8 }); });
    bag.on(r.home, 'click', () => { rack.flyTo({ x: 7 * PITCH_X, z: 2 * PITCH_Z }, ctx.clock.t, { zoom: 1 }); rack.filter = -1; buildCats(); ctx.sfx.play('whoosh', { vol: 0.5 }); });
    bag.on(r.savedBtn, 'click', () => toggleSavedMode());
    let searchBlurTimer;
    bag.add(() => clearTimeout(searchBlurTimer));
    bag.on(r.q, 'input', () => doSearch(r.q.value));
    bag.on(r.q, 'focus', () => { clearTimeout(searchBlurTimer); if (r.q.value) doSearch(r.q.value); });
    bag.on(r.q, 'blur', () => { clearTimeout(searchBlurTimer); searchBlurTimer = setTimeout(() => r.res.classList.remove('on'), 150); });
    bag.on(r.q, 'keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); S.sel = mod(S.sel + (e.key === 'ArrowDown' ? 1 : -1), Math.max(1, S.matches.length)); paintResults(); r.res.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && S.matches[S.sel]) { r.q.blur(); openId(S.matches[S.sel].id); }
      if (e.key === 'Escape') { r.q.value = ''; doSearch(''); r.q.blur(); e.stopPropagation(); }
      else ctx.sfx.play('type');
    });
    bag.on(r.res, 'pointerdown', (e) => { const it = e.target.closest('.it'); if (it) { e.preventDefault(); r.q.blur(); openId(it.dataset.id); } });

    /* ---- detail UI ---- */
    bag.on(r.back, 'click', () => closeOpen());
    bag.on(r.tabs, 'click', (e) => { const d = e.target.closest('[data-tab]'); if (d) { S.tab = +d.dataset.tab; paintTab(); ctx.sfx.play('select'); } });
    bag.on(r.bodyIn, 'click', (e) => {
      const tr = e.target.closest('[data-track]');
      if (tr) { S.track = +tr.dataset.track; S.tab = 1; paintTab(); ctx.sfx.play('select'); return; }
      const tag = e.target.closest('[data-tag]');
      if (tag) { S.pendingQuery = tag.dataset.tag; closeOpen(); return; }
      const rc = e.target.closest('[data-rel]');
      if (rc) { swapTo(rack.cellOf(rc.dataset.rel)); }
    });
    bag.on(r.prev, 'click', () => S.open && swapTo({ ...cellFor(S.open.cell.c, S.open.cell.i - 1) }));
    bag.on(r.next, 'click', () => S.open && swapTo({ ...cellFor(S.open.cell.c, S.open.cell.i + 1) }));
    bag.on(r.save, 'click', () => {
      const on = ctx.store.toggleSave(S.open.rec.id);
      paintSave(); paintSaved();
      ctx.sfx.play(on ? 'like' : 'back');
      ctx.toast(on ? `★ 已收藏 ${S.open.rec.id}` : `已取消收藏 ${S.open.rec.id}`);
    });
    bag.on(r.export, 'click', () => { download(`${S.open.rec.id}.md`, recordToMarkdown(S.open.rec)); ctx.sfx.play('select'); ctx.toast(`已导出 ${S.open.rec.id}.md`); });
    bag.on(r.send, 'click', () => {
      const rec = S.open.rec, text = recordToMarkdown(rec);
      const added = ctx.store.addCargo({ id: 'rec:' + rec.id, name: `${rec.id}.md`, kind: 'record', text, size: new Blob([text]).size, lang: 'md', from: 'archive', record: rec.id });
      ctx.sfx.play('confirm');
      ctx.toast(added ? `${rec.id} 已作为货物装载 → 推理评估` : `${rec.id} 已在推演货物中`);
      setTimeout(() => ctx.navigate('#/inference', { x: innerWidth - 200, y: innerHeight - 200 }), 380);
    });
    bag.on(root, 'pointerover', (e) => {
      const el = e.target.closest('.cat:not(.head),.btn,.go,.tabsd>div,.tr,.rc,.it,.back,.pn span,.home,.saved,.nav button');
      if (el && !el.contains(e.relatedTarget)) ctx.sfx.play('hover');
    });
    bag.on(window, 'resize', () => { rack.resize(); S.focus = fitCanvas(root.querySelector('canvas.focus'), 1.5); mkFocusGrads(); if (S.open) layoutDetail(); });

    if (params[0] && BY_ID.has(params[0])) {
      const cell = rack.cellOf(params[0]);
      rack.cam.x = cell.x; rack.cam.z = cell.z;
      S.pendingOpen = { id: params[0], at: ctx.clock.t + 1100 };
    }
  },

  onRoute(params) {
    const id = params[0];
    if (id && BY_ID.has(id)) { if (!S.open || S.open.rec.id !== id) S.open ? swapTo(S.rack.cellOf(id)) : openId(id); }
    else if (S.open && S.open.tc === null) closeOpen();
  },

  onKey(e) {
    if (!S) return false;
    const k = e.key;
    if (S.open) {
      if (k === 'Escape') { closeOpen(); return true; }
      if (k === 'ArrowLeft' || k === 'ArrowRight') { swapTo(cellFor(S.open.cell.c, S.open.cell.i + (k === 'ArrowLeft' ? -1 : 1))); return true; }
      return ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', '+', '=', '-', '/'].includes(k);
    }
    if (k === '/') { e.preventDefault(); S.r.q.focus(); return true; }
    if (k === '+' || k === '=') { S.rack.zoomBy(1.2, S.rack.W * 0.56, S.rack.H * 0.53); S.ctx.sfx.play('zoom', { pitch: 1.3 }); return true; }
    if (k === '-') { S.rack.zoomBy(0.83, S.rack.W * 0.56, S.rack.H * 0.53); S.ctx.sfx.play('zoom', { pitch: 0.8 }); return true; }
    if (k === 'Enter' && S.hover) { openCell(S.hover, S.ctx.clock.t); return true; }
    if (k === 'Escape' && S.r.q.value) { S.r.q.value = ''; doSearch(''); return true; }
    return ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k);
  },

  update(t, dt) {
    if (!S) return;
    const { rack, ctx, r } = S;
    if (t - S.t0 > 2500) rack.adapt(ctx.clock.frameMs);

    // keyboard pan (screen space)
    const kx = (S.keys.has('d') || S.keys.has('arrowright') ? 1 : 0) - (S.keys.has('a') || S.keys.has('arrowleft') ? 1 : 0);
    const ky = (S.keys.has('s') || S.keys.has('arrowdown') ? 1 : 0) - (S.keys.has('w') || S.keys.has('arrowup') ? 1 : 0);
    if ((kx || ky) && !S.open) rack.pan(-kx * dt * 0.7, -ky * dt * 0.7);

    const M = { x: ctx.mouse.x, y: ctx.mouse.y, inside: S.over && !S.open && !(S.drag && S.drag.moved) };
    rack.update(t, dt, M);

    // hover
    const hv = M.inside && t - S.t0 > 900 ? rack.pick(M.x, M.y, t) : null;
    const same = hv && S.hover && hv.c === S.hover.c && hv.i === S.hover.i;
    if (!same && (hv || S.hover)) {
      S.hover = hv; S.hoverSince = t;
      if (hv) ctx.sfx.play('lift', { pitch: 0.85 + hash(hv.i * 3.3 + hv.c) * 0.4, vol: 0.7, pan: (M.x / rack.W) * 1.6 - 0.8 });
    }
    rack.hover = S.hover;
    rackCursor();
    // hover highlight easing
    const key = S.hover ? rack.KEY(S.hover.c, S.hover.i) : null;
    if (key !== null && !S.hot.has(key)) S.hot.set(key, 0);
    for (const [k, v] of S.hot) {
      const n = v + ((k === key ? 1 : 0) - v) * Math.min(1, dt / 70);
      if (n < 0.005 && k !== key) S.hot.delete(k); else S.hot.set(k, n);
    }

    // open/close progress
    let E = 0;
    const o = S.open;
    if (o) {
      const closing = o.tc !== null;
      E = closing ? o.Ec * (1 - ease.io(seg(t - o.tc, 0, o.closeDur))) : clamp(t - o.t0, 0, OPEN_END);
      o.E = E;
      // Reverse the actual rendered reveal, regardless of how long the reader stayed.
      o.domE = closing ? Math.max(0, o.Dc - (o.Ec - E)) : clamp(t - o.domT0, 0, OPEN_END);
      o.spin += dt / 1000 * (0.6 + ease.io(seg(E, 1350, OPEN_END)) * 1.8);
      if (closing) {
        S.det.scrollTop = o.scroll0 * (1 - ease.io(seg(t - o.tc, 0, Math.min(300, o.closeDur * 0.35))));
        if (E <= 0) finishClose();
      } else if (o.pendingCell && E >= 1050) {
        const cell = o.pendingCell; o.pendingCell = null; swapTo(cell);
      }
    }
    const dim = S.open ? ease.io(seg(E, 150, 800)) : 0;
    rack.dim = dim;
    rack.frozen = !!S.open && S.open.tc === null && E >= OPEN_END && !S.unfreeze;
    S.unfreeze = false;
    rack.draw(t, (c, i) => S.hot.get(rack.KEY(c, i)) || 0);
    S.rackC.style.filter = dim > 0.01 ? `blur(${(dim * 3.5).toFixed(2)}px) brightness(${(1 - dim * 0.45).toFixed(3)})` : '';

    paintTip(t);
    paintOverview(t, dim);
    drawFocus(t, E);
    if (S.pendingOpen && t > S.pendingOpen.at) { const id = S.pendingOpen.id; S.pendingOpen = null; openId(id); }
  },

  unmount() {
    S.bag.dispose();
    S = null;
  },
};

/* ================= helpers ================= */
function cellFor(c, i) { return { c, i, x: i * PITCH_X, z: c * PITCH_Z, rec: recordAt(c, i) }; }

function rackCursor() {
  const c = S.rackC;
  const want = S.drag?.moved ? 'grabbing' : S.hover ? 'pointer' : 'grab';
  if (c.style.cursor !== want) c.style.cursor = want;
}

function buildCats() {
  const { r, rack, ctx } = S;
  r_cats().innerHTML =
    `<div class="cat head"><span class="lbl" style="letter-spacing:3px">INDEX / 分类索引</span><span class="n">${TOTAL}</span></div>` +
    SHELVES.map((s, k) => `<div class="cat ${rack.filter === k ? 'on' : ''}" data-k="${k}"><span class="hx" style="background:${s.col}"></span>${s.zh}<span class="en">${s.en}</span><span class="n">${s.records.length}</span></div>`).join('') +
    `<div class="cat sv ${S.savedMode ? 'on' : ''}" data-k="saved"><span class="hx"></span>我的收藏<span class="en">SAVED</span><span class="n" data-r="savedN2">${ctx.store.saved.size}</span></div>`;
  r_cats().onclick = (e) => {
    const el = e.target.closest('.cat[data-k]');
    if (!el) return;
    if (el.dataset.k === 'saved') { toggleSavedMode(); return; }
    const k = +el.dataset.k;
    rack.filter = rack.filter === k ? -1 : k;
    if (rack.filter === k) {
      const cc = Math.round(rack.cam.z / PITCH_Z), c = cc + mod(k - cc + 3, 6) - 3;
      rack.flyTo({ x: rack.cam.x, z: c * PITCH_Z }, ctx.clock.t, { dur: 700 });
      ctx.sfx.play('whoosh', { vol: 0.45 });
    }
    ctx.sfx.play('select');
    buildCats();
  };
}
const r_cats = () => S.root.querySelector('.cats');

function toggleSavedMode() {
  S.savedMode = !S.savedMode;
  S.r.q.value = '';
  S.matches = []; S.r.res.classList.remove('on');
  S.rack.hits = S.savedMode ? S.ctx.store.saved : null;
  S.r.savedBtn.classList.toggle('on', S.savedMode);
  S.ctx.sfx.play(S.savedMode ? 'scan' : 'back');
  if (S.savedMode) S.ctx.toast(`★ 收藏的 ${S.ctx.store.saved.size} 份档案已在阵列中浮起`);
  buildCats();
}
function paintSaved() { S.r.savedN.textContent = pad(S.ctx.store.saved.size); const n2 = S.root.querySelector('[data-r="savedN2"]'); if (n2) n2.textContent = S.ctx.store.saved.size; }

/* ---------- search ---------- */
function doSearch(q) {
  q = q.trim().toLowerCase();
  const wasSaved = S.savedMode;
  S.savedMode = false; S.r.savedBtn.classList.remove('on');
  if (wasSaved) buildCats();
  if (!q) { S.rack.hits = null; S.matches = []; S.r.res.classList.remove('on'); return; }
  S.matches = RECORDS.filter((x) => [x.id, x.title, x.en, x.tags.join(' '), x.aliases.join(' '), x.component, x.affected, x.fixed, x.summary, ...x.tracks.map((t) => t.body)].join(' ').toLowerCase().includes(q));
  S.rack.hits = new Set(S.matches.map((x) => x.id));
  S.sel = 0;
  paintResults();
  if (S.matches.length) S.ctx.sfx.play('scan', { vol: 0.6 });
}
function paintResults() {
  const m = S.matches;
  S.r.res.innerHTML = m.length
    ? `<div class="cnt">${m.length} MATCHES · 匹配档案已在阵列中浮起</div>` + m.map((x, k) => {
      const sh = SHELVES.find((s) => s.k === x.shelf);
      return `<div class="it ${k === S.sel ? 'sel' : ''}" data-id="${x.id}"><span class="d" style="background:${sh.col}"></span><span class="id">${x.id}</span><span class="t">${esc(x.title)}</span></div>`;
    }).join('')
    : `<div class="none">无匹配档案 · NO MATCH</div>`;
  S.r.res.classList.add('on');
}

/* ---------- open / close ---------- */
function openId(id) {
  const { rack, ctx } = S;
  if (S.open) { swapTo(rack.cellOf(id)); return; }
  const cell = rack.cellOf(id);
  if (!cell) return;
  const [sx, sy] = rack.P(cell.x, 0, cell.z);
  const far = sx < rack.W * 0.15 || sx > rack.W * 0.9 || sy < rack.H * 0.15 || sy > rack.H * 0.85;
  if (far || rack.cam.zoom < 0.8) {
    ctx.sfx.play('whoosh', { vol: 0.5 });
    rack.flyTo(cell, ctx.clock.t, { dur: 750, zoom: Math.max(rack.cam.zoom, 1), done: () => S && openCell(cell, S.ctx.clock.t) });
  } else openCell(cell, ctx.clock.t);
}

function openCell(cell, t) {
  if (S.open) return;
  const { rack, ctx } = S;
  rack.stop();
  S.pendingOpen = null;
  S.open = { cell, rec: cell.rec, t0: t, domT0: t, tc: null, E: 0, domE: 0, spin: 0,
    lift0: rack.caseLiftAt(cell.c, cell.i, t), hot0: S.hot.get(rack.KEY(cell.c, cell.i)) || 0, fired: new Set() };
  rack.exclude = rack.KEY(cell.c, cell.i);
  rack.holdAt(cell.c, cell.i);
  S.over = false; S.hover = null; rack.hover = null;
  rack.ripple(cell.x, cell.z, t);
  S.tab = 0; S.track = 0;
  S.det.scrollTop = 0;
  fillDetail(cell.rec);
  layoutDetail();
  S.det.style.opacity = '0';
  S.r.back.inert = true;
  S.masks.forEach((mk) => { mk.style.opacity = '1'; mk.style.transform = 'scaleX(1)'; mk.parentElement.inert = true; });
  S.det.classList.add('on');
  ctx.sfx.play('open');
  history.replaceState(null, '', '#/archive/' + cell.rec.id);
}

function swapTo(cell) {
  if (!cell || !S.open) return;
  const { rack, ctx } = S;
  if (S.open.tc !== null) { S.nextId = cell.rec.id; return; }
  if (S.open.E < 1050) { S.open.pendingCell = cell; return; }
  S.open.cell = cell; S.open.rec = cell.rec;
  S.open.domT0 = ctx.clock.t - 850; S.open.domE = 850; S.open.fired = new Set(['open', 'disc']);
  rack.exclude = rack.KEY(cell.c, cell.i);
  rack.holdAt(cell.c, cell.i);
  rack.cam.x = cell.x; rack.cam.z = cell.z; S.unfreeze = true;
  S.open.lift0 = rack.caseLiftAt(cell.c, cell.i, ctx.clock.t);
  S.tab = 0; S.track = 0;
  S.det.scrollTop = 0;
  fillDetail(cell.rec);
  ctx.sfx.play('slide', { pitch: 1.2 });
  history.replaceState(null, '', '#/archive/' + cell.rec.id);
}

function closeOpen() {
  const o = S.open;
  if (!o || o.tc !== null) return;
  o.tc = S.ctx.clock.t; o.Ec = o.E; o.Dc = o.domE;
  o.closeDur = clamp(o.Ec * 0.6, 360, 1250);
  o.scroll0 = S.det.scrollTop;
  o.pendingCell = null;
  S.det.classList.add('closing'); S.det.inert = true;
  S.ctx.sfx.play('close');
}
function finishClose() {
  const { c, i } = S.open.cell;
  S.rack.releaseAt(c, i, S.ctx.clock.t);
  S.rack.exclude = null;
  S.open = null;
  S.det.classList.remove('on', 'closing'); S.det.inert = false;
  history.replaceState(null, '', '#/archive');
  if (S.pendingQuery) { S.r.q.value = S.pendingQuery; S.pendingQuery = null; doSearch(S.r.q.value); S.r.q.focus(); }
  if (S.nextId) { const id = S.nextId; S.nextId = null; openId(id); }
}

/* ---------- detail DOM ---------- */
function layoutDetail() {
  const W = innerWidth, H = innerHeight;
  if (W <= 1100) {
    const top = parseFloat(getComputedStyle(S.ctx.hud.el).height);
    const FW = Math.min(W * 0.38, 200), FH = FW * HY / LZ;
    S.L = { FX: 24, FY: top + 76, FW, FH };
    const no = S.root.querySelector('.det .no'), dp = S.root.querySelector('.det .dp');
    Object.assign(S.r.back.style, { left: '', top: '' });
    Object.assign(no.style, { left: '', top: '', marginLeft: (FW + 28) + 'px', minHeight: (FH + 58) + 'px' });
    Object.assign(dp.style, { left: '', right: '', top: '', bottom: '' });
    return;
  }
  const FW = Math.min(W * 0.36, ((H - 400) * LZ) / HY, 600), FH = (FW * HY) / LZ;
  const FX = Math.max(52, W * 0.06), FY = Math.max(150, 64 + (H - 64 - 40 - FH) / 2 - 40);
  S.L = { FX, FY, FW, FH };
  const { r } = S;
  r.back.style.left = FX + 'px';
  const no = S.root.querySelector('.det .no');
  no.style.marginLeft = ''; no.style.minHeight = '';
  no.style.left = FX + 'px'; no.style.top = FY + FH + 62 + 'px';
  const dp = S.root.querySelector('.det .dp');
  const left = FX + FW + Math.max(50, W * 0.05);
  Object.assign(dp.style, { left: left + 'px', right: '48px', top: '96px', bottom: '54px' });
}

function fillDetail(x) {
  const { r, ctx } = S;
  const sh = SHELVES.find((s) => s.k === x.shelf);
  const j = sh.records.indexOf(x);
  r.dFile.textContent = `FILE ${x.id}`;
  r.dRef.textContent = `REFERENCE AREA · SHELF ${sh.k}`;
  r.dZh.textContent = x.title;
  r.dCat.textContent = `${sh.zh} / ${sh.en}`;
  r.dShelf.textContent = `SHELF ${sh.k} · ${sh.en}`;
  r.dIdx.textContent = `${pad(j + 1)} / ${pad(sh.records.length)}`;
  r.prevId.textContent = sh.records[mod(j - 1, sh.records.length)].id;
  r.nextId.textContent = sh.records[mod(j + 1, sh.records.length)].id;
  r.grid.innerHTML = [
    ['COMPONENT / 组件', x.component], ['RATING / 来源评级', ratingText(x)],
    ['PUBLISHED / 来源首发', x.published || '未确认'], ['UPDATED / 来源更新', x.updated || '未确认'],
    ['EVIDENCE / 证据', `${x.sources.length} 份来源 · ${x.origin}`], ['VERIFICATION / 核验边界', x.verification],
  ].map(([l, v]) => `<div><div class="lbl">${l}</div><div class="v">${esc(v)}</div></div>`).join('');
  paintTab(); paintSave();
}

function paintSave() {
  const on = S.ctx.store.saved.has(S.open.rec.id);
  S.r.save.classList.toggle('done', on);
  S.r.save.innerHTML = on ? '★ SAVED<span>已收藏 · 点击取消</span>' : '+ SAVE ARCHIVE<span>收藏档案</span>';
}

function sourceLinks(x, ids) {
  return ids.map((id) => x.sources.find((s) => s.id === id)).filter(Boolean).map((s) =>
    `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.id)} ↗</a>`).join(' · ');
}
function paintTab() {
  const x = S.open.rec, { r } = S;
  r.tabs.querySelectorAll('[data-tab]').forEach((d) => d.classList.toggle('on', +d.dataset.tab === S.tab));
  const trackRow = (t, k, on) => `<button class="tr ${on ? 'on' : ''}" data-track="${k}" aria-expanded="${S.tab === 1 && on}"><span class="i">${pad(k + 1)}</span>${esc(t.t)}<span class="d">${t.sources.length} SRC</span></button>`;
  let html = '';
  if (S.tab === 0) {
    html = `<div class="abs">${esc(x.summary)}</div>
      <div class="fact"><b>受影响范围</b><p>${esc(x.affected)}</p><b>修复状态</b><p>${esc(x.fixed)}</p></div>
      <div class="notice">${esc(x.verification)}${x.notes.length ? '<ul>' + x.notes.map((n) => `<li>${esc(n)}</li>`).join('') + '</ul>' : ''}</div>
      <div class="fact">问题组：${esc(x.canonicalId)} · ${esc(x.origin)}${x.aliases.length ? '<br>关联编号：' + esc(x.aliases.join(' · ')) : ''}</div>
      <div class="tags">${x.tags.map((g) => `<button class="chip" data-tag="${esc(g)}" title="检索此标签"><span class="d"></span>${esc(g)}</button>`).join('')}</div>
      <div style="margin-top:8px">${x.tracks.map((t, k) => trackRow(t, k, k === S.track)).join('')}</div>`;
  } else if (S.tab === 1) {
    html = `<div style="margin-top:12px">${x.tracks.map((t, k) => trackRow(t, k, k === S.track) + (k === S.track ? `<div class="trb">${esc(t.body)}<div class="refs">参考证据：${sourceLinks(x, t.sources)}</div></div>` : '')).join('')}</div>`;
  } else if (S.tab === 2) {
    html = `<div class="fact">${x.related.length} 份关联档案。相同问题的证据档案不重复计入问题组；机制相关条目保留独立编号。</div><div class="rel">${x.related.map((rel) => {
      const y = BY_ID.get(rel.id), sh = SHELVES.find((s) => s.k === y.shelf);
      return `<button class="rc" data-rel="${y.id}"><span class="id" style="color:${sh.col}">${esc(y.id)} →</span><strong>${esc(y.title)}</strong><span class="reason">${esc(rel.type)} · ${esc(rel.reason)}</span></button>`;
    }).join('') || '<div class="fact">暂无已确认的关联档案。</div>'}</div>`;
  } else {
    html = `<div class="fact">资料核验：${esc(x.verifiedAt.slice(0, 10))}。公开证据整理，未执行 PoC。<br>${esc(RATING_POLICY)}</div>
      <div class="ratings">${x.ratings.map((a) => `<div class="evidence"><b>${esc(a.source)}</b><p>CVSS ${esc(a.version)} · ${esc(a.severity)} · ${a.score ?? '未提供分数'}</p><code>${esc(a.vector || '未提供向量')}</code></div>`).join('') || '<div class="notice">公开来源未提供 CVSS 评分，不推定风险分数。</div>'}</div>
      <div class="fact"><b>来源时间线</b>${x.timeline.map((e) => `<p>${esc(e.time.slice(0, 10))} · ${esc(e.event)} · ${esc(e.source)}</p>`).join('') || '<p>未取得可确认的来源时间。</p>'}</div>
      <div class="sources">${x.sources.map((a) => `<article class="evidence"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.label)} ↗</a><p>${esc(a.url)}</p><p>采集/核验：${esc(a.retrievedAt)}<br>方法：${esc(a.method)}</p><details><summary>本地证据位置与校验值</summary><p>knowledge-base/${esc(a.snapshot)}</p><code>SHA-256 ${esc(a.sha256)}</code></details></article>`).join('')}</div>`;
  }
  r.bodyIn.innerHTML = html;
  r.body.scrollTop = 0;
}

/* ---------- per-frame painters ---------- */
function paintTip(t) {
  const { rack, r, tip } = S;
  const hv = S.hover;
  if (!hv || S.open) { tip.style.opacity = 0; return; }
  const p = ease.out(seg(t - S.hoverSince, 0, 260));
  tip.style.opacity = ease.out(seg(t - S.hoverSince, 0, 180));
  const a = rack.P(hv.x, rack.liftAt(hv.c, hv.i, t) + 4, hv.z + LZ / 2);
  const flip = a[0] + 380 > rack.W, low = a[1] - 160 < 80;
  const dx = flip ? -70 : 70, dy = low ? 60 : -96;
  tip.style.transform = `translate(${a[0]}px,${a[1]}px)`;
  const ln = tip.firstChild, card = tip.lastChild;
  ln.style.width = Math.hypot(dx, dy) * p + 'px';
  ln.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  card.style.left = (flip ? dx - 280 : dx) + 'px';
  card.style.top = (low ? dy : dy - 54) + 'px';
  card.style.clipPath = `inset(0 ${100 - ease.out(seg(t - S.hoverSince, 120, 420)) * 100}% 0 0)`;
  const dp = seg(t - S.hoverSince, 100, 600), x = hv.rec;
  r.tipId.textContent = decode(x.id, dp, hv.i);
  r.tipNm.textContent = decode(x.title, dp, hv.i + 3);
  const sh = shelfAt(hv.c);
  r.tipCat.textContent = sh.en; r.tipCat.style.color = sh.col;
  r.tipMeta.textContent = `${ratingText(x)} · ${x.sources.length} SOURCES${S.ctx.store.saved.has(x.id) ? ' · ★' : ''}`;
}

function paintOverview(t, dim) {
  const { rack, r } = S;
  const intro = ease.out(seg(t - S.t0, 600, 1400));
  S.ovw.style.opacity = intro * (1 - dim);
  S.ovw.style.visibility = dim > 0.98 ? 'hidden' : '';
  const c = S.hover ? S.hover.c : Math.round(rack.cam.z / PITCH_Z);
  const k = mod(c, SHELVES.length);
  if (k !== S.curShelf) {
    S.curShelf = k;
    const sh = SHELVES[k];
    r.shn.innerHTML = `${pad(k + 1)}<small>/ ${pad(SHELVES.length)}</small>`;
    r.shnm.innerHTML = `${sh.k} · ${esc(sh.zh)}<span>${sh.en}</span>`;
    S.root.querySelectorAll('.cat[data-k]').forEach((el) => el.classList.toggle('cur', el.dataset.k == k));
  }
  if (Math.floor(t / 100) !== S.lastNav) {
    S.lastNav = Math.floor(t / 100);
    const cc = Math.round(rack.cam.z / PITCH_Z), ic = Math.round(rack.cam.x / PITCH_X);
    const sg = (n) => (n >= 0 ? '+' : '−') + pad(Math.abs(n), 3);
    r.pos.textContent = `COL ${sg(cc)} · SLOT ${sg(ic)}`;
    r.zv.textContent = rack.cam.zoom.toFixed(2) + '×';
    r.zbar.style.width = ((rack.cam.zoom - 0.55) / (2.2 - 0.55)) * 100 + '%';
    r.drawn.textContent = `RENDER ${rack.drawn || 0} CASES`;
  }
}

/* ---------- focus layer: the opened case ---------- */
let fGrads = null;
function mkFocusGrads() {
  const g = S.focus.g;
  const a = g.createLinearGradient(0, 0, 0, HY);
  a.addColorStop(0, 'rgba(34,52,62,.97)'); a.addColorStop(0.35, 'rgba(15,25,32,.98)'); a.addColorStop(1, 'rgba(6,10,13,1)');
  const b = g.createLinearGradient(0, 0, 0, HY);
  b.addColorStop(0, 'rgba(52,86,104,.98)'); b.addColorStop(0.4, 'rgba(18,32,42,.98)'); b.addColorStop(1, 'rgba(6,10,13,1)');
  fGrads = [a, b];
}
function fire(o, name, E, at, fn) { if (E >= at && !o.fired.has(name)) { o.fired.add(name); fn(); } }

function drawFocus(t, E) {
  const { g, w, h, dpr } = S.focus;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const o = S.open;
  if (!o) return;
  const { rack, ctx } = S;
  const cs = o.cell, rec = o.rec, sh = shelfAt(cs.c);
  const { FX, FW, FH } = S.L;
  const FY = S.L.FY - (innerWidth <= 1100 ? S.det.scrollTop : 0);
  const closing = o.tc !== null;
  const lifted = ease.out(seg(E, 0, 380));
  // Return to the raised place; the held spring also keeps its neighbours up.
  const heldLift = rack.caseLiftAt(cs.c, cs.i, t);
  const restLift = closing ? heldLift : lerp(o.lift0, heldLift, lifted);
  const lift = restLift + 130 * lifted;
  const m = ease.io(seg(E, 280, 1050));
  const vis = lerp(clamp(lift - rack.caseLiftAt(cs.c, cs.i - 1, t) + GAPV, 0, HY), HY, m);
  const visE = lerp(clamp(lift - rack.caseLiftAt(cs.c - 1, cs.i, t) + GAPE, 0, HY), HY, m);
  const hot = lerp(closing ? (S.hot.get(rack.KEY(cs.c, cs.i)) || 0) : o.hot0, 1, lifted);
  const sy = rack.P(cs.x, 0, cs.z)[1];
  const fog = lerp(clamp(0.32 + 0.75 * (sy + 120) / (rack.H + 120), 0.2, 1) *
    (1 - rack.introAt(cs.c, cs.i, t)) *
    (rack.filter >= 0 && mod(cs.c, SHELVES.length) !== rack.filter ? 0.32 : 1), 1, lifted);
  const xL = cs.x - TX / 2, xR = cs.x + TX / 2, zN = cs.z - LZ / 2, zF = cs.z + LZ / 2;
  const O0 = rack.P(xL, lift, zF), U0 = rack.P(xL, lift, zN), V0 = rack.P(xL, lift - HY, zF);
  const O = [lerp(O0[0], FX, m), lerp(O0[1], FY, m)], U = [lerp(U0[0], FX + FW, m), lerp(U0[1], FY, m)], V = [lerp(V0[0], FX, m), lerp(V0[1], FY + FH, m)];
  const aff = (A, B, C) => g.setTransform((dpr * (B[0] - A[0])) / LZ, (dpr * (B[1] - A[1])) / LZ, (dpr * (C[0] - A[0])) / HY, (dpr * (C[1] - A[1])) / HY, dpr * A[0], dpr * A[1]);

  // thickness faces fade while the case turns to face the camera
  if (m < 0.98) {
    g.globalAlpha = (1 - m) * fog;
    const edge = rack.P(xR, lift, zF);
    const dx = (edge[0] - O0[0]) * (1 - m), dy = (edge[1] - O0[1]) * (1 - m);
    const end = [U[0] + (V[0] - O[0]) * visE / HY, U[1] + (V[1] - O[1]) * visE / HY];
    const q = (pts, fill) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = fill; g.fill(); };
    q([U, [U[0] + dx, U[1] + dy], [end[0] + dx, end[1] + dy], end], `rgb(${22 + hot * 40 | 0},${34 + hot * 60 | 0},${42 + hot * 70 | 0})`);
    q([U, [U[0] + dx, U[1] + dy], [O[0] + dx, O[1] + dy], O], `rgba(${40 + hot * 150 | 0},${60 + hot * 160 | 0},${72 + hot * 165 | 0},${0.78 + hot * 0.2})`);
    g.globalAlpha = 1;
  }
  if (m > 0) {
    g.save(); g.globalAlpha = Math.pow(m, 6) * 0.6; g.shadowColor = 'rgba(43,181,238,.55)'; g.shadowBlur = 60;
    g.fillStyle = '#05090c'; g.beginPath(); g.moveTo(...O); g.lineTo(...U);
    g.lineTo(U[0] + V[0] - O[0], U[1] + V[1] - O[1]); g.lineTo(...V); g.closePath(); g.fill(); g.restore();
  }
  aff(O, U, V);
  rack.faceArt(g, rec, sh, hot, fog, vis, lift, m > 0, fGrads);
  g.globalAlpha = 1;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  fire(o, 'disc', E, 1350, () => ctx.sfx.play('disc'));
  if (m > 0.6) {
    const clr = ease.io(seg(E, 950, 1500));
    const slide = ease.io(seg(E, 1350, OPEN_END));
    const r = FH * 0.41;
    const dcx = FX + FW * 0.47 + slide * FW * 0.27, dcy = FY + FH * 0.56;
    g.save(); g.globalAlpha = clr;
    const rr = FH * 0.078;
    g.strokeStyle = 'rgba(227,162,58,.9)'; g.lineWidth = rr * 0.27; g.beginPath(); g.arc(FX + FW - FW * 0.125, FY + FH * 0.17, rr, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,210,126,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(FX + FW - FW * 0.125, FY + FH * 0.17, rr * 1.35, 0, 7); g.stroke();
    g.restore();
    drawDisc(g, dcx, dcy, r, o.spin, clr, `CHIRAL ATLAS · ARCHIVE ${rec.id} · ${rec.en} · ${rec.severity} · `);
    const yc = FY + FH * clr;
    g.save(); g.globalAlpha = ease.io(seg(E, 950, 1150));
    g.beginPath(); g.rect(FX, yc, FW, FY + FH - yc); g.clip();
    g.fillStyle = 'rgba(120,160,175,.20)'; g.fillRect(FX, FY, FW, FH);
    for (let k = 0; k < FH; k += 3) { g.fillStyle = `rgba(200,230,240,${0.02 + hash(k) * 0.03})`; g.fillRect(FX, FY + k, FW, 1); }
    g.restore();
    if (clr > 0 && clr < 1) {
      g.fillStyle = 'rgba(134,227,255,.9)'; g.fillRect(FX - 10, yc, FW + 20, 1.5);
      g.fillStyle = 'rgba(134,227,255,.18)'; g.fillRect(FX, yc - 26, FW, 26);
    }
    g.save(); g.globalAlpha = clr;
    aff(O, U, V);
    g.fillStyle = 'rgba(233,241,244,.96)'; g.fillRect(10, 12, 74, 27);
    g.fillStyle = '#05080b'; g.font = '600 4px "Barlow Condensed"'; g.fillText('CHIRAL ATLAS · ARCHIVE', 14, 19);
    g.font = '700 11.5px "Barlow Condensed"'; g.fillText(rec.id, 14, 33, 64);
    g.fillStyle = sh.col; g.fillRect(70, 15, 10, 3);
    g.restore();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = `rgba(233,241,244,${clr})`; g.lineWidth = 1.2;
    const bk = (x, y, sx, sy) => { g.beginPath(); g.moveTo(x + sx * 18, y); g.lineTo(x, y); g.lineTo(x, y + sy * 18); g.stroke(); };
    bk(FX - 14, FY - 14, 1, 1); bk(FX + FW + 14, FY - 14, -1, 1); bk(FX - 14, FY + FH + 14, 1, -1); bk(FX + FW + 14, FY + FH + 14, -1, -1);
    g.fillStyle = `rgba(160,190,200,${clr * 0.6})`;
    for (let k = 0; k <= 40; k++) g.fillRect(FX + (k * FW) / 40, FY + FH + 24, 1, k % 5 ? 3 : 7);
    g.font = '10px "Share Tech Mono"'; g.fillText(`${rec.sources.length} PUBLIC SOURCES · VERIFIED ${VERIFIED_AT}`, FX, FY + FH + 44);
  }

  // DOM reveal (mask bars slide away, staggered)
  const D = o.domE;
  const scrollFade = closing && o.scroll0 > 0 ? 1 - ease.io(seg(t - o.tc, 0, 220)) : 1;
  S.det.style.opacity = ease.io(seg(D, 600, 900)) * scrollFade;
  const base = 900;
  S.masks.forEach((mk, k) => {
    const p = ease.io(seg(D, base + k * 110, base + k * 110 + 520));
    mk.style.transform = `scaleX(${1 - p})`;
    mk.style.opacity = p >= 1 ? 0 : 1;
    mk.parentElement.inert = closing || p < 1;
    fire(o, 'm' + k, D, base + k * 110 + 60, () => ctx.sfx.play('slide', { pitch: 0.9 + k * 0.08 }));
  });
  S.r.rule.style.transform = `scaleX(${ease.io(seg(D, base + 150, base + 900))})`;
  S.r.dT.textContent = decode(rec.en, seg(D, base + 100, base + 900), 5);
  S.r.dNo.textContent = decode(rec.id, seg(D, base, base + 600), 2);
  if (D > base + 100 && D < base + 900) ctx.sfx.play('tick', { vol: 0.8 });
  S.r.back.style.opacity = ease.out(seg(D, 900, 1300));
  S.r.back.inert = closing || D < 1300;
  S.root.querySelectorAll('.tr.on .w i').forEach((el, j) => { el.style.height = 3 + Math.abs(Math.sin(t / 180 + j * 0.7)) * 11 + 'px'; });
}
