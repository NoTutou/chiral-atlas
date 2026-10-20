/* =========================================================
   infinite isometric CD-rack renderer (archive sector)
   - lattice cell (c, i): column c (shelf = c mod 6), slot i (record = i mod 16)
   - camera: ground point (cam.x, cam.z) sits at screen anchor; zoom scales the projection
   - wave: per-cell spring toward a gaussian bump under the cursor + neighbour coupling
   - perf: faces are trimmed to the part not hidden by the nearer neighbour (kills overdraw),
           physics state only exists for cells that are moving, adaptive DPR
   ========================================================= */
import { clamp, lerp, seg, ease, mod, hash, damp } from '../core/util.js';
import { SHELVES } from '../data/archive.js';
import { createGL, STRIDE } from './archive-gl.js';

export const PITCH_X = 15, TX = 9, LZ = 210, HY = 175, PITCH_Z = 252;
const NSH = SHELVES.length, PER = SHELVES[0].records.length;
const YAW = (34 * Math.PI) / 180, PITCH = (38 * Math.PI) / 180;
const cp = Math.cos(YAW), sp = Math.sin(YAW), cq = Math.cos(PITCH), sq = Math.sin(PITCH);
const GAPV = ((PITCH_X - TX) * Math.tan(PITCH)) / sp + 1;          // side face visible through the slot gap
const GAPE = ((PITCH_Z - LZ) * Math.tan(PITCH)) / cp + 2;          // end face visible through the shelf gap
const KEY = (c, i) => c * 4194304 + i;

export const recordAt = (c, i) => SHELVES[mod(c, NSH)].records[mod(i, PER)];
export const shelfAt = (c) => SHELVES[mod(c, NSH)];

export function createRack(canvas) {
  let g = null, glr = null;          // 2D context (fallback) or WebGL2 renderer
  let W = 0, H = 0, dpr = 1, dprCap = Math.min(devicePixelRatio || 1, 1.5), base = 1;
  const cam = { x: 0, z: 0, zoom: 1, zoomT: 1, ax: 0, ay: 0, vx: 0, vz: 0 };
  let S = 1, CX = 0, CY = 0;
  const state = new Map();          // key -> {h, v}
  const ripples = [];
  let fly = null;                   // {fx,fz,tx,tz,t0,dur,zoomFrom,zoomTo}
  let introT0 = -1e9;
  let grads;
  const R = {
    cam, hover: null, exclude: null, filter: -1, hits: null, saved: null, dim: 0, frozen: false, energy: 0,
    get S() { return S; }, get W() { return W; }, get H() { return H; },
  };

  /* ---------- projection ---------- */
  const P = (x, y, z) => {
    const X = x - cam.x, Z = z - cam.z;
    const x1 = X * cp - Z * sp, z1 = X * sp + Z * cp;
    return [CX + S * x1, CY - S * (y * cq + z1 * sq)];
  };
  const ground = (sx, sy, y = 0) => {
    const x1 = (sx - CX) / S, z1 = (CY - sy) / (S * sq) - (y * cq) / sq;
    return [x1 * cp + z1 * sp + cam.x, -x1 * sp + z1 * cp + cam.z];
  };
  R.P = P; R.ground = ground;

  function mkGrads() {
    const a = g.createLinearGradient(0, 0, 0, HY);
    a.addColorStop(0, 'rgba(34,52,62,.97)'); a.addColorStop(0.35, 'rgba(15,25,32,.98)'); a.addColorStop(1, 'rgba(6,10,13,1)');
    const b = g.createLinearGradient(0, 0, 0, HY);
    b.addColorStop(0, 'rgba(52,86,104,.98)'); b.addColorStop(0.4, 'rgba(18,32,42,.98)'); b.addColorStop(1, 'rgba(6,10,13,1)');
    grads = [a, b];
  }
  R.resize = () => {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = dprCap;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const mobile = W <= 1100;
    base = mobile ? Math.max(0.52, Math.min(W / 760, H / 800)) : Math.min(W / 1600, H / 900) * 1.08;
    CX = W * (mobile ? 0.5 : 0.56); CY = H * (mobile ? 0.6 : 0.53);
    S = base * cam.zoom;
    if (glr) glr.resize(W, H, dpr); else mkGrads();
  };
  /** adaptive resolution: called by the page with the smoothed frame time */
  R.adapt = (frameMs) => {
    if (frameMs > 24 && dprCap > 1) { dprCap = 1; R.resize(); }
  };

  /* ---------- per-cell lift ---------- */
  const breath = (c, i, t) => 3.2 * Math.sin((t / 8000) * 6.283 + i * 0.33 + c * 1.1) + 2.2 * Math.sin((t / 13000) * 6.283 + i * 0.21 - c * 0.7);
  function rippleAt(x, z, t) {
    let v = 0;
    for (const rp of ripples) {
      const age = (t - rp.t0) / 1000;
      if (age < 0 || age > 3) continue;
      const d = Math.hypot((x - rp.x) / PITCH_X, ((z - rp.z) / PITCH_X) * 0.35);
      const front = age * 16;
      v += 34 * Math.cos((d - front) * 0.9) * Math.exp(-((d - front) ** 2) / 18) * Math.exp(-age * 1.3);
    }
    return v;
  }
  function introAt(sx, sy, t) {
    const d = (sx / Math.max(W, 1)) * 900 + (1 - sy / Math.max(H, 1)) * 350;
    return 1 - ease.out(seg(t - introT0 - d, 0, 800));
  }
  function liftAt(c, i, t) {
    const st = state.get(KEY(c, i));
    const x = i * PITCH_X, z = c * PITCH_Z;
    let l = (st ? st.h : 0) + breath(c, i, t) + (ripples.length ? rippleAt(x, z, t) : 0);
    if (R.hits && R.hits.has(recordAt(c, i).id)) l += 18 + 4 * Math.sin(t / 300 + i);
    return l;
  }
  R.liftAt = liftAt;

  /* ---------- visible lattice range ---------- */
  function range() {
    const m = LZ * S * 0.7;
    const pts = [[-m, -HY * S * cq - m], [W + m, -HY * S * cq - m], [-m, H + 160 * S * cq + m], [W + m, H + 160 * S * cq + m]].map(([x, y]) => ground(x, y));
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    return {
      c0: Math.floor(Math.min(...zs) / PITCH_Z) - 1, c1: Math.ceil(Math.max(...zs) / PITCH_Z) + 1,
      i0: Math.floor(Math.min(...xs) / PITCH_X) - 1, i1: Math.ceil(Math.max(...xs) / PITCH_X) + 1,
    };
  }
  const onScreen = (x, z) => {
    const [sx, sy] = P(x, 0, z);
    const m = LZ * S * 0.6;
    return sx > -m && sx < W + m && sy > -HY * S * cq - m && sy < H + 160 * S * cq + m;
  };

  /* ---------- update: camera + physics ---------- */
  R.update = (t, dt, M) => {
    // fly-to animation
    if (fly) {
      const p = ease.io(seg(t, fly.t0, fly.t0 + fly.dur));
      cam.x = lerp(fly.fx, fly.tx, p); cam.z = lerp(fly.fz, fly.tz, p);
      cam.zoomT = cam.zoom = lerp(fly.zoomFrom, fly.zoomTo, p);
      if (p >= 1) { const done = fly.done; fly = null; done && done(); }
    } else {
      // inertia
      cam.x += cam.vx * dt; cam.z += cam.vz * dt;
      cam.vx = damp(cam.vx, 0, 5, dt); cam.vz = damp(cam.vz, 0, 5, dt);
      // zoom toward the cursor anchor
      if (Math.abs(cam.zoomT - cam.zoom) > 1e-4) {
        const [gx, gz] = ground(cam.ax, cam.ay);
        cam.zoom = damp(cam.zoom, cam.zoomT, 12, dt);
        S = base * cam.zoom;
        const [hx, hz] = ground(cam.ax, cam.ay);
        cam.x += gx - hx; cam.z += gz - hz;
      }
    }
    S = base * cam.zoom;
    if (R.frozen) return;

    // physics (only cells that move or are near the cursor)
    const [mx, mz] = M.inside ? ground(M.x, M.y) : [1e9, 1e9];
    const { c0, c1, i0, i1 } = range();
    const hv = R.hover;
    const steps = Math.max(1, Math.round(dt / 8)), h = dt / 1000 / steps;
    let energy = 0;
    for (let s = 0; s < steps; s++) {
      for (let c = c0; c <= c1; c++) {
        const zc = c * PITCH_Z, dz = zc - mz;
        const inCol = Math.abs(dz) < LZ / 2 + 20 ? 1 : 0.22 * Math.exp((-dz * dz) / (2 * 260 * 260));
        for (let i = i0; i <= i1; i++) {
          const k = KEY(c, i);
          let st = state.get(k);
          const dx = i * PITCH_X - mx;
          let tg = inCol > 0.01 && Math.abs(dx) < 200 ? 92 * Math.exp((-dx * dx) / (2 * 40 * 40)) * inCol : 0;
          if (hv && hv.c === c && hv.i === i) tg += 46;
          if (R.exclude === k) tg = 0;
          const l = state.get(KEY(c, i - 1)), r = state.get(KEY(c, i + 1));
          if (!st) {
            if (tg < 0.05 && !l && !r) continue;
            st = { h: 0, v: 0 }; state.set(k, st);
          }
          const lh = l ? l.h : 0, rh = r ? r.h : 0;
          const acc = 80 * (tg - st.h) + 520 * (lh + rh - 2 * st.h) - 8 * st.v;
          st.v += acc * h; st.h += st.v * h;
          if (s === 0) energy += Math.abs(st.v);
          if (tg < 0.05 && Math.abs(st.h) < 0.05 && Math.abs(st.v) < 0.05 && (!l || Math.abs(lh) < 0.05) && (!r || Math.abs(rh) < 0.05)) state.delete(k);
        }
      }
    }
    // drop state that scrolled out of range
    if (state.size > 4000) for (const [k] of state) { const c = Math.round(k / 4194304), i = k - c * 4194304; if (c < c0 - 2 || c > c1 + 2 || i < i0 - 4 || i > i1 + 4) state.delete(k); }
    R.energy = energy;
    while (ripples.length && t - ripples[0].t0 > 3000) ripples.shift();
  };

  /* ---------- picking: last-drawn (front-most) visible face polygon under the cursor ---------- */
  const inQuad = (q, x, y) => {
    let sgn = 0;
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4];
      const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (cr !== 0) { const s = cr > 0 ? 1 : -1; if (sgn && s !== sgn) return false; sgn = s; }
    }
    return true;
  };
  R.pick = (mx, my, t) => {
    const [gx, gz] = ground(mx, my);
    const cg = Math.round(gz / PITCH_Z), ig = Math.round(gx / PITCH_X);
    let best = null;
    for (let c = cg + 2; c >= cg - 1; c--) {
      for (let i = ig + 12; i >= ig - 12; i--) {
        const k = KEY(c, i);
        if (k === R.exclude) continue;
        const x = i * PITCH_X, z = c * PITCH_Z;
        const lf = liftAt(c, i, t);
        const vis = clamp(lf - liftAt(c, i - 1, t) + GAPV, 0, HY);
        const visE = clamp(lf - liftAt(c - 1, i, t) + GAPE, 0, HY);
        const xL = x - TX / 2, xR = x + TX / 2, zN = z - LZ / 2, zF = z + LZ / 2;
        const top = [P(xL, lf, zN), P(xR, lf, zN), P(xR, lf, zF), P(xL, lf, zF)];
        const side = [P(xL, lf, zF), P(xL, lf, zN), P(xL, lf - vis, zN), P(xL, lf - vis, zF)];
        const end = [P(xL, lf, zN), P(xR, lf, zN), P(xR, lf - visE, zN), P(xL, lf - visE, zN)];
        if (inQuad(top, mx, my) || inQuad(side, mx, my) || inQuad(end, mx, my)) best = { c, i, x, z, rec: recordAt(c, i), lift: lf };
      }
    }
    return best; // loops run far->near, so the last hit is the front-most
  };

  /* ---------- drawing ---------- */
  function affine(O, U, V, lu, lv) {
    g.setTransform((dpr * (U[0] - O[0])) / lu, (dpr * (U[1] - O[1])) / lu, (dpr * (V[0] - O[0])) / lv, (dpr * (V[1] - O[1])) / lv, dpr * O[0], dpr * O[1]);
  }
  function quad(q) { g.beginPath(); g.moveTo(q[0][0], q[0][1]); g.lineTo(q[1][0], q[1][1]); g.lineTo(q[2][0], q[2][1]); g.lineTo(q[3][0], q[3][1]); g.closePath(); }

  /** face content in local units u∈[0,LZ] (screen-left→right), v∈[0,vis] (top→down) */
  function faceArt(gg, rec, sh, hot, fog, vis, lift, detail, gr) {
    gg.globalAlpha = fog;
    gg.fillStyle = hot > 0.02 ? gr[1] : gr[0];
    gg.fillRect(0, 0, LZ, vis);
    gg.lineWidth = 0.6;
    gg.strokeStyle = `rgba(170,220,240,${0.16 + hot * 0.5})`;
    gg.beginPath(); gg.moveTo(0, vis); gg.lineTo(0, 0); gg.lineTo(LZ, 0); gg.lineTo(LZ, vis); gg.stroke();
    gg.fillStyle = sh.col; gg.globalAlpha = fog * (0.55 + hot * 0.45);
    gg.fillRect(0, 0, LZ, 2.2);
    gg.globalAlpha = fog;
    if (!detail && (vis < 34 || S < 0.62)) return;
    gg.save(); gg.beginPath(); gg.rect(0, 0, LZ, vis); gg.clip();
    gg.globalAlpha = fog * (detail ? 1 : clamp(Math.max(hot, (lift - 18) / 30)));
    gg.fillStyle = 'rgba(233,241,244,.94)'; gg.fillRect(10, 12, 74, 27);
    gg.fillStyle = '#05080b'; gg.font = '600 4px "Barlow Condensed"'; gg.fillText('CHIRAL ATLAS · ARCHIVE', 14, 19);
    gg.font = '700 11.5px "Barlow Condensed"'; gg.fillText(rec.id, 14, 33);
    gg.fillStyle = sh.col; gg.fillRect(70, 15, 10, 3);
    gg.globalAlpha = fog;
    gg.strokeStyle = 'rgba(170,220,240,.10)'; gg.lineWidth = 0.7;
    gg.beginPath(); gg.arc(LZ * 0.5, HY * 0.55, 54, 0, 7); gg.stroke();
    gg.beginPath(); gg.arc(LZ * 0.5, HY * 0.55, 13, 0, 7); gg.stroke();
    gg.fillStyle = 'rgba(200,225,235,.55)'; gg.font = '5px "Share Tech Mono"';
    gg.fillText(`${sh.en} // ${rec.pages} PAGES`, 10, HY - 12);
    for (let k = 0; k < 22; k++) { const w = hash(k * 7.7 + rec.pages) > 0.5 ? 1.2 : 0.5; gg.fillRect(LZ - 46 + k * 1.7, HY - 18, w, 9); }
    gg.strokeStyle = 'rgba(170,220,240,.08)';
    gg.beginPath(); gg.moveTo(6, 46); gg.lineTo(LZ - 6, 46); gg.moveTo(6, HY - 26); gg.lineTo(LZ - 6, HY - 26); gg.stroke();
    gg.restore();
  }
  R.faceArt = faceArt;

  function drawCase(c, i, lf, lN, lF, hot, fog, rec, sh, flags) {
    const x = i * PITCH_X, z = c * PITCH_Z;
    const xL = x - TX / 2, xR = x + TX / 2, zN = z - LZ / 2, zF = z + LZ / 2;
    const vis = clamp(lf - lN + GAPV, 0, HY), visE = clamp(lf - lF + GAPE, 0, HY);
    // side face (-x): only the slice above the nearer neighbour
    if (vis > 0.5) {
      affine(P(xL, lf, zF), P(xL, lf, zN), P(xL, lf - HY, zF), LZ, HY);
      faceArt(g, rec, sh, hot, fog, vis, lf, false, grads);
      g.globalAlpha = 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // end face (-z): spine with hex badge
    const e = [P(xL, lf, zN), P(xR, lf, zN), P(xR, lf - visE, zN), P(xL, lf - visE, zN)];
    quad(e);
    g.fillStyle = `rgba(${22 + hot * 40 | 0},${34 + hot * 60 | 0},${42 + hot * 70 | 0},${fog})`; g.fill();
    g.strokeStyle = `rgba(170,220,240,${(0.12 + hot * 0.5) * fog})`; g.lineWidth = 0.6; g.stroke();
    if (S > 0.6) {
      const b = P(x, lf - 9, zN), r = 2.6 * S;
      g.fillStyle = sh.col; g.globalAlpha = fog * (0.5 + hot * 0.5);
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6; g.lineTo(b[0] + Math.cos(a) * r, b[1] + Math.sin(a) * r); } g.fill();
      g.globalAlpha = 1;
    }
    // top face
    const tp = [P(xL, lf, zN), P(xR, lf, zN), P(xR, lf, zF), P(xL, lf, zF)];
    quad(tp);
    g.fillStyle = `rgba(${40 + hot * 150 | 0},${60 + hot * 160 | 0},${72 + hot * 165 | 0},${(0.78 + hot * 0.2) * fog})`; g.fill();
    const hit = flags & 1, saved = flags & 2;
    if (lf > 4 || hot > 0.02 || hit) {
      const a = clamp(lf / 60) * 0.6 + hot * 0.6 + (hit ? 0.5 : 0);
      g.strokeStyle = hot > 0.5 ? `rgba(255,255,255,${a})` : hit ? `rgba(134,227,255,${Math.min(1, a)})` : `rgba(134,227,255,${a * fog})`;
      g.lineWidth = hot > 0.5 || hit ? 1.4 : 1;
      g.beginPath(); g.moveTo(tp[3][0], tp[3][1]); g.lineTo(tp[0][0], tp[0][1]); g.lineTo(tp[1][0], tp[1][1]); g.stroke();
    }
    if (saved && S > 0.55) {
      const q = P(x, lf, zN + 14);
      g.fillStyle = '#e3a23a'; g.globalAlpha = fog; g.fillRect(q[0] - 1.6, q[1] - 1.6, 3.2, 3.2); g.globalAlpha = 1;
    }
  }

  function groundLabel(c, i, t) {
    // floating index strip in the gap in front of column c, every PER slots
    const sh = shelfAt(c);
    const x = i * PITCH_X - PITCH_X / 2, zg = c * PITCH_Z - LZ / 2 - (PITCH_Z - LZ) / 2;
    const O = P(x, 0, zg), U = P(x + 1, 0, zg), V = P(x, 0, zg - 1);
    g.setTransform(dpr * (U[0] - O[0]), dpr * (U[1] - O[1]), dpr * (V[0] - O[0]), dpr * (V[1] - O[1]), dpr * O[0], dpr * O[1]);
    g.globalAlpha = 0.45 * (1 - R.dim);
    g.fillStyle = sh.col; g.fillRect(0, -3, 3, 6);
    g.font = '600 9px "Barlow Condensed"'; g.fillStyle = 'rgba(233,241,244,.85)';
    g.fillText(`SHELF ${sh.k}`, 7, 3.4);
    g.font = '7px "Share Tech Mono"'; g.fillStyle = 'rgba(160,190,200,.7)';
    g.fillText(`${sh.en} · ${sh.k}-001 — ${sh.k}-${String(PER).padStart(3, '0')}`, 52, 3);
    g.fillStyle = 'rgba(160,190,200,.35)';
    for (let k = 0; k < PER; k++) g.fillRect(k * PITCH_X + PITCH_X / 2 - 0.3, 6, 0.6, k % 4 ? 2 : 4);
    g.globalAlpha = 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* two passes: (1) resting cases batched into a few Path2D fills per fog bucket / shelf colour,
     (2) "active" cases (lifted above a farther neighbour, hovered, search hits, intro) drawn
         individually in painter order. Face trimming makes resting silhouettes non-overlapping,
         so the batch order does not matter. */
  const B = 10;
  let LG = new Float32Array(0), IPG = new Float32Array(0);
  /** lift (incl. intro offset) for every cell of the range + 1 margin; returns L(c,i) */
  function fillGrid(t, c0, c1, i0, i1) {
    const ni = i1 - i0 + 3, nc = c1 - c0 + 3;
    if (LG.length < ni * nc) { LG = new Float32Array(ni * nc * 2); IPG = new Float32Array(ni * nc * 2); }
    const intro = t - introT0 < 2600;
    for (let c = c0 - 1; c <= c1 + 1; c++) for (let i = i0 - 1; i <= i1 + 1; i++) {
      const idx = (c - c0 + 1) * ni + (i - i0 + 1);
      let ip = 0;
      if (intro) { const q = P(i * PITCH_X, 0, c * PITCH_Z); ip = introAt(q[0], q[1], t); }
      IPG[idx] = ip;
      LG[idx] = liftAt(c, i, t) - ip * 260;
    }
    return (c, i) => LG[(c - c0 + 1) * ni + (i - i0 + 1)];
  }
  R.draw = (t, hotOf) => {
    if (glr) { drawGL(t, hotOf); return; }      // GPU path is cheap: never freeze (buffer is not preserved)
    if (R.frozen) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const { c0, c1, i0, i1 } = range();
    const ni = i1 - i0 + 3;
    const L = fillGrid(t, c0, c1, i0, i1);
    const top = [], end = [], side = [], stripe = new Map(), badge = new Map(), sav = new Path2D();
    const bucket = (arr, b) => arr[b] || (arr[b] = new Path2D());
    const mbucket = (map, k) => { let p = map.get(k); if (!p) map.set(k, (p = new Path2D())); return p; };
    const addQ = (p, q) => { p.moveTo(q[0][0], q[0][1]); p.lineTo(q[1][0], q[1][1]); p.lineTo(q[2][0], q[2][1]); p.lineTo(q[3][0], q[3][1]); p.closePath(); };
    const actives = [];
    let drawn = 0;
    for (let c = c1; c >= c0; c--) {
      const shIdx = mod(c, NSH), sh = SHELVES[shIdx], fShelf = R.filter >= 0 && shIdx !== R.filter;
      for (let i = i1; i >= i0; i--) {
        const x = i * PITCH_X, z = c * PITCH_Z;
        const [sx, sy] = P(x, 0, z);
        const m = LZ * S * 0.6;
        if (sx < -m || sx > W + m || sy < -HY * S * cq - m || sy > H + 160 * S * cq + m) continue;
        const k = KEY(c, i);
        if (k === R.exclude) continue;
        const rec = recordAt(c, i);
        const ip = IPG[(c - c0 + 1) * ni + (i - i0 + 1)];
        let fog = clamp(0.32 + (0.75 * (sy + 120)) / (H + 120), 0.2, 1) * (1 - ip);
        if (fShelf) fog *= 0.32;
        fog *= 1 - R.dim * 0.55;
        if (fog <= 0.01) continue;
        drawn++;
        const lf = L(c, i), lN = L(c, i - 1), lF = L(c - 1, i);
        const hot = hotOf(c, i);
        const hit = R.hits && R.hits.has(rec.id);
        const flags = (hit ? 1 : 0) | (R.saved && R.saved.has(rec.id) ? 2 : 0);
        if (hot > 0.02 || hit || ip > 0.001 || lf > 12 || lf - L(c, i + 1) > 2 || lf - L(c + 1, i) > 2) {
          actives.push([c, i, lf, lN, lF, hot, fog, rec, sh, flags]);
          continue;
        }
        const b = Math.min(B - 1, Math.floor(fog * B));
        const xL = x - TX / 2, xR = x + TX / 2, zN = z - LZ / 2, zF = z + LZ / 2;
        const vis = clamp(lf - lN + GAPV, 0, HY), visE = clamp(lf - lF + GAPE, 0, HY);
        if (vis > 0.5) {
          addQ(bucket(side, b), [P(xL, lf, zF), P(xL, lf, zN), P(xL, lf - vis, zN), P(xL, lf - vis, zF)]);
          addQ(mbucket(stripe, shIdx * B + b), [P(xL, lf, zF), P(xL, lf, zN), P(xL, lf - 2.2, zN), P(xL, lf - 2.2, zF)]);
        }
        addQ(bucket(end, b), [P(xL, lf, zN), P(xR, lf, zN), P(xR, lf - visE, zN), P(xL, lf - visE, zN)]);
        addQ(bucket(top, b), [P(xL, lf, zN), P(xR, lf, zN), P(xR, lf, zF), P(xL, lf, zF)]);
        if (S > 0.6) { const q = P(x, lf - 9, zN), rr = 2.2 * S; const bp = mbucket(badge, shIdx * B + b); bp.moveTo(q[0], q[1] - rr); bp.lineTo(q[0] + rr, q[1]); bp.lineTo(q[0], q[1] + rr); bp.lineTo(q[0] - rr, q[1]); bp.closePath(); }
        if (flags & 2 && S > 0.55) { const q = P(x, lf, zN + 14); sav.rect(q[0] - 1.6, q[1] - 1.6, 3.2, 3.2); }
      }
    }
    // pass 1: batched fills
    g.lineWidth = 0.6;
    for (let b = 0; b < B; b++) {
      const f = (b + 0.5) / B;
      if (side[b]) { g.fillStyle = `rgba(30,47,57,${0.97 * f})`; g.fill(side[b]); }
      if (end[b]) { g.fillStyle = `rgba(22,34,42,${f})`; g.fill(end[b]); g.strokeStyle = `rgba(170,220,240,${0.12 * f})`; g.stroke(end[b]); }
      if (top[b]) { g.fillStyle = `rgba(40,60,72,${0.78 * f})`; g.fill(top[b]); }
    }
    for (const [key, p] of stripe) { const sh = SHELVES[Math.floor(key / B)], f = ((key % B) + 0.5) / B; g.globalAlpha = 0.55 * f; g.fillStyle = sh.col; g.fill(p); }
    for (const [key, p] of badge) { const sh = SHELVES[Math.floor(key / B)], f = ((key % B) + 0.5) / B; g.globalAlpha = 0.5 * f; g.fillStyle = sh.col; g.fill(p); }
    g.globalAlpha = 1; g.fillStyle = '#e3a23a'; g.fill(sav);
    // index strips float in the shelf gaps
    if (S > 0.7) for (let c = c1; c >= c0; c--) for (let i = Math.floor(i0 / PER) * PER; i <= i1; i += PER) groundLabel(c, i, t);
    // pass 2: active cases in painter order (loop above already ran far -> near)
    for (const a of actives) drawCase(...a);
    R.drawn = drawn;
    R.actives = actives.length;
  };

  /* ---------- WebGL path ---------- */
  function buildAtlas() {
    const cw = 288, ch = 240, pad = 4, cols = 12;
    const recs = SHELVES.flatMap((s) => s.records);
    const c = document.createElement('canvas');
    c.width = cols * cw; c.height = Math.ceil(recs.length / cols) * ch;
    const a = c.getContext('2d');
    const ga = a.createLinearGradient(0, 0, 0, HY);
    ga.addColorStop(0, 'rgba(34,52,62,1)'); ga.addColorStop(0.35, 'rgba(15,25,32,1)'); ga.addColorStop(1, 'rgba(6,10,13,1)');
    recs.forEach((rec, n) => {
      rec._ai = n;
      const ox = (n % cols) * cw, oy = Math.floor(n / cols) * ch;
      a.setTransform(1, 0, 0, 1, 0, 0);
      a.fillStyle = '#0d171d'; a.fillRect(ox, oy, cw, ch);
      a.setTransform((cw - 2 * pad) / LZ, 0, 0, (ch - 2 * pad) / HY, ox + pad, oy + pad);
      faceArt(a, rec, SHELVES.find((s) => s.k === rec.shelf), 0, 1, HY, 200, true, [ga, ga]);
      a.globalAlpha = 1;
    });
    return { canvas: c, cols, cw, ch, pad };
  }
  function buildLabels() {
    const k = 4, w = PER * PITCH_X * k, h = 14 * k;
    const c = document.createElement('canvas');
    c.width = w; c.height = h * NSH;
    const a = c.getContext('2d');
    SHELVES.forEach((sh, n) => {
      a.setTransform(k, 0, 0, k, 0, n * h + 7 * k);
      a.fillStyle = sh.col; a.fillRect(0, -3, 3, 6);
      a.font = '600 9px "Barlow Condensed"'; a.fillStyle = 'rgba(233,241,244,.9)';
      a.fillText(`SHELF ${sh.k}`, 7, 3.4);
      a.font = '7px "Share Tech Mono"'; a.fillStyle = 'rgba(160,190,200,.8)';
      a.fillText(`${sh.en} · ${sh.k}-001 — ${sh.k}-${String(PER).padStart(3, '0')}`, 52, 3);
      a.fillStyle = 'rgba(160,190,200,.45)';
      for (let q = 0; q < PER; q++) a.fillRect(q * PITCH_X + PITCH_X / 2 - 0.3, 5, 0.6, q % 4 ? 1.5 : 2);
    });
    return c;
  }
  let INST = new Float32Array(STRIDE * 4096), LAB = new Float32Array(4 * 512);
  function drawGL(t, hotOf) {
    const { c0, c1, i0, i1 } = range();
    const ni = i1 - i0 + 3;
    const L = fillGrid(t, c0, c1, i0, i1);
    let n = 0, ln = 0;
    const m = LZ * S * 0.6;
    for (let c = c1; c >= c0; c--) {
      const shIdx = mod(c, NSH), fShelf = R.filter >= 0 && shIdx !== R.filter;
      for (let i = i1; i >= i0; i--) {
        const x = i * PITCH_X, z = c * PITCH_Z;
        const [sx, sy] = P(x, 0, z);
        if (sx < -m || sx > W + m || sy < -HY * S * cq - m || sy > H + 160 * S * cq + m) continue;
        if (KEY(c, i) === R.exclude) continue;
        const ip = IPG[(c - c0 + 1) * ni + (i - i0 + 1)];
        const fm = (1 - ip) * (fShelf ? 0.32 : 1);
        if (fm <= 0.01) continue;
        const rec = recordAt(c, i);
        const lf = L(c, i);
        if ((n + 1) * STRIDE > INST.length) { const nb = new Float32Array(INST.length * 2); nb.set(INST); INST = nb; }
        const o = n * STRIDE;
        INST[o] = x - cam.x; INST[o + 1] = lf; INST[o + 2] = z - cam.z;
        INST[o + 3] = shIdx; INST[o + 4] = hotOf(c, i);
        INST[o + 5] = (R.hits && R.hits.has(rec.id) ? 1 : 0) | (R.saved && R.saved.has(rec.id) ? 2 : 0);
        INST[o + 6] = rec._ai;
        INST[o + 7] = fm; INST[o + 8] = clamp(lf - L(c, i - 1) + GAPV, 0, HY); INST[o + 9] = clamp(lf - L(c - 1, i) + GAPE, 0, HY);
        n++;
      }
      if (S > 0.6) for (let i = Math.floor(i0 / PER) * PER; i <= i1 && ln < 512; i += PER) {
        const o = ln * 4;
        LAB[o] = i * PITCH_X - PITCH_X / 2 - cam.x; LAB[o + 1] = c * PITCH_Z - LZ / 2 - (PITCH_Z - LZ) / 2 - cam.z;
        LAB[o + 2] = shIdx; LAB[o + 3] = 0.5 * (1 - R.dim) * (fShelf ? 0.35 : 1);
        ln++;
      }
    }
    glr.render(INST, n, LAB, ln, { CX, CY, S, cp, sp, cq, sq, dim: R.dim });
    R.drawn = n;
  }

  /* ---------- camera helpers ---------- */
  R.intro = (t) => { introT0 = t; };
  R.ripple = (x, z, t) => ripples.push({ x, z, t0: t });
  R.pan = (dxs, dys) => {
    // move the camera so the ground follows the pointer
    const [ax, az] = ground(0, 0), [bx, bz] = ground(dxs, dys);
    cam.x -= bx - ax; cam.z -= bz - az;
  };
  R.zoomBy = (f, ax, ay) => { cam.zoomT = clamp(cam.zoomT * f, 0.55, 2.2); cam.ax = ax; cam.ay = ay; fly = null; };
  /** nearest lattice cell to the camera holding record id */
  R.cellOf = (id) => {
    const k = SHELVES.findIndex((s) => s.k === id[0]);
    const j = SHELVES[k].records.findIndex((r) => r.id === id);
    if (k < 0 || j < 0) return null;
    const cc = Math.round(cam.z / PITCH_Z), ic = Math.round(cam.x / PITCH_X);
    const c = cc + mod(k - cc + 3, NSH) - 3, i = ic + mod(j - ic + 8, PER) - 8;
    return { c, i, x: i * PITCH_X, z: c * PITCH_Z, rec: SHELVES[k].records[j] };
  };
  /** fly so the cell lands at screen point (sx, sy) (defaults to the anchor) */
  R.flyTo = (cell, t, { dur = 800, zoom = cam.zoom, done } = {}) => {
    // camera target: ground point of cell should project to the anchor
    fly = { fx: cam.x, fz: cam.z, tx: cell.x, tz: cell.z, t0: t, dur, zoomFrom: cam.zoom, zoomTo: zoom, done };
    cam.vx = cam.vz = 0;
  };
  R.flying = () => !!fly;
  R.KEY = KEY;
  if (!new URLSearchParams(location.search).has('2d')) {
    try { glr = createGL(canvas, { TX, LZ, HY, PITCH_X, PER }, buildAtlas(), buildLabels(), SHELVES.map((s) => s.col)); } catch (e) { console.warn(e); glr = null; }
  }
  if (glr) dprCap = Math.min(devicePixelRatio || 1, 2);
  else g = canvas.getContext('2d');
  R.mode = glr ? 'webgl2' : 'canvas2d';
  R.resize();
  return R;
}

/* ---------- detail-mode disc (focus canvas) ---------- */
export function drawDisc(g, cx, cy, r, spin, a, label) {
  g.save(); g.globalAlpha = a; g.translate(cx, cy);
  g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(6, 10, r, 0, 7); g.fill();
  const rg = g.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
  rg.addColorStop(0, '#0e1a21'); rg.addColorStop(1, '#16252e'); g.fillStyle = rg;
  g.beginPath(); g.arc(0, 0, r, 0, 7); g.arc(0, 0, r * 0.11, 0, 7, true); g.fill('evenodd');
  g.rotate(spin);
  const cg = g.createConicGradient(0, 0, 0);
  [['rgba(134,227,255,.26)', 0], ['rgba(43,181,238,.12)', 0.14], ['rgba(227,162,58,.26)', 0.3], ['rgba(255,255,255,.10)', 0.46],
    ['rgba(134,227,255,.24)', 0.62], ['rgba(227,162,58,.14)', 0.8], ['rgba(134,227,255,.26)', 1]].forEach(([c, s]) => cg.addColorStop(s, c));
  g.fillStyle = cg; g.beginPath(); g.arc(0, 0, r, 0, 7); g.arc(0, 0, r * 0.36, 0, 7, true); g.fill('evenodd');
  for (let k = 0; k < 34; k++) {
    g.strokeStyle = `rgba(200,235,245,${0.035 + (k % 6 === 0 ? 0.08 : 0)})`; g.lineWidth = 0.8;
    g.beginPath(); g.arc(0, 0, r * (0.38 + k * 0.0178), 0, 7); g.stroke();
  }
  g.strokeStyle = 'rgba(134,227,255,.85)'; g.lineWidth = r * 0.07;
  g.beginPath(); g.arc(0, 0, r * 0.71, -0.5, 0.25); g.stroke();
  g.fillStyle = 'rgba(233,241,244,.75)'; g.font = `${r * 0.055}px "Share Tech Mono"`;
  for (let k = 0; k < label.length; k++) {
    g.save(); g.rotate((k / label.length) * Math.PI * 2); g.translate(0, -r * 0.29); g.fillText(label[k], 0, 0); g.restore();
  }
  g.strokeStyle = 'rgba(233,241,244,.8)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
  g.strokeStyle = '#e3a23a'; g.lineWidth = r * 0.05; g.beginPath(); g.arc(0, 0, r * 0.2, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(233,241,244,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, r * 0.14, 0, 7); g.stroke();
  for (let k = 0; k < 6; k++) { g.rotate(Math.PI / 3); g.fillStyle = 'rgba(233,241,244,.7)'; g.fillRect(-0.8, r * 0.235, 1.6, r * 0.04); }
  g.restore();
}
