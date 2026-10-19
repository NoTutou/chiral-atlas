/* =========================================================
   procedural sound effects (Web Audio, no audio files)
   usage:  sfx.play('hover')  sfx.play('lift', { pitch: 1.2, vol: .6, pan: -.3 })
           const w = sfx.loop('wave'); w.set(level0to1)      // continuous layers
   names:  hover tick type select confirm back deny glitch whoosh reveal lift drop ripple
           disc slide scan node packet score ding like zoom boot open close error
   Browsers keep audio locked until the first user gesture; we unlock automatically.
   ========================================================= */
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, master, comp, wet, conv, noiseBuf;
let muted = localStorage.getItem('ca.muted') === '1';
const lastAt = new Map();
const loops = new Map();
const listeners = new Set();
let VOL = 1, PAN = 0;     // per-play() scaling, read by the primitives

function init() {
  if (ctx || !AC) return;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
  master.connect(comp).connect(ctx.destination);
  // generated reverb impulse: decaying stereo noise
  const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  conv = ctx.createConvolver(); conv.buffer = ir;
  wet = ctx.createGain(); wet.gain.value = 0.32;
  conv.connect(wet).connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  startAmbient();
}
const unlock = () => { init(); if (ctx && ctx.state !== 'running') ctx.resume(); };
['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, unlock, { passive: true }));

/* ---------- primitives ---------- */
function out(node, { pan = 0, rev = 0.25 } = {}) {
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan + PAN));
  node.connect(p); p.connect(master);
  if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; p.connect(s); s.connect(conv); }
}
function env(g, t, a, d, v) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(f, dur, o = {}) {
  const t = ctx.currentTime + (o.at || 0);
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? dur));
  if (o.detune) osc.detune.value = o.detune;
  env(g, t, o.a ?? 0.004, dur, (o.vol ?? 0.1) * VOL);
  let n = osc;
  if (o.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; n.connect(f2); n = f2; }
  n.connect(g); out(g, o);
  osc.start(t); osc.stop(t + (o.a ?? 0.004) + dur + 0.05);
}
function noise(dur, o = {}) {
  const t = ctx.currentTime + (o.at || 0);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.f || 2000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = ctx.createGain(); env(g, t, o.a ?? 0.004, dur, (o.vol ?? 0.08) * VOL);
  src.connect(f).connect(g); out(g, o);
  src.start(t, Math.random()); src.stop(t + (o.a ?? 0.004) + dur + 0.05);
}

/* ---------- sound recipes ---------- */
const R = {
  hover: (p) => { tone(2300 * p, 0.035, { to: 1900 * p, vol: 0.035, rev: 0.1 }); noise(0.015, { f: 7000, vol: 0.02, rev: 0 }); },
  tick: (p) => tone((1800 + Math.random() * 700) * p, 0.012, { type: 'square', vol: 0.012, lp: 5000, rev: 0.05 }),
  type: (p) => noise(0.018, { f: (3500 + Math.random() * 2000) * p, q: 3, vol: 0.03, rev: 0.02 }),
  select: (p) => { tone(880 * p, 0.09, { vol: 0.08 }); tone(1320 * p, 0.14, { vol: 0.07, at: 0.05 }); },
  confirm: (p) => {
    [660, 990, 1320, 1980].forEach((f, i) => tone(f * p, 0.25 - i * 0.03, { vol: 0.07, at: i * 0.055, rev: 0.45 }));
    noise(0.35, { f: 800, to: 5000, vol: 0.03, a: 0.08, rev: 0.4 });
  },
  back: (p) => { tone(1100 * p, 0.07, { vol: 0.07 }); tone(740 * p, 0.12, { vol: 0.06, at: 0.05 }); },
  deny: () => { [0, 0.11].forEach((at) => tone(140, 0.08, { type: 'square', vol: 0.05, lp: 900, at, rev: 0.1 })); tone(147, 0.2, { type: 'sawtooth', vol: 0.03, lp: 600, rev: 0.2 }); },
  error: () => R.deny(),
  glitch: () => { for (let i = 0; i < 5; i++) tone(200 + Math.random() * 3000, 0.012 + Math.random() * 0.02, { type: 'square', vol: 0.03, at: i * 0.025, lp: 4000, rev: 0.05 }); },
  whoosh: () => { noise(0.45, { f: 350, to: 3800, q: 0.9, vol: 0.09, a: 0.12, rev: 0.35 }); tone(90, 0.4, { to: 45, vol: 0.12, a: 0.05, rev: 0.2 }); },
  reveal: () => { noise(0.55, { f: 3600, to: 500, q: 0.8, vol: 0.06, a: 0.02, rev: 0.4 }); tone(1760, 0.6, { to: 1660, vol: 0.025, a: 0.05, rev: 0.6 }); },
  lift: (p) => { tone(520 * p, 0.06, { type: 'triangle', to: 470 * p, vol: 0.06, rev: 0.15 }); noise(0.03, { f: 2400 * p, q: 4, vol: 0.03, rev: 0.1 }); },
  drop: () => { tone(130, 0.18, { to: 55, vol: 0.18, rev: 0.15 }); noise(0.06, { f: 900, vol: 0.06, rev: 0.1 }); },
  ripple: () => { tone(320, 0.7, { to: 170, vol: 0.09, a: 0.01, rev: 0.6 }); tone(1568, 0.9, { vol: 0.03, a: 0.02, rev: 0.7 }); tone(2349, 0.7, { vol: 0.018, at: 0.08, rev: 0.7 }); },
  disc: () => {
    tone(70, 1.1, { type: 'sawtooth', to: 420, glide: 1.0, vol: 0.05, lp: 1400, a: 0.05, rev: 0.2 });
    tone(1100, 1.0, { to: 2600, glide: 1.0, vol: 0.012, a: 0.2, rev: 0.3 });
  },
  slide: (p) => noise(0.07, { f: 5000 * p, to: 2000 * p, q: 1.5, vol: 0.035, rev: 0.12 }),
  scan: () => { tone(1200, 0.5, { to: 2600, vol: 0.02, a: 0.03, rev: 0.3 }); noise(0.5, { f: 3000, q: 6, vol: 0.02, a: 0.1, rev: 0.2 }); },
  node: (p) => { tone(520 * p, 0.16, { to: 790 * p, glide: 0.07, vol: 0.09, rev: 0.5 }); tone(1040 * p, 0.12, { vol: 0.025, at: 0.05, rev: 0.5 }); },
  packet: (p) => tone(3100 * p, 0.02, { vol: 0.012, rev: 0.25 }),
  score: (p) => tone(1400 * p, 0.02, { type: 'triangle', vol: 0.025, rev: 0.1 }),
  ding: () => { tone(1760, 1.2, { vol: 0.07, rev: 0.6 }); tone(2637, 1.0, { vol: 0.04, at: 0.01, rev: 0.6 }); tone(880, 0.8, { vol: 0.03, rev: 0.5 }); },
  like: () => { tone(1318, 0.3, { vol: 0.07, rev: 0.5 }); tone(1975, 0.45, { vol: 0.06, at: 0.08, rev: 0.6 }); noise(0.2, { f: 8000, vol: 0.02, at: 0.08, rev: 0.5 }); },
  zoom: (p) => noise(0.05, { f: 1500 * p, q: 5, vol: 0.025, rev: 0.05 }),
  open: () => { R.whoosh(); R.ripple(); },
  close: () => { noise(0.3, { f: 3000, to: 500, vol: 0.05, rev: 0.3 }); R.back(1); },
  boot: () => {
    const t = ctx.currentTime;
    [55, 55.6, 82.5].forEach((f, i) => {
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass';
      lp.frequency.setValueAtTime(120, t); lp.frequency.exponentialRampToValueAtTime(1400, t + 2.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 - i * 0.012, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      o.connect(lp).connect(g); out(g, { rev: 0.5, pan: i - 1 });
      o.start(t); o.stop(t + 3.7);
    });
    tone(1760, 1.4, { vol: 0.05, at: 2.6, rev: 0.7 }); tone(2637, 1.2, { vol: 0.03, at: 2.66, rev: 0.7 });
  },
};
const GAP = { hover: 45, tick: 28, type: 30, lift: 55, packet: 70, score: 40, slide: 50, zoom: 60, node: 80, glitch: 120 };

/* ---------- continuous layers ---------- */
function makeLoop(name) {
  if (!ctx) return { set() {} };
  if (name === 'wave') {
    // glassy rustle: band-passed noise + faint pitched shimmer, gain follows wave energy
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const sh = ctx.createOscillator(); sh.frequency.value = 1568; const sg = ctx.createGain(); sg.gain.value = 0;
    src.connect(bp).connect(g); sh.connect(sg);
    out(g, { rev: 0.4 }); out(sg, { rev: 0.8 });
    src.start(); sh.start();
    return {
      set(level, pitch = 1) {
        const t = ctx.currentTime, l = Math.max(0, Math.min(1, level));
        g.gain.setTargetAtTime(l * 0.05, t, 0.08);
        sg.gain.setTargetAtTime(l * 0.006, t, 0.15);
        bp.frequency.setTargetAtTime(800 + 1400 * pitch * l, t, 0.1);
      },
    };
  }
  return { set() {} };
}
let amb = null;
function startAmbient() {
  // very quiet drifting pad (DS-like distant drone)
  const g = ctx.createGain(); g.gain.value = 0.0001;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  [110, 164.8, 220.4].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = i === 1 ? 'triangle' : 'sine'; o.frequency.value = f;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = 1.5;
    lfo.connect(lg).connect(o.detune); lfo.start(); o.connect(lp); o.start();
  });
  lp.connect(g); out(g, { rev: 0.9 });
  g.gain.setTargetAtTime(0.022, ctx.currentTime, 3);
  amb = g;
}

export const sfx = {
  play(name, o = {}) {
    if (muted || !ctx || ctx.state !== 'running' || !R[name]) return;
    const now = performance.now(), gap = GAP[name] || 0;
    if (gap && now - (lastAt.get(name) || 0) < gap) return;
    lastAt.set(name, now);
    VOL = o.vol ?? 1; PAN = o.pan ?? 0;
    try { R[name](o.pitch || 1); } finally { VOL = 1; PAN = 0; }
  },
  loop(name) {
    if (!loops.has(name) && ctx) loops.set(name, makeLoop(name));
    return loops.get(name) || { set() {} };
  },
  get muted() { return muted; },
  toggle() {
    muted = !muted; localStorage.setItem('ca.muted', muted ? '1' : '0');
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
    listeners.forEach((f) => f(muted));
    return muted;
  },
  onChange(f) { listeners.add(f); },
  get ready() { return !!ctx && ctx.state === 'running'; },
};
