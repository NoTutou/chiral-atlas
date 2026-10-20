/* =========================================================
   HUB · chiral network map
   Three sectors are three facilities on the map, each in its own form:
     02 ARCHIVE    holographic mini CD-rack (waves under the cursor, real records)
     03 INFERENCE  living reasoning network (cargo → 7 hex nodes → score ring)
     01 RESERVED   uncharted timefall zone with an Odradek-like scanner over a sealed hatch
   Everything lives in a 1600×800 stage scaled to the viewport (between HUD and footer).
   ========================================================= */
import './hub.css';
import { clamp, lerp, seg, ease, damp, hash, decode, typeText, pad, hexPath, Bag, esc } from '../core/util.js';
import { SHELVES, RECORDS, TOTAL } from '../data/archive.js';
import { drawOdradek, drawHatch } from './reserved.js';

const SW = 1600, SH = 800;
const DPR = () => Math.min(devicePixelRatio || 1, 1.5);

let ctx, root, bag, stage, S = 1, OX = 0, OY = 0, T = 0, mobile = false;
let netC, rackC, graphC, scanC, staticLayer;
let facs, hov = 0, hp = [0, 0, 0, 0], entering = null, lastGlitch = 0;
const els = {};

/* ---------- facility geometry (stage px) ---------- */
const F2 = { x: 40, y: 118 }, F3 = { x: 990, y: 40 }, F1 = { x: 1034, y: 500 };
const RACK_OFF = { x: F2.x + 40, y: F2.y + 32 };          // rack canvas origin in stage
const GRAPH_OFF = { x: F3.x - 10, y: F3.y + 58 };
const SCAN_OFF = { x: F1.x + 200, y: F1.y - 8 };
const BOUNDS = {                                           // lock-on reticle boxes
  2: { x: 150, y: 218, w: 700, h: 470 },
  3: { x: 978, y: 30, w: 594, h: 400 },
  1: { x: 1022, y: 494, w: 554, h: 296 },
};
const ANCHOR = { 2: [672, 372], 3: [1020, 216], 1: [1262, 600], you: [770, 104] };
const DIST = { 1: '3.82', 2: '1.24', 3: '2.07' };
const ROUTE = { 1: '#/reserved', 2: '#/archive', 3: '#/inference' };

/* =========================================================
   02 · mini rack
   ========================================================= */
const RK = (() => {
  const yaw = 34 * Math.PI / 180, pitch = 38 * Math.PI / 180;
  return { cp: Math.cos(yaw), sp: Math.sin(yaw), cq: Math.cos(pitch), sq: Math.sin(pitch), s: 0.76, cx: 410, cy: 272,
    PX: 15, TX: 9, GX: 40, LZ: 186, PZ: 232, HY: 58 };
})();
const rp = (x, y, z) => { const x1 = x * RK.cp - z * RK.sp, z1 = x * RK.sp + z * RK.cp; return [RK.cx + RK.s * x1, RK.cy - RK.s * (y * RK.cq + z1 * RK.sq)]; };
const rground = (sx, sy) => { const x1 = (sx - RK.cx) / RK.s, z1 = (RK.cy - sy) / (RK.s * RK.sq); return [x1 * RK.cp + z1 * RK.sp, -x1 * RK.sp + z1 * RK.cp]; };
const XOFF = (31 * RK.PX + RK.GX) / 2;
const cases = [];
for (let r = 0; r < 3; r++) for (let j = 0; j < 32; j++) {
  const sh = j >= 16 ? 1 : 0, k = r * 2 + sh, i = j % 16;
  cases.push({ r, j, k, i, rec: SHELVES[k].records[i], col: SHELVES[k].col,
    x: j * RK.PX + sh * RK.GX - XOFF, z: (r - 1) * RK.PZ, h: 0, v: 0, hot: 0 });
}
const caseAt = (r, j) => cases[r * 32 + j];
let rkHover = null, rkHoverSince = 0, grads = null;

function affine(g, O, U, V, lu, lv, sc) {
  const d = sc;
  g.setTransform(d * (U[0] - O[0]) / lu, d * (U[1] - O[1]) / lu, d * (V[0] - O[0]) / lv, d * (V[1] - O[1]) / lv, d * O[0], d * O[1]);
}
function poly(g, p) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) g.lineTo(p[k][0], p[k][1]); g.closePath(); }

function drawCase(g, cs, lift, a, sc) {
  const { TX, LZ, HY } = RK, hot = cs.hot;
  const xL = cs.x - TX / 2, xR = cs.x + TX / 2, zN = cs.z - LZ / 2, zF = cs.z + LZ / 2, yT = lift, yB = lift - HY;
  // side face (-x) in local units u∈[0,LZ] v∈[0,HY]
  affine(g, rp(xL, yT, zF), rp(xL, yT, zN), rp(xL, yB, zF), LZ, HY, sc);
  g.globalAlpha = a;
  g.fillStyle = hot > 0.05 ? grads[1] : grads[0]; g.fillRect(0, 0, LZ, HY);
  g.lineWidth = 0.7; g.strokeStyle = `rgba(150,215,240,${0.18 + hot * 0.55})`; g.strokeRect(0, 0, LZ, HY);
  g.fillStyle = cs.col; g.globalAlpha = a * (0.55 + hot * 0.45); g.fillRect(0, 0, LZ, 2.4);
  const pl = Math.max(hot, clamp((lift - 14) / 22));
  if (pl > 0.02) {
    g.globalAlpha = a * pl;
    g.fillStyle = 'rgba(233,241,244,.95)'; g.fillRect(8, 9, 62, 21);
    g.fillStyle = '#05080b'; g.font = '600 4.4px "Barlow Condensed"'; g.fillText('CHIRAL ATLAS', 12, 15.5);
    g.font = '700 10px "Barlow Condensed"'; g.fillText(cs.rec.id, 12, 26.5);
    g.fillStyle = cs.col; g.fillRect(58, 12, 8, 3);
    g.fillStyle = 'rgba(200,225,235,.55)'; g.font = '5px "Share Tech Mono"';
    g.fillText(`${SHELVES[cs.k].en} // ${cs.rec.pages}P`, 8, HY - 9);
  }
  g.globalAlpha = 1;
  g.setTransform(sc, 0, 0, sc, 0, 0);
  // end face (-z)
  const e = [rp(xL, yT, zN), rp(xR, yT, zN), rp(xR, yB, zN), rp(xL, yB, zN)];
  poly(g, e); g.fillStyle = `rgba(${20 + hot * 50},${34 + hot * 70},${44 + hot * 80},${0.9 * a})`; g.fill();
  g.strokeStyle = `rgba(150,215,240,${(0.14 + hot * 0.5) * a})`; g.lineWidth = 0.6; g.stroke();
  const b = rp(cs.x, yT - 7, zN);
  g.fillStyle = cs.col; g.globalAlpha = a * (0.55 + hot * 0.45);
  g.beginPath(); for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3 + Math.PI / 6; g.lineTo(b[0] + Math.cos(an) * 1.9, b[1] + Math.sin(an) * 1.9); } g.fill();
  g.globalAlpha = 1;
  // top face
  const tp = [rp(xL, yT, zN), rp(xR, yT, zN), rp(xR, yT, zF), rp(xL, yT, zF)];
  poly(g, tp); g.fillStyle = `rgba(${44 + hot * 150},${66 + hot * 160},${80 + hot * 160},${(0.8 + hot * 0.2) * a})`; g.fill();
  if (lift > 3 || hot > 0.05) {
    const al = clamp(lift / 40) * 0.6 + hot * 0.6;
    g.strokeStyle = hot > 0.5 ? `rgba(255,255,255,${al})` : `rgba(134,227,255,${al * a})`;
    g.lineWidth = hot > 0.5 ? 1.3 : 0.9;
    g.beginPath(); g.moveTo(tp[3][0], tp[3][1]); g.lineTo(tp[0][0], tp[0][1]); g.lineTo(tp[1][0], tp[1][1]); g.stroke();
  }
}

function updateRack(dt) {
  const { g, w, h, sc } = rackC;
  // pointer → rack-local
  const m = ctx.mouse, rect = mobile ? els.rack.getBoundingClientRect() : null;
  const sx = mobile ? (m.x - rect.left) * 820 / rect.width : (m.x - OX) / S - RACK_OFF.x;
  const sy = mobile ? (m.y - rect.top) * 560 / rect.height : (m.y - OY) / S - RACK_OFF.y;
  const inside = hov === 2 && m.inside && !entering && !mobile;
  // pick the case under the cursor (test against each lifted top surface)
  let best = 1e9, hv = null;
  if (inside) {
    for (const cs of cases) {
      const [gx, gz] = rground(sx, sy + cs.h * RK.s * RK.cq);
      if (Math.abs(gz - cs.z) > RK.PZ / 2) continue;
      let d = Math.abs(gx - cs.x);
      if (cs === rkHover) d -= RK.PX * 0.45;
      if (d < RK.PX * 0.9 && d < best) { best = d; hv = cs; }          // forgiving: shelf gaps snap to the nearest case
    }
  }
  if (entering && entering.cs) hv = entering.cs;
  if (hv !== rkHover) {
    rkHover = hv; rkHoverSince = T;
    if (hv) ctx.sfx.play('lift', { pitch: 0.85 + hv.i / 40, vol: 0.7 });
    els.rows.forEach((el, k) => el.classList.toggle('on', !!hv && hv.k === k));
  }
  // spring + neighbour coupling, wave follows the cursor along the row
  const [mx, mz] = inside ? rground(sx, sy) : [1e5, 1e5];
  const steps = Math.max(1, Math.round(dt / 8)), hs = dt / 1000 / steps;
  for (let s = 0; s < steps; s++) {
    for (const cs of cases) {
      const dx = cs.x - mx, dz = cs.z - mz;
      const inRow = Math.abs(dz) < RK.LZ / 2 + 20 ? 1 : 0.25 * Math.exp(-dz * dz / (2 * 200 * 200));
      let tg = 46 * Math.exp(-dx * dx / (2 * 30 * 30)) * inRow;
      if (cs === rkHover) tg += 26;
      if (entering && entering.cs === cs) tg = 70;
      const l = cs.j > 0 ? caseAt(cs.r, cs.j - 1).h : cs.h, r = cs.j < 31 ? caseAt(cs.r, cs.j + 1).h : cs.h;
      cs.v += (80 * (tg - cs.h) + 520 * (l + r - 2 * cs.h) - 8 * cs.v) * hs;
      cs.h += cs.v * hs;
    }
  }
  for (const cs of cases) cs.hot = damp(cs.hot, cs === rkHover ? 1 : 0, 14, dt);

  // ---- draw ----
  g.setTransform(sc, 0, 0, sc, 0, 0);
  g.clearRect(0, 0, w, h);
  const fa = els.fa[2];
  // projector pad on the floor
  const FY = -RK.HY - 34, X0 = -XOFF - 40, X1 = XOFF + 40, Z0 = -1.5 * RK.PZ - 10, Z1 = 1.5 * RK.PZ + 10;
  affine(g, rp(X0, FY, Z1), rp(X1, FY, Z1), rp(X0, FY, Z0), X1 - X0, Z1 - Z0, sc);   // u along x, v toward near side
  const pg = g.createRadialGradient((X1 - X0) / 2, (Z1 - Z0) / 2, 0, (X1 - X0) / 2, (Z1 - Z0) / 2, 520);
  pg.addColorStop(0, 'rgba(43,181,238,.16)'); pg.addColorStop(1, 'rgba(43,181,238,0)');
  g.fillStyle = pg; g.fillRect(-200, -200, X1 - X0 + 400, Z1 - Z0 + 400);
  g.strokeStyle = 'rgba(134,227,255,.10)'; g.lineWidth = 1;
  g.beginPath();
  for (let u = 0; u <= X1 - X0; u += 60) { g.moveTo(u, 0); g.lineTo(u, Z1 - Z0); }
  for (let v = 0; v <= Z1 - Z0; v += 60) { g.moveTo(0, v); g.lineTo(X1 - X0, v); }
  g.stroke();
  g.strokeStyle = 'rgba(134,227,255,.35)'; g.lineWidth = 1.5; g.strokeRect(0, 0, X1 - X0, Z1 - Z0);
  g.setTransform(sc, 0, 0, sc, 0, 0);
  // projection beams from pad corners to rack corners
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
    const a = rp(x, FY, z), b = rp(x * 0.92, 0, z * 0.92);
    const lg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
    lg.addColorStop(0, 'rgba(134,227,255,.35)'); lg.addColorStop(1, 'rgba(134,227,255,0)');
    g.strokeStyle = lg; g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // cases: far row first, then larger x first
  const flick = hash(Math.floor(T / 90)) > 0.97 ? 0.75 : 1;
  for (let r = 2; r >= 0; r--) {
    for (let j = 31; j >= 0; j--) {
      const cs = caseAt(r, j);
      const d0 = r * 140 + (31 - j) * 16;
      const ip = 1 - ease.out(seg(T, 250 + d0, 950 + d0));
      let lift = cs.h + 2.4 * Math.sin(T / 8000 * 6.283 + j * 0.33 + r * 1.1) + 1.6 * Math.sin(T / 13000 * 6.283 + j * 0.21 - r * 0.7) - ip * 130;
      const a = (1 - ip) * flick * (0.62 + 0.38 * fa);
      if (a <= 0.01) continue;
      drawCase(g, cs, lift, a, sc);
    }
    // shelf labels floating in the gap in front of the row
    const zl = (r - 1) * RK.PZ - RK.LZ / 2 - 26;
    for (let s2 = 0; s2 < 2; s2++) {
      const sh = SHELVES[r * 2 + s2], x0 = s2 * (16 * RK.PX + RK.GX) - XOFF - 4;
      const O = rp(x0, 0, zl), U = rp(x0 + 100, 0, zl), V = rp(x0, 0, zl - 100);
      affine(g, O, U, V, 100, 100, sc);
      g.globalAlpha = seg(T, 900, 1500) * (0.55 + 0.45 * fa);
      g.fillStyle = sh.col; g.fillRect(0, -2, 3.5, 13);
      g.font = '600 13px "Barlow Condensed"'; g.fillStyle = 'rgba(233,241,244,.85)'; g.fillText(`${sh.k} · ${sh.en}`, 8, 9);
      g.font = '9px "Share Tech Mono"'; g.fillStyle = 'rgba(160,190,200,.75)'; g.fillText(`${pad(sh.records.length, 3)} REC`, 8, 22);
      g.globalAlpha = 1;
    }
    g.setTransform(sc, 0, 0, sc, 0, 0);
  }
  // hologram scan band + scanlines over drawn pixels only
  g.globalCompositeOperation = 'source-atop';
  const by = ((T / 4200) % 1) * (h + 160) - 80;
  const bgd = g.createLinearGradient(0, by - 60, 0, by + 6);
  bgd.addColorStop(0, 'rgba(134,227,255,0)'); bgd.addColorStop(1, 'rgba(134,227,255,.16)');
  g.fillStyle = bgd; g.fillRect(0, by - 60, w, 66);
  g.fillStyle = 'rgba(0,0,0,.16)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  g.globalCompositeOperation = 'source-over';

  // tooltip
  const tip = els.tip;
  if (rkHover) {
    const p = ease.out(seg(T - rkHoverSince, 0, 220));
    const a = rp(rkHover.x, rkHover.h + 6, rkHover.z + RK.LZ / 2);
    const tx = 40 + a[0] + 34, ty = 32 + a[1] - 104;
    tip.style.opacity = p; tip.style.transform = `translate(${tx}px,${ty + (1 - p) * 8}px)`;
    const dp = seg(T - rkHoverSince, 60, 520);
    els.tipA.innerHTML = `<span style="color:${rkHover.col}">${decode(rkHover.rec.id, dp, rkHover.i)}</span><span style="color:var(--dim)">${SHELVES[rkHover.k].en}</span>`;
    els.tipB.textContent = decode(rkHover.rec.title, dp, rkHover.i + 3);
    els.tipC.innerHTML = `<span>${rkHover.rec.pages} PAGES · ${rkHover.rec.updated.slice(5, 10)}</span><b>▶ CLICK 读取</b>`;
  } else tip.style.opacity = damp(+tip.style.opacity || 0, 0, 18, dt);
}

/* =========================================================
   03 · reasoning network
   ========================================================= */
const GN = [[128, 118, 'PARSE'], [196, 64, 'EXTRACT'], [196, 172, 'MAP'], [266, 118, 'HYPOTH.'], [336, 64, 'VERIFY'], [336, 172, 'IMPACT'], [404, 118, 'SCORE']];
const GE = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]];
const CARGO = [['DOC', 70], ['SRC', 118], ['PATCH', 166]];
const RING = [466, 118];
const CYCLE = 8200, STEP = 620, IN = 900;
const LOGS = [
  ['01 PARSE', '解析 4 件货物 · 18,432 tokens'],
  ['02 EXTRACT', '抽取实体 MAVLink / sysid / heartbeat'],
  ['03 MAP', '定位 handle_cmd() → exec_motor() · L214'],
  ['04 HYPOTH.', '生成 3 条风险假设 H1 / H2 / H3'],
  ['05 VERIFY', 'H1 · H2 成立，H3 被否证'],
  ['06 IMPACT', '影响 3 模块 · 1 子系统 · 2 外部接口'],
  ['07 SCORE', '综合评分 72 / 100 · RISK HIGH'],
];
let tau = 0, lastStep = -2;
const bz = (a, b) => { const dx = (b[0] - a[0]) * 0.5; return [a, [a[0] + dx, a[1]], [b[0] - dx, b[1]], b]; };
const bp = (P, t) => { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; };
const bline = (g, P) => { g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.bezierCurveTo(P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]); g.stroke(); };

function updateGraph(dt) {
  const { g, w, h, sc } = graphC;
  const hot = hp[3];
  tau += dt * (1 + hot * 1.6);
  const c = tau % CYCLE;
  const k = c < IN ? -1 : Math.min(7, Math.floor((c - IN) / STEP));        // 7 = all done
  const fade = 1 - seg(c, CYCLE - 400, CYCLE);
  if (k !== lastStep) {
    if (k >= 0 && k < 7 && hov === 3) ctx.sfx.play('node', { pitch: 0.9 + k * 0.06, vol: 0.55 });
    if (k === 7 && hov === 3) ctx.sfx.play('ding', { vol: 0.4 });
    lastStep = k;
  }
  const st = (i) => (k < 0 || i > k ? 0 : i < k || k === 7 ? 2 : 1);
  g.setTransform(sc, 0, 0, sc, 0, 0);
  g.clearRect(0, 0, w, h);
  const fa = els.fa[3];
  g.globalAlpha = fade * (0.55 + 0.45 * fa);
  // cargo boxes + inflow strands
  CARGO.forEach(([lb, y], i) => {
    const P = bz([62, y], [GN[0][0] - 16, GN[0][1]]);
    g.strokeStyle = 'rgba(227,162,58,.45)'; g.lineWidth = 1; bline(g, P);
    for (let j = 0; j < 2; j++) {
      const q = ((tau / (1400 - hot * 500)) + j / 2 + i * 0.3) % 1;
      const [x, yy] = bp(P, q);
      g.fillStyle = '#ffd27e'; g.beginPath(); g.arc(x, yy, 1.8, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(9,17,23,.9)'; g.fillRect(16, y - 10, 46, 20);
    g.strokeStyle = 'rgba(233,241,244,.5)'; g.lineWidth = 1; g.strokeRect(16.5, y - 9.5, 45, 19);
    g.fillStyle = i === 2 ? '#e3a23a' : '#86e3ff'; g.fillRect(16, y - 10, 3, 20);
    g.fillStyle = 'rgba(233,241,244,.9)'; g.font = '10px "Share Tech Mono"'; g.fillText(lb, 24, y + 3.5);
  });
  // edges
  GE.forEach(([a, b], ei) => {
    const A = GN[a], B = GN[b];
    const P = bz([A[0] + 15, A[1]], [B[0] - 15, B[1]]);
    const lit = st(a) === 2;
    if (lit) {
      g.strokeStyle = 'rgba(227,162,58,.22)'; g.lineWidth = 4; bline(g, P);
      g.strokeStyle = 'rgba(255,210,126,.85)'; g.lineWidth = 1; bline(g, P);
      for (let j = 0; j < 2; j++) {
        const q = ((tau / (900 - hot * 300)) + j / 2 + ei * 0.137) % 1, [x, y] = bp(P, q);
        g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(x, y, 1.7, 0, 7); g.fill();
      }
    } else {
      g.setLineDash([3, 4]); g.strokeStyle = 'rgba(233,241,244,.18)'; g.lineWidth = 1; bline(g, P); g.setLineDash([]);
    }
  });
  // score link
  {
    const P = bz([GN[6][0] + 15, GN[6][1]], [RING[0] - 26, RING[1]]);
    g.strokeStyle = k === 7 ? 'rgba(134,227,255,.8)' : 'rgba(233,241,244,.15)'; g.lineWidth = 1; bline(g, P);
  }
  // nodes
  GN.forEach(([x, y, lb], i) => {
    const s = st(i);
    if (s === 1) {
      const pu = ((tau - IN - i * STEP) % 700) / 700;
      g.strokeStyle = `rgba(43,181,238,${(1 - pu) * 0.7})`; g.lineWidth = 1; hexPath(g, x, y, 15 + pu * 16); g.stroke();
      g.save(); g.translate(x, y); g.rotate(tau / 600); g.setLineDash([4, 5]); g.strokeStyle = 'rgba(134,227,255,.9)';
      g.beginPath(); g.arc(0, 0, 21, 0, 7); g.stroke(); g.restore(); g.setLineDash([]);
    }
    hexPath(g, x, y, 13);
    g.fillStyle = s === 2 ? '#e9f1f4' : s === 1 ? 'rgba(43,181,238,.35)' : 'rgba(5,9,12,.92)'; g.fill();
    g.strokeStyle = s === 0 ? 'rgba(233,241,244,.3)' : s === 1 ? '#86e3ff' : '#e9f1f4'; g.lineWidth = 1.2; g.stroke();
    if (s === 2) { g.strokeStyle = '#05080b'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x - 1.5, y + 3.5); g.lineTo(x + 5, y - 3.5); g.stroke(); }
    g.font = '9.5px "Share Tech Mono"'; g.textAlign = 'center';
    g.fillStyle = s === 1 ? '#86e3ff' : s === 2 ? 'rgba(233,241,244,.85)' : 'rgba(160,180,190,.5)';
    g.fillText(lb, x, y + (i === 1 || i === 4 ? -22 : 30));
    g.textAlign = 'left';
  });
  // score ring
  const sp = ease.out(seg(c, IN + 7 * STEP, IN + 7 * STEP + 900));
  const [rx, ry] = RING;
  g.strokeStyle = 'rgba(233,241,244,.12)'; g.lineWidth = 4; g.beginPath(); g.arc(rx, ry, 24, 0, 7); g.stroke();
  g.strokeStyle = '#2bb5ee'; g.shadowColor = '#2bb5ee'; g.shadowBlur = 8 * sp;
  g.beginPath(); g.arc(rx, ry, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.72 * sp); g.stroke(); g.shadowBlur = 0;
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.fillStyle = 'rgba(233,241,244,.35)'; g.fillRect(rx + Math.cos(a) * 31 - 0.5, ry + Math.sin(a) * 31 - 0.5, 1, 1); }
  g.fillStyle = '#e9f1f4'; g.font = '300 20px "Barlow Condensed"'; g.textAlign = 'center';
  g.fillText(String(Math.round(72 * sp)).padStart(2, '0'), rx, ry + 7); g.textAlign = 'left';
  g.globalAlpha = 1;

  // DOM info
  const v = sp > 0 && sp < 1 ? Math.round(72 * sp) : 72;
  if (els.scV._v !== v) { els.scV._v = v; els.scV.innerHTML = `${pad(v)}<small>/100</small>`; }
  els.dims.forEach((d, i) => { const q = seg(c, IN + 7 * STEP + i * 120, IN + 7 * STEP + 700 + i * 120); d.style.width = (d._w * (q > 0 && q < 1 ? ease.out(q) : 1) * Math.min(1, seg(T, 600, 1400) * 2)) + '%'; });
  const li = k < 0 ? -1 : Math.min(6, k);
  if (li >= 0) {
    const lp = seg(c, IN + li * STEP, IN + li * STEP + 480);
    const ts = `00:${pad(Math.floor((IN + li * STEP) / 1000))}.${pad(Math.floor((IN + li * STEP) % 1000 / 10))}`;
    els.log.innerHTML = `<span class="ts">${ts}</span><span class="st">${LOGS[li][0]}</span><span>${esc(typeText(LOGS[li][1], lp))}</span>${lp < 1 || hash(Math.floor(T / 400)) > 0.5 ? '<span class="cur"></span>' : ''}`;
  } else els.log.innerHTML = `<span class="ts">00:00.00</span><span class="st">CARGO</span><span>${esc(typeText('接收货物 · design_spec.pdf / flight_ctrl.c / commit_diff.patch', seg(c, 0, 800)))}</span>`;
  els.log.style.opacity = fade;
}

/* =========================================================
   01 · uncharted zone + scanner
   ========================================================= */
const RAIN = Array.from({ length: 90 }, (_, i) => ({ x: hash(i * 3.1) * 420 - 40, y: hash(i * 7.7) * 300, l: 10 + hash(i * 1.3) * 18, v: 0.22 + hash(i * 5.9) * 0.25 }));
const FOG = Array.from({ length: 6 }, (_, i) => ({ x: 60 + hash(i * 4.4) * 220, y: 70 + hash(i * 2.2) * 170, r: 80 + hash(i * 8.8) * 70, ph: i * 1.7 }));
let odRot = 0, odFold = 0.3, odDetect = 0;

function updateScan(dt) {
  const { g, w, h, sc } = scanC;
  const hv = hp[1];
  odDetect = damp(odDetect, hov === 1 ? 1 : 0, 6, dt);
  odFold = damp(odFold, hov === 1 ? 1 : 0.28 + 0.14 * Math.sin(T / 1700), 5, dt);
  odRot += dt / 1000 * (0.35 + odDetect * 3.4);
  g.setTransform(sc, 0, 0, sc, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  const fa = els.fa[1];
  // fog
  for (const f of FOG) {
    const x = f.x + Math.sin(T / 5200 + f.ph) * 26, y = f.y + Math.cos(T / 6100 + f.ph) * 14;
    const gr = g.createRadialGradient(x, y, 0, x, y, f.r);
    gr.addColorStop(0, `rgba(${120 + odDetect * 80},${110 - odDetect * 40},${100 - odDetect * 50},.10)`); gr.addColorStop(1, 'rgba(60,60,60,0)');
    g.fillStyle = gr; g.fillRect(x - f.r, y - f.r, f.r * 2, f.r * 2);
  }
  // timefall
  g.strokeStyle = 'rgba(200,215,225,.17)'; g.lineWidth = 1;
  g.beginPath();
  for (const d of RAIN) {
    const y = (d.y + T * d.v) % (h + 40) - 20, x = d.x + ((T * d.v * 0.25) % 400) - 40 * 0;
    const xx = ((x - y * 0.22) % (w + 60) + w + 60) % (w + 60) - 30;
    g.moveTo(xx, y); g.lineTo(xx - d.l * 0.22, y + d.l);
  }
  g.stroke();
  // sealed hatch (iso ellipse)
  const hx = 170, hy = 238;
  drawHatch(g, hx, hy, 1, odDetect * (0.5 + 0.5 * Math.sin(T / 120)));
  g.font = '9px "Share Tech Mono"'; g.textAlign = 'center'; g.fillStyle = 'rgba(160,180,190,.6)'; g.fillText('SEALED · 封存', hx, hy + 48); g.textAlign = 'left';
  // tether from hatch to scanner
  const ox = 170, oy = 112;
  g.strokeStyle = 'rgba(233,241,244,.25)'; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(hx, hy - 10); g.lineTo(ox, oy + 12); g.stroke(); g.setLineDash([]);
  // scan pings
  const per = lerp(2400, 700, odDetect);
  for (let j = 0; j < 3; j++) {
    const p = ((T / per) + j / 3) % 1;
    g.strokeStyle = odDetect > 0.3 ? `rgba(255,138,60,${(1 - p) * 0.55})` : `rgba(200,230,240,${(1 - p) * 0.3})`;
    g.lineWidth = 1; g.beginPath(); g.arc(ox, oy, 14 + p * 120, 0, 7); g.stroke();
  }
  drawOdradek(g, ox, oy, 1, odFold, odRot, odDetect, T);
  // static noise
  const n = 10 + Math.round(odDetect * 46);
  for (let i = 0; i < n; i++) {
    const r = hash(i * 9.1 + Math.floor(T / 70) * 1.37);
    g.fillStyle = odDetect > 0.3 && r > 0.6 ? `rgba(255,90,60,${0.1 + r * 0.2})` : `rgba(220,230,235,${0.04 + r * 0.12})`;
    g.fillRect(hash(i * 3.3 + Math.floor(T / 70)) * w, r * h, 2 + hash(i * 1.9 + T % 7) * 34, 1 + (r > 0.8 ? 2 : 0));
  }
  // soft circular mask
  g.globalCompositeOperation = 'destination-in';
  const mk = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 170);
  mk.addColorStop(0, `rgba(0,0,0,${0.62 + 0.38 * fa})`); mk.addColorStop(0.75, `rgba(0,0,0,${0.5 + 0.3 * fa})`); mk.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mk; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';

  // DOM: signal bars flicker, deny message
  els.sig.forEach((b, i) => { const on = odDetect > 0.3 && hash(Math.floor(T / 90) + i) > 0.7; b.style.background = on ? 'var(--red)' : 'rgba(255,255,255,.1)'; });
  els.unkBig.textContent = hov === 1 ? decode('SIGNAL LOST', seg(T - (els.f1Since || 0), 0, 500), Math.floor(T / 80)) : 'UNCHARTED';
  els.unkBig.style.color = hov === 1 ? 'var(--red)' : '';
  if (hov === 1 && T - lastGlitch > 1300) { lastGlitch = T; ctx.sfx.play('glitch', { vol: 0.5 }); }
  els.f1.style.transform = hov === 1 && hash(Math.floor(T / 60)) > 0.92 ? `translate(${(hash(T) - 0.5) * 6}px,0)` : '';
}

/* =========================================================
   map overlay: frame, minor knots, links, packets, lock-on
   ========================================================= */
const MINOR = [[905, 470, 'RELAY 04'], [1480, 452, 'DISTRO · EAST'], [880, 640, 'RELAY 07'], [560, 52, 'WEATHER STN'], [70, 330, 'PORT KNOT'], [1540, 760, 'SOUTH KNOT']];
function buildStatic() {
  const c = document.createElement('canvas'), sc = S * DPR();
  c.width = SW * sc; c.height = SH * sc;
  const g = c.getContext('2d'); g.setTransform(sc, 0, 0, sc, 0, 0);
  // corner frame + edge rulers
  g.strokeStyle = 'rgba(233,241,244,.35)'; g.lineWidth = 1;
  const bk = (x, y, sx, sy) => { g.beginPath(); g.moveTo(x + sx * 18, y); g.lineTo(x, y); g.lineTo(x, y + sy * 18); g.stroke(); };
  bk(12, 10, 1, 1); bk(SW - 12, 10, -1, 1); bk(12, SH - 8, 1, -1); bk(SW - 12, SH - 8, -1, -1);
  g.fillStyle = 'rgba(160,190,200,.35)';
  for (let x = 40; x < SW - 30; x += 20) g.fillRect(x, SH - 10, 1, x % 100 === 0 ? 6 : 3);
  for (let y = 40; y < SH - 30; y += 20) g.fillRect(SW - 14, y, y % 100 === 0 ? 6 : 3, 1);
  g.font = '9px "Share Tech Mono"'; g.fillStyle = 'rgba(160,190,200,.4)';
  for (let x = 100; x < SW - 60; x += 200) g.fillText(`E139.${pad(Math.round(x / 16), 2)}`, x + 4, SH - 14);
  for (let y = 100; y < SH - 40; y += 200) g.fillText(`N35.${pad(Math.round(y / 9), 2)}`, SW - 70, y - 4);
  // faint unlinked network between minor knots
  g.setLineDash([2, 6]); g.strokeStyle = 'rgba(160,190,200,.14)';
  [[0, 2], [2, 1], [3, 0], [4, 3], [1, 5]].forEach(([a, b]) => { g.beginPath(); g.moveTo(MINOR[a][0], MINOR[a][1]); g.lineTo(MINOR[b][0], MINOR[b][1]); g.stroke(); });
  g.setLineDash([]);
  MINOR.forEach(([x, y, n]) => {
    hexPath(g, x, y, 5); g.strokeStyle = 'rgba(160,190,200,.45)'; g.stroke();
    g.fillStyle = 'rgba(160,190,200,.45)'; g.fillText(n, x + 10, y + 3);
  });
  return c;
}

function strandPath(a, b, bend) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = -(b[1] - a[1]), ny = b[0] - a[0], L = Math.hypot(nx, ny);
  return [a, [lerp(a[0], mx, 0.6) + nx / L * bend, lerp(a[1], my, 0.6) + ny / L * bend], [lerp(b[0], mx, 0.6) + nx / L * bend * 0.4, lerp(b[1], my, 0.6) + ny / L * bend * 0.4], b];
}
function updateNet() {
  const { g, sc } = netC;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, netC.c.width, netC.c.height);
  g.globalAlpha = seg(T, 0, 700);
  g.drawImage(staticLayer, 0, 0);
  g.globalAlpha = 1;
  g.setTransform(sc, 0, 0, sc, 0, 0);
  const draw = seg(T, 300, 1400);
  // 02 ↔ 03 : chiral double strand
  {
    const P = strandPath(ANCHOR[2], ANCHOR[3], -60);
    const lit = 0.55 + 0.45 * Math.max(hp[2], hp[3]);
    for (const [ph, wd, al] of [[0, 1, 0.9], [Math.PI, 0.8, 0.6]]) {
      g.beginPath();
      const N = 80;
      for (let i = 0; i <= N * draw; i++) {
        const u = i / N, [x, y] = bp(P, u), [x2, y2] = bp(P, Math.min(1, u + 0.01));
        const tx = x2 - x, ty = y2 - y, l = Math.hypot(tx, ty) || 1;
        const off = Math.sin(u * Math.PI * 7 + T * 0.0016 + ph) * 5 * Math.sin(u * Math.PI);
        const px = x - ty / l * off, py = y + tx / l * off;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.strokeStyle = `rgba(227,162,58,${0.16 * lit})`; g.lineWidth = 4 * wd; g.stroke();
      g.strokeStyle = `rgba(255,210,126,${al * lit})`; g.lineWidth = wd; g.stroke();
    }
    if (draw >= 1) for (let j = 0; j < 4; j++) {
      const fw = j < 3, q = ((T / 2600) + j / 3) % 1, [x, y] = bp(P, fw ? q : 1 - q);
      g.fillStyle = fw ? '#ffe2a8' : '#86e3ff'; g.shadowColor = g.fillStyle; g.shadowBlur = 6;
      g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); g.shadowBlur = 0;
    }
    const [mx, my] = bp(P, 0.42);
    g.font = '9.5px "Share Tech Mono"'; g.fillStyle = `rgba(255,210,126,${0.7 * draw})`; g.fillText('CHIRAL LINK · 1.83 km · 96 REC/s', mx - 60, my + 26);
  }
  // links to the uncharted zone: dashed, broken in the middle
  for (const [a, b, lab] of [[[812, 600], [1030, 546], true], [[1190, 462], [1060, 512], false]]) {
    const red = hp[1];
    const P = strandPath(a, b, 30);
    g.setLineDash([3, 6]);
    g.strokeStyle = red > 0.05 ? `rgba(255,90,60,${0.25 + red * 0.5 * (hash(Math.floor(T / 80)) > 0.3 ? 1 : 0.3)})` : 'rgba(160,190,200,.3)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 40 * draw; i++) { const u = i / 40; if (u > 0.44 && u < 0.56) { const [x, y] = bp(P, u); g.moveTo(x, y); continue; } const [x, y] = bp(P, u); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.setLineDash([]);
    if (draw >= 1) {
      const [x, y] = bp(P, 0.5);
      g.strokeStyle = 'rgba(255,90,60,.8)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke();
      if (lab) { g.font = '9px "Share Tech Mono"'; g.fillStyle = 'rgba(255,90,60,.7)'; g.fillText('NO LINK', x + 9, y + 3); }
    }
  }
  // operator marker
  {
    const [x, y] = ANCHOR.you, p = (T / 1800) % 1;
    g.strokeStyle = `rgba(134,227,255,${(1 - p) * 0.7})`; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 6 + p * 22, 0, 7); g.stroke();
    g.fillStyle = '#86e3ff'; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y + 5); g.lineTo(x - 6, y + 5); g.closePath(); g.fill();
    // bearing lines to the hovered facility
    if (hov) {
      const [ax, ay] = ANCHOR[hov];
      g.setLineDash([1, 4]); g.strokeStyle = `rgba(134,227,255,${0.5 * hp[hov]})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(lerp(x, ax, hp[hov]), lerp(y, ay, hp[hov])); g.stroke(); g.setLineDash([]);
    }
  }
  // lock-on reticles
  for (const k of [1, 2, 3]) {
    let p = hp[k];
    const en = entering && entering.k === k ? ease.out(seg(T - entering.t, 0, 380)) : 0;
    if (p < 0.01 && !en) continue;
    const B = BOUNDS[k], inf = (1 - ease.out(p)) * 36 - en * 10;
    const x0 = B.x - inf, y0 = B.y - inf, x1 = B.x + B.w + inf, y1 = B.y + B.h + inf;
    const red = k === 1;
    g.strokeStyle = red ? `rgba(255,90,60,${p})` : `rgba(233,241,244,${p})`; g.lineWidth = 1.4;
    const L = 22;
    const bk = (x, y, sx, sy) => { g.beginPath(); g.moveTo(x + sx * L, y); g.lineTo(x, y); g.lineTo(x, y + sy * L); g.stroke(); };
    bk(x0, y0, 1, 1); bk(x1, y0, -1, 1); bk(x0, y1, 1, -1); bk(x1, y1, -1, -1);
    g.fillStyle = red ? `rgba(255,90,60,${p * 0.8})` : `rgba(233,241,244,${p * 0.8})`;
    g.fillRect(x0 - 10, (y0 + y1) / 2, 6, 1); g.fillRect(x1 + 4, (y0 + y1) / 2, 6, 1);
    g.fillRect((x0 + x1) / 2, y0 - 10, 1, 6); g.fillRect((x0 + x1) / 2, y1 + 4, 1, 6);
    g.font = '10px "Share Tech Mono"';
    g.fillText(decode(`LOCK ▸ KNOT ${pad(k)} · DIST ${DIST[k]} km`, p, k), x0 + 2, y0 - 8);
    if (en) { g.fillStyle = `rgba(233,241,244,${(1 - en) * 0.12})`; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
  }
}

/* =========================================================
   page
   ========================================================= */
function layout() {
  mobile = innerWidth <= 1100;
  const W = innerWidth, H = innerHeight - 64 - 38;
  S = Math.min(W / SW, H / SH);
  OX = (W - SW * S) / 2; OY = 64 + (H - SH * S) / 2;
  stage.style.transform = mobile ? 'none' : `translate(${OX}px,${OY}px) scale(${S})`;
  const fit = (c, w, h) => { const sc = (mobile ? c.getBoundingClientRect().width / w : S) * DPR(); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc)); return { c, g: c.getContext('2d'), w, h, sc }; };
  netC = fit(els.net, SW, SH); rackC = fit(els.rack, 820, 560); graphC = fit(els.graph, 500, 236); scanC = fit(els.scan, 340, 300);
  grads = [0, 1].map((hot) => {
    const gr = rackC.g.createLinearGradient(0, 0, 0, RK.HY);
    gr.addColorStop(0, hot ? 'rgba(52,86,104,.95)' : 'rgba(30,48,58,.92)'); gr.addColorStop(0.45, hot ? 'rgba(18,32,42,.95)' : 'rgba(13,22,29,.94)'); gr.addColorStop(1, 'rgba(6,10,13,.96)');
    return gr;
  });
  staticLayer = buildStatic();
}

function enter(k, hashPath, sx, sy, cs) {
  if (entering) return;
  const rect = mobile ? facs[k].getBoundingClientRect() : null;
  entering = { k, t: T, hash: hashPath, x: mobile ? rect.left + rect.width / 2 : OX + sx * S, y: mobile ? clamp(rect.top + rect.height / 2, 70, innerHeight - 70) : OY + sy * S, cs };
  ctx.sfx.play('confirm');
  if (k === 1) ctx.sfx.play('deny', { vol: 0.6 });
}

const recent = RECORDS.slice().sort((a, b) => (a.updated < b.updated ? 1 : -1)).slice(0, 8);

export default {
  hints: [[['●', '进入板块'], ['1·2·3', '快速进入', 'sq'], ['Q', '/ E 切换', 'sq'], ['M', '音效', 'sq']],
    ['CHIRAL NETWORK · 3 KNOTS', 'OPERATOR <b>GUEST-0417</b>', `RECORDS <b>${TOTAL}</b>`]],

  mount(r, c) {
    root = r; ctx = c; bag = new Bag(); T = 0; hov = 0; hp = [0, 0, 0, 0]; entering = null; tau = 0; lastStep = -2;
    rkHover = null; cases.forEach((x) => { x.h = 0; x.v = 0; x.hot = 0; });
    const pagesBy = SHELVES.map((s) => s.records.reduce((a, x) => a + x.pages, 0));
    const maxP = Math.max(...pagesBy);
    root.innerHTML = `<div class="stage">
      <canvas class="net"></canvas>
      <div class="hd"><div class="t">CHIRAL<b> NETWORK</b></div>
        <div class="s">板块网络图<span class="ln"></span><span class="m">3 KNOTS · <b class="gr">2 ONLINE</b> · <b class="rd">1 UNCHARTED</b></span></div></div>

      <div class="fac f2" data-k="2">
        <canvas class="rack"></canvas>
        <div class="lab"><div class="hx">02</div><div><div class="k">KNOT 02 · DISTRIBUTION ARCHIVE</div>
          <div class="n">ARCHIVE<span class="st"><i></i>ONLINE</span></div><div class="z">知识档案库 · CD 存储空间</div></div></div>
        <div class="enter">ENTER ▶ <span class="zh">进入档案库</span></div>
        <div class="idx"><div class="h"><span>SHELF INDEX / 货架</span><span><b>${TOTAL}</b> REC</span></div>
          ${SHELVES.map((s, k) => `<div class="row" data-shelf="${k}"><span class="c" style="background:${s.col}"></span><span class="l">${s.k}</span>
            <span>${s.zh}<span class="en">${s.en}</span></span><span class="pb"><i style="width:${(pagesBy[k] / maxP * 100).toFixed(0)}%;background:${s.col}"></i></span></div>`).join('')}</div>
        <div class="recent"><div class="h">RECENT <b>▸ NEW</b><span class="ln"></span><span>最近更新</span></div>
          <div class="it"><div class="ln2"><span class="id"></span><span class="nm"></span><span class="dt"></span></div></div></div>
        <div class="tip"><div class="a"></div><div class="b"></div><div class="c"></div></div>
      </div>

      <div class="fac f3" data-k="3">
        <div class="lab"><div class="hx">03</div><div><div class="k">KNOT 03 · INFERENCE LAB</div>
          <div class="n">INFERENCE<span class="st"><i></i>ONLINE</span></div><div class="z">信息推理与评估 · 7 步推理链</div></div></div>
        <div class="enter">ENTER ▶ <span class="zh">进入推演</span></div>
        <canvas class="graph"></canvas>
        <div class="ev"><div class="sc"><div class="l">LAST EVALUATION</div><div class="v">00<small>/100</small></div>
          <div class="chips"><span class="chip on">GRADE B</span><span class="chip r">RISK HIGH</span></div></div>
          <div class="dims">${[['安全性', 41, 'var(--red)'], ['准确性', 84, 'var(--blue)'], ['性能', 88, 'var(--ink)']].map(([n, v, c2]) =>
            `<div class="dim"><span>${n}</span><span class="bar"><i style="background:${c2};width:0" data-w="${v}"></i></span><span class="v">${v}</span></div>`).join('')}</div></div>
        <div class="log1"></div>
      </div>

      <div class="fac f1" data-k="1">
        <canvas class="scan"></canvas>
        <div class="lab"><div class="hx">01</div><div><div class="k">KNOT 01 · RESERVED</div>
          <div class="n">RESERVED<span class="st"><i></i>OFFLINE</span></div><div class="z">预留板块</div></div></div>
        <div class="unk"><div class="big">UNCHARTED</div><div class="zh">未开拓区域 · 待接入</div>
          <div class="sig">${[5, 8, 11, 14, 17].map((hh) => `<i style="height:${hh}px"></i>`).join('')}</div>
          <div class="rd">SIGNAL <b>0.0 dB</b><br>ETA <b>TBD</b><br>STATUS <b class="o">SEALED</b></div></div>
        <div class="enter deny">ACCESS DENIED <span class="zh">权限未开放</span></div>
      </div>

      <div class="you">▲ <b>PORTER · GUEST-0417</b><br>YOU ARE HERE · 当前位置</div>
    </div>`;
    const q = (s) => root.querySelector(s);
    stage = q('.stage');
    Object.assign(els, {
      net: q('.net'), rack: q('.rack'), graph: q('.graph'), scan: q('.scan'),
      tip: q('.tip'), tipA: q('.tip .a'), tipB: q('.tip .b'), tipC: q('.tip .c'),
      rows: [...root.querySelectorAll('.row')], rec: q('.recent .ln2'),
      scV: q('.ev .sc .v'), dims: [...root.querySelectorAll('.dim .bar i')], log: q('.log1'),
      sig: [...root.querySelectorAll('.unk .sig i')], unkBig: q('.unk .big'), f1: q('.f1'),
      hdT: q('.hd .t'), fa: [0, 1, 1, 1],
    });
    els.dims.forEach((d) => { d._w = +d.dataset.w; });
    facs = { 1: q('.f1'), 2: q('.f2'), 3: q('.f3') };
    els.enter = { 1: q('.f1 .enter'), 2: q('.f2 .enter'), 3: q('.f3 .enter') };
    layout();
    bag.on(window, 'resize', layout);

    // hover / click per facility
    for (const k of [1, 2, 3]) {
      const el = facs[k];
      el.setAttribute('role', 'link'); el.tabIndex = 0;
      el.setAttribute('aria-label', { 1: '进入预留板块', 2: '进入知识档案库', 3: '进入推理评估' }[k]);
      bag.on(el, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); enter(k, ROUTE[k], 0, 0); } });
      bag.on(el, 'pointerenter', () => {
        if (entering) return;
        hov = k; ctx.sfx.play('hover');
        if (k === 3) ctx.sfx.play('scan', { vol: 0.7 });
        if (k === 1) { els.f1Since = T; ctx.sfx.play('deny', { vol: 0.5 }); lastGlitch = T; }
      });
      bag.on(el, 'pointerleave', () => { if (hov === k) hov = 0; });
      bag.on(el, 'click', (e) => {
        const sx = (e.clientX - OX) / S, sy = (e.clientY - OY) / S;
        if (k === 2 && rkHover && !mobile) {
          const a = rp(rkHover.x, rkHover.h, rkHover.z);
          enter(2, '#/archive/' + encodeURIComponent(rkHover.rec.id), RACK_OFF.x + a[0], RACK_OFF.y + a[1], rkHover);
        } else enter(k, ROUTE[k], sx, sy);
      });
    }
    // shelf rows: highlight their cases
    els.rows.forEach((row) => {
      bag.on(row, 'pointerenter', () => { const k = +row.dataset.shelf; row.classList.add('on'); ctx.sfx.play('tick'); cases.forEach((cs) => { if (cs.k === k) cs.v += 60 + (cs.i % 4) * 8; }); });
      bag.on(row, 'pointerleave', () => row.classList.remove('on'));
    });
  },

  update(t, dt) {
    if (!stage) return;
    T += dt;
    for (const k of [1, 2, 3]) hp[k] = damp(hp[k], hov === k || (entering && entering.k === k) ? 1 : 0, 10, dt);
    // intro + dimming of the non-hovered facilities
    const intro = { 2: ease.out(seg(T, 150, 800)), 3: ease.out(seg(T, 350, 1000)), 1: ease.out(seg(T, 550, 1200)) };
    for (const k of [1, 2, 3]) {
      const dim = !mobile && hov && hov !== k ? 0.42 : 1;
      els.fa[k] = damp(els.fa[k], dim, 8, dt);
      facs[k].style.opacity = (intro[k] * (0.35 + 0.65 * els.fa[k])).toFixed(3);
      if (k !== 1 || hov !== 1) facs[k].style.transform = `translateY(${(1 - intro[k]) * 14}px)`;
      const ep = mobile ? 1 : hp[k];
      els.enter[k].style.opacity = ep.toFixed(3);
      els.enter[k].style.clipPath = `polygon(0 0,${ep * 100}% 0,${ep * 100}% 100%,12px 100%,0 calc(100% - 12px))`;
    }
    els.hdT.innerHTML = decode('CHIRAL', seg(T, 0, 500), 1) + '<b>' + decode(' NETWORK', seg(T, 150, 750), 2) + '</b>';
    // recent ticker
    const ri = Math.floor(T / 2800) % recent.length, rph = T % 2800, rr = recent[ri];
    const dp = seg(rph, 0, 650);
    els.rec.querySelector('.id').textContent = decode(rr.id, dp, ri);
    els.rec.querySelector('.nm').textContent = decode(rr.title, dp, ri + 5);
    els.rec.querySelector('.dt').textContent = rr.updated.slice(0, 10);
    els.rec.style.opacity = (seg(rph, 0, 200) * (1 - seg(rph, 2550, 2800))).toFixed(3);
    els.rec.style.transform = `translateY(${(1 - ease.out(seg(rph, 0, 400))) * 10 - seg(rph, 2550, 2800) * 10}px)`;

    updateRack(dt);
    updateGraph(dt);
    updateScan(dt);
    if (!mobile) updateNet();

    if (entering && T - entering.t > 430) {
      const e = entering; entering = { ...e, t: Infinity };   // keep the lock until the wipe covers
      ctx.navigate(e.hash, { x: e.x, y: e.y });
    }
  },

  onKey(e) {
    const m = { 1: 1, 2: 2, 3: 3 }[e.key];
    if (m) { const B = BOUNDS[m]; enter(m, ROUTE[m], B.x + B.w / 2, B.y + B.h / 2); return true; }
    if (e.key === 'Enter' && hov) { const B = BOUNDS[hov]; enter(hov, ROUTE[hov], B.x + B.w / 2, B.y + B.h / 2); return true; }
    return false;
  },

  unmount() { bag?.dispose(); stage = null; hov = 0; entering = null; },
};
