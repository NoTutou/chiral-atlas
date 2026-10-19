/* single rAF loop for the whole app. t = ms since start, dt clamped to 50ms */
const subs = new Set();
let t = 0, last = 0, ft = 16.7, js = 0;

export const clock = {
  get t() { return t; },
  /** smoothed frame time in ms (for adaptive quality) */
  get frameMs() { return ft; },
  /** smoothed JS time per frame spent in subscribers (ms) */
  get jsMs() { return js; },
  add(fn) { subs.add(fn); return () => subs.delete(fn); },
  start() {
    const loop = (now) => {
      const raw = now - last;
      last = now;
      const dt = Math.min(raw, 50);
      ft += (raw - ft) * 0.05;
      t += dt;
      const a = performance.now();
      for (const fn of subs) fn(t, dt);
      js += (performance.now() - a - js) * 0.05;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame((n) => { last = n; loop(n); });
  },
};

/* global pointer state (client coords) */
export const mouse = { x: -999, y: -999, inside: false, down: false };
addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; }, { passive: true });
addEventListener('pointerdown', () => { mouse.down = true; });
addEventListener('pointerup', () => { mouse.down = false; });
document.addEventListener('pointerleave', () => { mouse.inside = false; });
addEventListener('blur', () => { mouse.down = false; });
