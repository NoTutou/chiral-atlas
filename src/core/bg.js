/* static topographic background (drawn once per resize, drifted by CSS transform = ~free per frame) */
import { hash, lerp, fitCanvas } from './util.js';

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const hh = (a, b) => hash(a * 57.0 + b * 131.0);
  const s = (t) => t * t * (3 - 2 * t);
  const a = hh(xi, yi), b = hh(xi + 1, yi), c = hh(xi, yi + 1), d = hh(xi + 1, yi + 1);
  return lerp(lerp(a, b, s(xf)), lerp(c, d, s(xf)), s(yf));
}
const fbm = (x, y) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { v += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return v; };

/** marching-squares contour lines into ctx g over w×h */
export function drawContours(g, w, h, opt = {}) {
  const step = opt.step || 7, sc = opt.scale || 0.0042, levels = opt.levels || 16;
  const cols = Math.ceil(w / step) + 1, rows = Math.ceil(h / step) + 1;
  const F = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) F[j * cols + i] = fbm(i * step * sc + (opt.ox || 0), j * step * sc + (opt.oy || 0));
  for (let L = 1; L < levels; L++) {
    const iso = 0.18 + (L / levels) * 0.64;
    const major = L % 4 === 0;
    g.strokeStyle = major ? (opt.major || 'rgba(150,215,240,.13)') : (opt.minor || 'rgba(150,215,240,.055)');
    g.lineWidth = major ? 1 : 0.8;
    g.beginPath();
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = F[j * cols + i], b = F[j * cols + i + 1], c = F[(j + 1) * cols + i + 1], d = F[(j + 1) * cols + i];
      const k = (a > iso) | ((b > iso) << 1) | ((c > iso) << 2) | ((d > iso) << 3);
      if (k === 0 || k === 15) continue;
      const x = i * step, y = j * step;
      const e = [[x + step * (iso - a) / (b - a), y], [x + step, y + step * (iso - b) / (c - b)], [x + step * (iso - d) / (c - d), y + step], [x, y + step * (iso - a) / (d - a)]];
      const sg = (p, q) => { g.moveTo(e[p][0], e[p][1]); g.lineTo(e[q][0], e[q][1]); };
      switch (k) {
        case 1: case 14: sg(3, 0); break;
        case 2: case 13: sg(0, 1); break;
        case 3: case 12: sg(3, 1); break;
        case 4: case 11: sg(1, 2); break;
        case 5: sg(3, 0); sg(1, 2); break;
        case 6: case 9: sg(0, 2); break;
        case 7: case 8: sg(3, 2); break;
        case 10: sg(0, 1); sg(2, 3); break;
      }
    }
    g.stroke();
  }
}

export function initBackground(canvas) {
  const draw = () => {
    canvas.style.width = innerWidth + 120 + 'px';
    canvas.style.height = innerHeight + 120 + 'px';
    const { g, w, h } = fitCanvas(canvas, 1.5);
    const gr = g.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.4, w * 0.75);
    gr.addColorStop(0, '#0b1820'); gr.addColorStop(0.6, '#060c11'); gr.addColorStop(1, '#030507');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    drawContours(g, w, h);
    g.fillStyle = 'rgba(180,220,235,.10)';
    for (let x = 100; x < w; x += 80) for (let y = 164; y < h - 40; y += 80) g.fillRect(x - 0.5, y - 0.5, 1, 1);
  };
  draw();
  let to;
  addEventListener('resize', () => { clearTimeout(to); to = setTimeout(draw, 150); });
  return {
    /** call per frame: slow drift + optional dim */
    update(t) { canvas.style.transform = `translate3d(${Math.sin(t * 0.00005) * 40}px,${Math.cos(t * 0.00004) * 30}px,0)`; },
    setAlpha(a) { canvas.style.opacity = a; },
  };
}
