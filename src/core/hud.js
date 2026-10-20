/* top HUD bar + bottom hint bar (shared by all pages) */
import { pad } from './util.js';
import { sfx } from './sfx.js';

export const LOGO = (c1 = '#e9f1f4', c2 = '#2bb5ee') =>
  `<svg viewBox="0 0 40 40"><polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="${c1}" stroke-width="1.4"/>` +
  `<polygon points="20,9 30,14.5 30,25.5 20,31 10,25.5 10,14.5" fill="none" stroke="${c2}" stroke-width="1"/>` +
  `<path d="M14 20 L20 13 L26 20 L20 27 Z" fill="${c1}"/></svg>`;

export const TABS = [
  { route: 'reserved', no: '01', en: 'RESERVED', zh: '预留', lock: true },
  { route: 'archive', no: '02', en: 'ARCHIVE', zh: '档案库' },
  { route: 'inference', no: '03', en: 'INFERENCE', zh: '推理评估' },
];

export function createHud(root, navigate) {
  root.insertAdjacentHTML('beforeend', `
  <div class="hud" id="hud">
    <button class="brand" data-go="" aria-label="返回网络首页">${LOGO()}<div><div class="nm">CHIRAL<b> ATLAS</b></div><div class="sub">KNOWLEDGE · INFERENCE NETWORK</div></div></button>
    <nav class="tabs" aria-label="板块导航"><span class="k">Q</span><button class="tab tab-home" data-go=""><span class="en">NETWORK</span><span class="zh">网络首页</span></button>${TABS.map((x) => `<button class="tab ${x.lock ? 'lock' : ''}" data-go="${x.route}"><i>${x.no}</i><span class="en">${x.en}</span><span class="zh">${x.zh}</span></button>`).join('')}<span class="k">E</span></nav>
    <div class="sys"><button class="sfx" id="sfxBtn" title="音效开关 (M)" aria-label="切换音效">SFX <b>ON</b></button><span><span class="led"></span>CHIRAL LINK <b class="ok">STABLE</b></span><span><b id="hudDate">—</b> <span id="hudTime">—</span></span></div>
  </div>
  <div class="foot" id="foot"><span id="footL" style="display:flex;gap:26px"></span><span class="ticks"></span><span class="r" id="footR"></span></div>`);
  const hud = root.querySelector('#hud'), footL = root.querySelector('#footL'), footR = root.querySelector('#footR');
  hud.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go]');
    if (el) navigate('#/' + el.dataset.go, { x: e.clientX, y: e.clientY });
  });
  const tick = () => {
    const d = new Date();
    root.querySelector('#hudDate').textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    root.querySelector('#hudTime').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  tick(); setInterval(tick, 1000);
  const sfxBtn = root.querySelector('#sfxBtn');
  const paintSfx = (m) => { sfxBtn.innerHTML = `SFX <b class="${m ? '' : 'ok'}">${m ? 'OFF' : 'ON'}</b>`; sfxBtn.setAttribute('aria-pressed', String(!m)); };
  paintSfx(sfx.muted); sfx.onChange(paintSfx);
  sfxBtn.addEventListener('click', (e) => { e.stopPropagation(); sfx.toggle(); sfx.play('select'); });
  hud.addEventListener('pointerover', (e) => { if (e.target.closest('[data-go],#sfxBtn') && !e.target.closest('[data-go],#sfxBtn').contains(e.relatedTarget)) sfx.play('hover'); });

  return {
    el: hud,
    setActive(route) { hud.querySelectorAll('.tab').forEach((t) => { const on = t.dataset.go === route; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); }); },
    /** hints: [['●','选择'], ['ESC','返回','sq'] ...]  right: ['SECTOR 02 / ARCHIVE', ...] */
    setHints(hints = [], right = []) {
      footL.innerHTML = hints.map(([k, t, c]) => `<span class="hint"><kbd class="${c || ''}">${k}</kbd>${t}</span>`).join('');
      footR.innerHTML = right.map((r) => `<span>${r}</span>`).join('');
    },
    show(v) { hud.style.opacity = v; root.querySelector('#foot').style.opacity = v; },
  };
}
