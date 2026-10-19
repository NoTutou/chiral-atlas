/* hex-grid wipe between pages. cover(origin) -> Promise (screen fully covered), reveal() -> Promise */
import { clamp, ease, fitCanvas } from './util.js';
import { clock } from './clock.js';

export function createWipe(canvas) {
  let cv = fitCanvas(canvas, 1);
  addEventListener('resize', () => { cv = fitCanvas(canvas, 1); });
  let anim = null; // {mode, t0, dur, ox, oy, resolve}
  let covered = false;
  const R = 30, HX = R * Math.sqrt(3), HY = R * 1.5;

  clock.add((t) => {
    if (!anim && !covered) return;
    const { g, w, h } = cv;
    g.clearRect(0, 0, w, h);
    if (!anim) { g.fillStyle = '#04070a'; g.fillRect(0, 0, w, h); return; }
    const p = clamp((t - anim.t0) / anim.dur);
    const maxD = Math.hypot(Math.max(anim.ox, w - anim.ox), Math.max(anim.oy, h - anim.oy)) + R * 2;
    for (let row = -1, y = 0; y < h + HY * 2; row++, y = row * HY) {
      for (let x = (row & 1) ? HX / 2 : 0; x < w + HX; x += HX) {
        const d = Math.hypot(x - anim.ox, y - anim.oy) / maxD;
        let s = clamp((p * 1.5 - d) / 0.5);
        s = anim.mode === 'cover' ? ease.out(s) : 1 - ease.in(s);
        if (s <= 0.01) continue;
        const r = R * Math.min(1.04, s);
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
        g.closePath();
        g.fillStyle = '#04070a'; g.fill();
        if (s < 0.98) { g.strokeStyle = `rgba(134,227,255,${(1 - s) * 0.9})`; g.lineWidth = 1.2; g.stroke(); }
      }
    }
    if (p >= 1) {
      covered = anim.mode === 'cover';
      const r = anim.resolve; anim = null; r();
      if (!covered) g.clearRect(0, 0, w, h);
    }
  });

  const run = (mode, o, dur) => new Promise((resolve) => {
    anim = { mode, t0: clock.t, dur, ox: o?.x ?? innerWidth / 2, oy: o?.y ?? innerHeight / 2, resolve };
    if (mode === 'reveal') covered = false;
  });
  let last = null;
  return {
    cover(origin) { last = origin; return run('cover', origin, 460); },
    reveal() { return run('reveal', last, 560); },
    get busy() { return !!anim; },
  };
}
