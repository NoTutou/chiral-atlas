/* =========================================================
   SECTOR 01 · RESERVED — uncharted zone under timefall
   The Odradek-like scanner tracks the cursor: the closer you get, the more it unfolds
   and turns orange ("detecting"). Also exports drawOdradek() for the hub facility.
   ========================================================= */
import './reserved.css';
import { clamp, lerp, seg, ease, damp, hash, decode, Bag, fitCanvas } from '../core/util.js';

/** five-petal scanner. fold 0 = closed (pointing up) → 1 = fully open; detect 0..1 = white → orange */
export function drawOdradek(g, ox, oy, sc, fold, rot, detect, T) {
  const col = (a) => `rgba(${Math.round(lerp(233, 255, detect))},${Math.round(lerp(241, 138, detect))},${Math.round(lerp(244, 60, detect))},${a})`;
  for (let i = 0; i < 5; i++) {
    const a0 = -Math.PI / 2 + (i - 2) * 0.12, a1 = -Math.PI / 2 + (i - 2) * Math.PI * 2 / 5;
    const an = lerp(a0, a1, ease.io(clamp(fold))) + rot * clamp((fold - 0.55) * 2.2);
    const L = (58 + 6 * Math.sin(T / 300 + i) * detect) * sc;
    g.save(); g.translate(ox, oy); g.rotate(an);
    const lg = g.createLinearGradient(8 * sc, 0, 8 * sc + L, 0);
    lg.addColorStop(0, col(0.95)); lg.addColorStop(1, col(0.35));
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(8 * sc, -3.6 * sc); g.lineTo(8 * sc + L, -1.4 * sc); g.lineTo(8 * sc + L, 1.4 * sc); g.lineTo(8 * sc, 3.6 * sc); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(5,9,12,.6)'; g.lineWidth = 0.8 * sc; g.beginPath(); g.moveTo(12 * sc, 0); g.lineTo(8 * sc + L - 4 * sc, 0); g.stroke();
    g.fillStyle = detect > 0.3 ? '#ff8a3c' : '#86e3ff';
    g.shadowColor = g.fillStyle; g.shadowBlur = 8 * sc;
    g.beginPath(); g.arc(8 * sc + L + 3 * sc, 0, 2.2 * sc, 0, 7); g.fill(); g.shadowBlur = 0;
    g.restore();
  }
  g.fillStyle = col(1); g.beginPath(); g.arc(ox, oy, 7.5 * sc, 0, 7); g.fill();
  g.fillStyle = '#05080b'; g.beginPath(); g.arc(ox, oy, 3 * sc, 0, 7); g.fill();
}

/** iso hatch (sealed). pulse 0..1 = red rim */
export function drawHatch(g, hx, hy, sc, pulse) {
  g.save(); g.translate(hx, hy); g.scale(sc, sc * 0.33);
  for (const [r, a] of [[96, 0.22], [74, 0.35], [44, 0.5]]) { g.strokeStyle = `rgba(233,241,244,${a})`; g.lineWidth = 1.2 / sc; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
  g.strokeStyle = 'rgba(233,241,244,.18)';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 44, Math.sin(a) * 44); g.lineTo(Math.cos(a) * 96, Math.sin(a) * 96); g.stroke(); }
  g.strokeStyle = `rgba(255,90,60,${0.15 + pulse * 0.7})`; g.lineWidth = 2.4 / sc; g.beginPath(); g.arc(0, 0, 96, 0, 7); g.stroke();
  g.restore();
  g.fillStyle = 'rgba(233,241,244,.7)'; g.fillRect(hx - 6 * sc, hy - 4 * sc, 12 * sc, 9 * sc);
  g.strokeStyle = 'rgba(233,241,244,.7)'; g.lineWidth = 1.4 * sc; g.beginPath(); g.arc(hx, hy - 5 * sc, 4.5 * sc, Math.PI, 0); g.stroke();
}

let ctx, root, bag, cv, T = 0, rot = 0, fold = 0.2, det = 0, sent = false, sentT = -1e9, lastPing = 0, wasNear = false;
const els = {};
const RAIN = Array.from({ length: 260 }, (_, i) => ({ x: hash(i * 3.1), y: hash(i * 7.7), l: 14 + hash(i * 1.3) * 30, v: 0.35 + hash(i * 5.9) * 0.4, a: 0.06 + hash(i * 2.9) * 0.16 }));
const FOG = Array.from({ length: 9 }, (_, i) => ({ x: 0.35 + hash(i * 4.4) * 0.6, y: 0.2 + hash(i * 2.2) * 0.7, r: 0.18 + hash(i * 8.8) * 0.18, ph: i * 1.7 }));

function draw(dt) {
  const { g, w, h } = cv;
  const ox = w * 0.7, oy = h * 0.45, sc = Math.min(w / 1600, h / 900) * 2.6;
  const m = ctx.mouse;
  const d = m.inside ? Math.hypot(m.x - ox, m.y - oy) : 1e4;
  const near = clamp(1 - (d - 120 * sc / 2.6) / (420 * sc / 2.6));
  det = damp(det, Math.max(near > 0.75 ? 1 : 0, seg(T - sentT, 0, 200) * (1 - seg(T - sentT, 1400, 2400))), 5, dt);
  fold = damp(fold, Math.max(near, 0.22 + 0.12 * Math.sin(T / 1700), det), 4, dt);
  rot += dt / 1000 * (0.3 + det * 3.2 + near * 0.6);
  if (near > 0.75 && !wasNear) { ctx.sfx.play('deny', { vol: 0.5 }); ctx.sfx.play('glitch', { vol: 0.5 }); }
  wasNear = near > 0.75;

  g.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  // fog
  for (const f of FOG) {
    const x = (f.x + Math.sin(T / 6200 + f.ph) * 0.03) * w, y = (f.y + Math.cos(T / 7100 + f.ph) * 0.02) * h, r = f.r * w;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${110 + det * 90},${105 - det * 40},${100 - det * 50},.10)`); gr.addColorStop(1, 'rgba(60,60,60,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // timefall over the whole page
  g.lineWidth = 1;
  for (const r of RAIN) {
    const y = ((r.y * (h + 80) + T * r.v) % (h + 80)) - 40;
    const x = ((r.x * (w + 200) - y * 0.22) % (w + 200) + w + 200) % (w + 200) - 100;
    g.strokeStyle = `rgba(200,215,225,${r.a})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - r.l * 0.22, y + r.l); g.stroke();
  }
  // ground hatch + tether
  const hx = ox, hy = oy + 230 * sc / 2.6;
  drawHatch(g, hx, hy, sc * 1.25, det * (0.5 + 0.5 * Math.sin(T / 120)));
  g.strokeStyle = 'rgba(233,241,244,.22)'; g.setLineDash([3, 6]); g.beginPath(); g.moveTo(hx, hy - 14); g.lineTo(ox, oy + 22 * sc); g.stroke(); g.setLineDash([]);
  // pings
  const per = lerp(2600, 700, det);
  for (let j = 0; j < 3; j++) {
    const p = ((T / per) + j / 3) % 1;
    g.strokeStyle = det > 0.3 ? `rgba(255,138,60,${(1 - p) * 0.5})` : `rgba(200,230,240,${(1 - p) * 0.25})`;
    g.lineWidth = 1; g.beginPath(); g.arc(ox, oy, 20 * sc + p * 260 * sc, 0, 7); g.stroke();
  }
  // bearing line from scanner toward the cursor while detecting
  if (near > 0.05 && m.inside) {
    g.strokeStyle = `rgba(255,138,60,${near * 0.6})`; g.setLineDash([2, 5]);
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(m.x, m.y); g.stroke(); g.setLineDash([]);
    g.font = '10px "Share Tech Mono"'; g.fillStyle = `rgba(255,138,60,${near})`;
    g.fillText(`DIST ${(d / 100).toFixed(2)} m · ${near > 0.75 ? 'CONTACT' : 'TRACKING'}`, m.x + 16, m.y - 12);
  }
  drawOdradek(g, ox, oy, sc, fold, rot, det, T);
  // static noise
  const n = 20 + Math.round(det * 80);
  for (let i = 0; i < n; i++) {
    const r = hash(i * 9.1 + Math.floor(T / 70) * 1.37);
    g.fillStyle = det > 0.3 && r > 0.6 ? `rgba(255,90,60,${0.08 + r * 0.2})` : `rgba(220,230,235,${0.03 + r * 0.1})`;
    g.fillRect(hash(i * 3.3 + Math.floor(T / 70)) * w, r * h, 2 + hash(i * 1.9) * 60, 1 + (r > 0.85 ? 2 : 0));
  }
  if (det > 0.3 && T - lastPing > 1200) { lastPing = T; ctx.sfx.play('scan', { vol: 0.5 }); }
  els.det.textContent = det > 0.5 ? 'CONTACT' : near > 0.05 ? 'TRACKING' : 'IDLE';
  els.det.className = 'v' + (det > 0.5 ? ' o' : '');
  els.sig.textContent = (det * 3.7).toFixed(1) + ' dB';
}

export default {
  hints: [[['●', '接入申请'], ['ESC', '返回网络图', 'sq'], ['Q', '/ E 切换', 'sq']],
    ['SECTOR 01 / RESERVED', 'CHIRAL COVERAGE <b>0%</b>', 'TIMEFALL <b style="color:#ff8a3c">ACTIVE</b>']],

  mount(r, c) {
    root = r; ctx = c; bag = new Bag(); T = 0; sent = false; sentT = -1e9; det = 0; fold = 0.2;
    root.innerHTML = `<canvas class="rz"></canvas><div class="shade"></div>
      <div class="warn"><i></i>TIMEFALL · 时间雨 ACTIVE</div>
      <div class="txt">
        <div class="k">SECTOR 01<span class="ln"></span>KNOT 01 · UNCHARTED</div>
        <div class="big">RESERVED</div>
        <div class="zh">未开拓区域 · 预留板块</div>
        <p>该板块为后续功能预留。数据通道与接口已就位，但开罗尔网络尚未覆盖此区域，<em>时间雨</em>仍在持续。提交接入申请后，网络扩展时将优先连接本节点。</p>
        <div class="st">
          <div><span class="l">SIGNAL</span><span class="v sig">0.0 dB</span></div>
          <div><span class="l">SCANNER</span><span class="v det">IDLE</span></div>
          <div><span class="l">COVERAGE</span><span class="v">0 %</span></div>
          <div><span class="l">SLOTS</span><span class="v">0 / 4</span></div>
          <div><span class="l">ETA</span><span class="v">TBD</span></div>
          <div><span class="l">STATUS</span><span class="v o">SEALED</span></div>
        </div>
        <div class="acts"><div class="btn req">+ 接入申请 <span>REQUEST ACCESS</span></div><div class="btn ghost back">← 返回网络图</div></div>
      </div>
      <div class="read"><div class="n">0.00</div><div>CHIRAL DENSITY</div><div>LAT <b>35.7012 N</b> · LON <b>139.9201 E</b></div></div>`;
    const q = (s) => root.querySelector(s);
    Object.assign(els, { det: q('.det'), sig: q('.sig'), big: q('.big'), zh: q('.zh'), req: q('.req'), txt: q('.txt'), n: q('.read .n') });
    cv = fitCanvas(q('canvas.rz'), 1.5);
    bag.on(window, 'resize', () => { cv = fitCanvas(q('canvas.rz'), 1.5); });
    bag.on(els.req, 'click', () => {
      if (sent) { ctx.toast('申请已在队列中 · 当前排位 <b style="color:#ff8a3c">#03</b>'); ctx.sfx.play('deny', { vol: 0.5 }); return; }
      sent = true; sentT = T;
      els.req.classList.add('sent'); els.req.innerHTML = '✓ 已提交 <span>REQUEST QUEUED</span>';
      ctx.sfx.play('confirm');
      ctx.toast('接入申请已记录 · 开罗尔网络扩展时将优先接入 KNOT 01');
    });
    bag.on(q('.back'), 'click', (e) => { ctx.sfx.play('back'); ctx.navigate('#/', { x: e.clientX, y: e.clientY }); });
    [els.req, q('.back')].forEach((b) => bag.on(b, 'pointerenter', () => ctx.sfx.play('hover')));
  },

  update(t, dt) {
    if (!cv) return;
    T += dt;
    draw(dt);
    els.big.textContent = decode('RESERVED', seg(T, 100, 900), 3);
    els.zh.textContent = decode('未开拓区域 · 预留板块', seg(T, 300, 1100), 5);
    els.txt.style.opacity = seg(T, 0, 500);
    els.n.textContent = (det * 0.37).toFixed(2);
    els.txt.style.transform = innerWidth <= 1100 ? 'none' : `translateY(-46%) translateX(${det > 0.6 && hash(Math.floor(T / 60)) > 0.9 ? (hash(T) - 0.5) * 8 : 0}px)`;
  },

  unmount() { bag?.dispose(); cv = null; },
};
