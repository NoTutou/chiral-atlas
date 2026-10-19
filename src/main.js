/* =========================================================
   CHIRAL ATLAS — app shell
   ---------------------------------------------------------
   Routes (hash based, works from file://):
     #/                 hub (sector select)
     #/reserved         sector 01
     #/archive[/ID]     sector 02 (optional record id opens it directly)
     #/inference        sector 03

   Page module contract (src/pages/*.js, default export):
     mount(root, ctx, params)   build DOM inside `root` (a .page div). params = path segments after the route
     update(t, dt)              per-frame, called only while mounted (t = global ms, dt = frame ms)
     unmount()                  remove listeners / loops (root itself is removed by the shell)
     onRoute(params)            optional: same page, new params (e.g. #/archive/C-031)
     onKey(e) -> bool           optional: return true if the key was consumed (shell skips global keys)
     hints                      optional: footer hints, or call ctx.setHints(...) any time

   ctx = { navigate(hash, origin?), setHints(hints, right), store, sfx, clock, mouse, bg, hud, toast }
   ========================================================= */
import './styles/base.css';
import { clock, mouse } from './core/clock.js';
import { initBackground } from './core/bg.js';
import { createHud, TABS } from './core/hud.js';
import { createWipe } from './core/transition.js';
import { store } from './core/store.js';
import { sfx } from './core/sfx.js';
import { toast } from './core/util.js';
import { runBoot } from './core/boot.js';

import hub from './pages/hub.js';
import reserved from './pages/reserved.js';
import archive from './pages/archive.js';
import inference from './pages/inference.js';

const ROUTES = { '': hub, reserved, archive, inference };
const ORDER = ['', 'reserved', 'archive', 'inference'];

const view = document.getElementById('view');
const bg = initBackground(document.getElementById('bg'));
const wipe = createWipe(document.getElementById('wipe'));
let hud;

const parse = (hash) => {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : '';
  return { name, params: name ? parts.slice(1) : [] };
};

let cur = null;        // {name, page, root}
let pendingOrigin = null;
let switching = false;

const ctx = {
  navigate(hashPath, origin) {
    pendingOrigin = origin || null;
    if (location.hash === hashPath || (hashPath === '#/' && !location.hash)) route();
    else location.hash = hashPath;
  },
  setHints: (h, r) => hud.setHints(h, r),
  store, sfx, clock, mouse, bg, toast,
  get hud() { return hud; },
};

async function route() {
  const { name, params } = parse(location.hash);
  if (cur && cur.name === name) { cur.page.onRoute?.(params); return; }
  if (switching) return;
  switching = true;
  if (cur) {
    sfx.play('whoosh');
    await wipe.cover(pendingOrigin);
    try { cur.page.unmount?.(); } catch (e) { console.error(e); }
    cur.root.remove();
  }
  const page = ROUTES[name];
  const root = document.createElement('div');
  root.className = `page pg-${name || 'hub'}`;
  view.appendChild(root);
  hud.setActive(name);
  hud.setHints(page.hints?.[0] || [], page.hints?.[1] || []);
  cur = { name, page, root };
  page.mount(root, ctx, params);
  sfx.play('reveal');
  await wipe.reveal();
  pendingOrigin = null;
  switching = false;
  // a hash change that happened during the transition
  if (parse(location.hash).name !== name) route();
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input,textarea,[contenteditable]')) return;
  if (cur?.page.onKey?.(e)) return;
  const k = e.key.toLowerCase();
  if (k === 'm') { sfx.toggle(); return; }
  if (k === 'q' || k === 'e') {
    const i = ORDER.indexOf(cur?.name ?? '');
    const n = ORDER[(i + (k === 'e' ? 1 : ORDER.length - 1)) % ORDER.length];
    sfx.play('select');
    ctx.navigate('#/' + n);
  }
  if (e.key === 'Escape' && cur?.name) { sfx.play('back'); ctx.navigate('#/'); }
});
addEventListener('hashchange', route);
if (import.meta.env.DEV) window.__ca = { clock, store, sfx };

clock.add((t, dt) => {
  bg.update(t);
  cur?.page.update?.(t, dt);
});

(async function start() {
  hud = createHud(document.getElementById('shell'), ctx.navigate);
  clock.start();
  await document.fonts.ready;
  if (!store.booted) {
    hud.show(0);
    await runBoot(ctx);
    store.markBooted();
    hud.show(1);
  }
  route();
})();

export { TABS };
