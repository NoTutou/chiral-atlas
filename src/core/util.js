/* math / text / canvas helpers shared by every page */

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** normalized progress of t inside [a,b] */
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const mod = (n, m) => ((n % m) + m) % m;
export const ease = {
  lin: (x) => x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  in: (x) => x * x * x,
  io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  back: (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
};
/** frame-rate independent exponential approach */
export const damp = (cur, target, rate, dtMs) => cur + (target - cur) * (1 - Math.exp(-rate * dtMs / 1000));

export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
export const pad = (n, l = 2) => String(n).padStart(l, '0');
export const nf = (n) => Math.round(n).toLocaleString('en-US');

/* text decode: characters settle from random glyphs, left -> right */
const GL = 'ABCDEFHKLMNPRSTUVXZ0123456789#/<>=+';
const GZ = '▮档案索引数据链路';
export function decode(str, p, salt = 0) {
  if (p >= 1) return str;
  if (p <= 0) return '';
  let o = '';
  const n = str.length;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 0.75;
    const ch = str[i];
    if (p > th + 0.25 || ch === ' ') o += ch;
    else if (p > th) {
      const r = hash(i * 13.1 + Math.floor(p * 40) + salt);
      o += /[一-龥]/.test(ch) ? GZ[Math.floor(r * GZ.length)] : GL[Math.floor(r * GL.length)];
    } else break;
  }
  return o;
}
export const typeText = (str, p) => str.slice(0, Math.floor(str.length * clamp(p)));

/** size a canvas to its CSS box; returns {c,g,w,h,dpr}. call again on resize */
export function fitCanvas(c, dprCap = 2) {
  const r = c.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, dprCap);
  c.width = Math.max(1, Math.round(r.width * dpr));
  c.height = Math.max(1, Math.round(r.height * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, g, w: r.width, h: r.height, dpr };
}

export function hexPath(g, x, y, r, rot = -Math.PI / 2) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = rot + (k * Math.PI) / 3;
    k ? g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  g.closePath();
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** collects listeners / timers so a page can clean everything up in unmount() */
export class Bag {
  constructor() { this.fns = []; }
  on(target, type, fn, opts) { target.addEventListener(type, fn, opts); this.fns.push(() => target.removeEventListener(type, fn, opts)); return fn; }
  add(dispose) { this.fns.push(dispose); return dispose; }
  dispose() { this.fns.splice(0).forEach((f) => f()); }
}

export function toast(msg, ms = 1800) {
  const el = h(`<div class="toast">${msg}</div>`);
  document.body.appendChild(el);
  el.animate([{ opacity: 0, transform: 'translate(-50%,8px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 180, fill: 'forwards' });
  setTimeout(() => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => el.remove(), ms);
}

export function download(name, text, type = 'text/markdown') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
