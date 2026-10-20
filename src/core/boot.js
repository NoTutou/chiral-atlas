/* =========================================================
   first-visit boot sequence overlay
   runBoot(ctx) -> Promise, resolves when finished or skipped (click / any key)
   timeline (ms): log typing 80-1300 · logo strokes 300-1800 · gold strands 350-2500
                  title decode 1500-2500 · logo flies to the HUD brand slot 2650-3300
   ========================================================= */
import { seg, ease, lerp, hash, decode, typeText, fitCanvas, pad } from './util.js';
import { TOTAL } from '../data/archive.js';

const CSS = `
#boot{background:#04070a;pointer-events:auto;cursor:pointer;overflow:hidden}
#boot .bk{position:absolute;inset:0;background:#04070a}
#boot canvas{position:absolute;inset:0;width:100%;height:100%}
#boot .lg{position:absolute;width:156px;height:156px;left:50%;top:42%;margin:-78px 0 0 -78px;transform-origin:50% 50%}
#boot .lg svg{width:100%;height:100%;overflow:visible}
#boot .rings{position:absolute;width:300px;height:300px;left:50%;top:42%;margin:-150px 0 0 -150px}
#boot .rings svg{width:100%;height:100%;overflow:visible}
#boot .ttl{position:absolute;left:0;right:0;top:calc(42% + 168px);text-align:center}
#boot .ttl .a{font-family:var(--f-cond);font-size:54px;letter-spacing:20px;font-weight:600;padding-left:20px;line-height:1;min-height:54px}
#boot .ttl .a b{font-weight:300;color:var(--ink-2)}
#boot .ttl .b{margin-top:14px;font-size:15px;letter-spacing:7px;color:var(--ink-2);padding-left:7px;min-height:20px}
#boot .ttl .c{margin:22px auto 0;width:420px;display:flex;align-items:center;gap:12px;font-family:var(--f-mono);font-size:10px;letter-spacing:2px;color:var(--dim)}
#boot .ttl .c .bar{flex:1;height:2px;background:rgba(255,255,255,.07);position:relative}
#boot .ttl .c .bar>i{position:absolute;left:0;top:0;bottom:0;background:var(--ink)}
#boot .log{position:absolute;left:40px;bottom:58px;font-family:var(--f-mono);font-size:11px;line-height:20px;color:var(--ink-2);letter-spacing:1px;white-space:pre}
#boot .log .ok{color:var(--green)}
#boot .log .g{color:var(--gold)}
#boot .cn{position:absolute;right:40px;bottom:58px;text-align:right;font-family:var(--f-mono);font-size:10px;line-height:18px;letter-spacing:2px;color:var(--dim)}
#boot .cn .n{font-family:var(--f-cond);font-weight:300;font-size:64px;line-height:1;color:var(--ink);letter-spacing:2px}
#boot .skip{position:absolute;right:40px;top:28px;font-family:var(--f-mono);font-size:10px;letter-spacing:2px;color:var(--dim)}
#boot .skip kbd{font-family:var(--f-mono);border:1px solid var(--line-3);padding:1px 6px;margin-right:6px;color:var(--ink-2)}
@media(max-width:1100px){
  #boot .lg,#boot .rings{top:32%}
  #boot .ttl{top:calc(32% + 155px);padding:0 16px}
  #boot .ttl .a{font-size:clamp(28px,7.8vw,46px);letter-spacing:5px!important;padding-left:5px;min-height:36px}
  #boot .ttl .b{font-size:11px;letter-spacing:2px;line-height:1.8;margin-top:10px;padding:0}
  #boot .ttl .c{width:100%;max-width:360px;margin-top:16px;font-size:9px;letter-spacing:1px}
  #boot .log{left:16px;bottom:calc(24px + env(safe-area-inset-bottom,0px));font-size:8px;letter-spacing:0;line-height:17px;max-width:calc(100% - 32px);overflow:hidden}
  #boot .cn{display:none}
  #boot .skip{right:16px;top:calc(20px + env(safe-area-inset-top,0px));font-size:10px;letter-spacing:1px;min-height:44px;display:flex;align-items:center}
  #boot .skip kbd{display:none}
}
@media(max-width:1100px) and (max-height:520px){
  #boot .lg,#boot .rings{top:38%;left:24%}
  #boot .rings{scale:.65}
  #boot .ttl{top:32%;left:43%;right:16px;padding:0}
  #boot .ttl .a{font-size:28px;letter-spacing:3px!important}
  #boot .log{font-size:7px;line-height:12px;bottom:12px}
}
`;

const LOG = [
  ['> BRIDGES-OS v2.6.1 ', '[KERNEL OK]', 'ok'],
  ['> MOUNTING KNOWLEDGE ARCHIVE ......... ', `${TOTAL} RECORDS`, ''],
  ['> CHIRAL LINK HANDSHAKE .............. ', 'OK', 'ok'],
  ['> INFERENCE CORE · 7-STEP CHAIN ...... ', 'READY', 'ok'],
  ['> TIMEFALL MONITOR ................... ', 'CLEAR', 'ok'],
  ['> WELCOME, PORTER.', '', 'g'],
];
const END = 3350;

export function runBoot(ctx) {
  return new Promise((resolve) => {
    if (!document.getElementById('boot-css')) {
      const st = document.createElement('style'); st.id = 'boot-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.id = 'boot';
    el.innerHTML = `<div class="bk"></div><canvas></canvas>
      <div class="rings"><svg viewBox="0 0 300 300">
        <g class="r1"><circle cx="150" cy="150" r="118" fill="none" stroke="rgba(233,241,244,.5)" stroke-width="1" stroke-dasharray="1 5.18"/></g>
        <g class="r2"><circle cx="150" cy="150" r="134" fill="none" stroke="rgba(43,181,238,.8)" stroke-width="1" stroke-dasharray="90 30 14 30 40 60"/></g>
        <g class="r3"><circle cx="150" cy="150" r="100" fill="none" stroke="rgba(233,241,244,.16)" stroke-width="1"/>
          <path d="M150 6 V20 M150 280 V294 M6 150 H20 M280 150 H294" stroke="rgba(233,241,244,.7)" stroke-width="1"/></g>
        <g class="r4"><circle cx="150" cy="150" r="146" fill="none" stroke="rgba(227,162,58,.55)" stroke-width="1" stroke-dasharray="3 9"/></g>
      </svg></div>
      <div class="lg"><svg viewBox="0 0 40 40">
        <polygon class="h1" points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#e9f1f4" stroke-width="0.42" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
        <polygon class="h2" points="20,9 30,14.5 30,25.5 20,31 10,25.5 10,14.5" fill="none" stroke="#2bb5ee" stroke-width="0.3" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
        <path class="h3" d="M14 20 L20 13 L26 20 L20 27 Z" fill="#e9f1f4" opacity="0"/>
      </svg></div>
      <div class="ttl"><div class="a"></div><div class="b"></div>
        <div class="c"><span class="c1">SYNC</span><span class="bar"><i></i></span><span class="c2">000%</span></div></div>
      <div class="log"></div>
      <div class="cn"><div class="n">00</div><div>CHIRAL DENSITY</div></div>
      <div class="skip"><kbd>ANY KEY</kbd>SKIP · 跳过</div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    const bk = q('.bk'), lg = q('.lg'), rings = q('.rings'), ttl = q('.ttl'), logEl = q('.log'), cn = q('.cn');
    const h1 = q('.h1'), h2 = q('.h2'), h3 = q('.h3'), r1 = q('.r1'), r2 = q('.r2'), r4 = q('.r4');
    const tA = q('.ttl .a'), tB = q('.ttl .b'), bar = q('.ttl .bar>i'), c1 = q('.c1'), c2 = q('.c2'), cnN = q('.cn .n');
    let cv = fitCanvas(q('canvas'), 1.5);
    const onResize = () => { cv = fitCanvas(q('canvas'), 1.5); };
    addEventListener('resize', onResize);

    // strands start far outside the screen and converge on the logo
    const STR = Array.from({ length: 16 }, (_, i) => ({
      i, a: (i / 16) * Math.PI * 2 + hash(i) * 0.35, R: 1.25 + hash(i + 9) * 0.3,
      sw: (hash(i + 3) - 0.5) * 2, w: 0.6 + hash(i + 5) * 0.9, d: hash(i + 7),
    }));
    function strandPt(s, u, t, CX, CY, W) {
      const sx = CX + Math.cos(s.a) * s.R * W * 0.66, sy = CY + Math.sin(s.a) * s.R * W * 0.66 * 0.62;
      const wob = Math.sin(t * 0.0018 + s.i) * 40;
      const nx = -Math.sin(s.a), ny = Math.cos(s.a);
      const c1x = lerp(sx, CX, 0.35) + nx * (220 * s.sw + wob), c1y = lerp(sy, CY, 0.35) + ny * (220 * s.sw + wob);
      const c2x = lerp(sx, CX, 0.8) - nx * (120 * s.sw), c2y = lerp(sy, CY, 0.8) - ny * (120 * s.sw);
      const m = 1 - u;
      return [m * m * m * sx + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * CX, m * m * m * sy + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * CY];
    }

    let t0 = null, done = false, soundOn = false, B = 0, raw = 0, skipRaw = null, skipFrom = 0;
    const skip = () => { if (skipRaw === null && !done) { skipRaw = raw; skipFrom = Math.max(raw, 2650); } };
    el.addEventListener('pointerdown', skip);
    const onKey = (e) => { e.stopImmediatePropagation(); e.preventDefault(); skip(); };
    addEventListener('keydown', onKey, true);

    const finish = () => {
      if (done) return; done = true;
      off(); removeEventListener('resize', onResize); removeEventListener('keydown', onKey, true);
      el.remove();
      resolve();
    };

    const off = ctx.clock.add((t) => {
      if (t0 === null) t0 = t;
      raw = t - t0;
      // skipping: jump to the logo-flight phase and play it 1.6x
      B = skipRaw === null ? raw : skipFrom + (raw - skipRaw) * 1.6;
      if (!soundOn && B > 60) { soundOn = true; ctx.sfx.play('boot'); }
      if (B >= END) { finish(); return; }

      const { g, w: W, h: H } = cv;
      const brandRect = ctx.hud.el.querySelector('.brand svg').getBoundingClientRect();
      const CX = lg.offsetLeft + lg.offsetWidth / 2, CY = lg.offsetTop + lg.offsetHeight / 2;
      g.clearRect(0, 0, W, H);
      // overlay background: black -> transparent (map shows) -> stays transparent; HUD appears after
      bk.style.opacity = 1 - ease.io(seg(B, 500, 2300)) * 0.85;
      if (B < 3000) {
        for (const s of STR) {
          const head = ease.out(seg(B, 350 + s.d * 500, 1650 + s.d * 300));
          const tail = ease.io(seg(B, 1500 + s.d * 500, 2500 + s.d * 200));
          if (head <= tail) continue;
          g.beginPath();
          for (let k = 0; k <= 60; k++) { const [x, y] = strandPt(s, lerp(tail, head, k / 60), B, CX, CY, W); k ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.strokeStyle = 'rgba(227,162,58,.18)'; g.lineWidth = 4 * s.w; g.stroke();
          g.strokeStyle = 'rgba(255,210,126,.85)'; g.lineWidth = 0.9 * s.w; g.stroke();
          const [hx, hy] = strandPt(s, head, B, CX, CY, W);
          g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(hx, hy, 1.8, 0, 7); g.fill();
        }
        for (const [p0, col] of [[1650, '227,162,58'], [1850, '43,181,238']]) {
          const p = seg(B, p0, p0 + 900);
          if (p > 0 && p < 1) { g.strokeStyle = `rgba(${col},${(1 - p) * 0.8})`; g.lineWidth = 1.2; g.beginPath(); g.arc(CX, CY, 70 + ease.out(p) * 300, 0, 7); g.stroke(); }
        }
      }
      // log
      let html = '';
      LOG.forEach((l, k) => {
        const p = seg(B, 80 + k * 200, 300 + k * 200);
        if (p <= 0) return;
        const shown = typeText(l[0] + l[1], p);
        const a = shown.slice(0, l[0].length), b = shown.slice(l[0].length);
        html += a + (b ? `<span class="${l[2]}">${b}</span>` : '') + (p < 1 ? '▮' : '') + '\n';
      });
      logEl.innerHTML = html;
      logEl.style.opacity = 1 - seg(B, 2500, 2900);
      cnN.textContent = (ease.out(seg(B, 300, 2300)) * 72.4).toFixed(1) + '%';
      cn.style.opacity = seg(B, 200, 500) * (1 - seg(B, 2500, 2900));
      // logo
      h1.setAttribute('stroke-dashoffset', 1 - ease.io(seg(B, 300, 1300)));
      h2.setAttribute('stroke-dashoffset', 1 - ease.io(seg(B, 700, 1550)));
      h3.setAttribute('opacity', seg(B, 1550, 1800) * (B > 1550 && B < 1650 ? (hash(Math.floor(B / 30)) > 0.5 ? 1 : 0.3) : 1));
      const rp = ease.out(seg(B, 400, 1600)), ro = seg(B, 2400, 2800);
      rings.style.opacity = rp * (1 - ro);
      rings.style.transform = `scale(${0.75 + 0.25 * rp + ro * 0.25})`;
      r1.setAttribute('transform', `rotate(${B * 0.02} 150 150)`);
      r2.setAttribute('transform', `rotate(${-B * 0.045 + 40} 150 150)`);
      r4.setAttribute('transform', `rotate(${B * 0.012} 150 150)`);
      // fly into the HUD brand slot (logo svg centre ≈ 43,32 at 30px)
      const mv = ease.io(seg(B, 2650, 3300));
      lg.style.transform = `translate(${lerp(0, brandRect.left + brandRect.width / 2 - CX, mv)}px,${lerp(0, brandRect.top + brandRect.height / 2 - CY, mv)}px) scale(${lerp(1, brandRect.width / 156, mv)})`;
      // title
      const tp = seg(B, 1500, 2300);
      tA.innerHTML = decode('CHIRAL', tp, 1) + (tp > 0.35 ? '<b> ' + decode('ATLAS', seg(tp, 0.35, 1), 4) + '</b>' : '');
      tB.textContent = decode('知识档案 · 信息推理评估 网络', seg(B, 1800, 2500), 2);
      const sp = ease.io(seg(B, 300, 2400));
      bar.style.width = (sp * 100).toFixed(1) + '%';
      c2.textContent = pad(Math.round(sp * 100), 3) + '%';
      c1.textContent = sp >= 1 ? 'LINKED' : 'SYNC';
      const tOut = seg(B, 2550, 3000);
      ttl.style.opacity = seg(B, 1450, 1600) * (1 - tOut);
      ttl.style.transform = `translateY(${-tOut * 16}px)`;
      tA.style.letterSpacing = 20 + tOut * 14 + 'px';
      // final: everything but the logo dims to black, so the shell's hex reveal continues seamlessly
      const outP = seg(B, 2900, 3300);
      if (outP > 0) bk.style.opacity = Math.max(+bk.style.opacity, outP);
    });
  });
}
