"""Exercise real archive rendering with a deterministic rAF clock. Build first."""
import argparse
import base64
import json
import math
import os
from pathlib import Path
from statistics import median

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--mode', choices=['desktop', 'mobile', 'webgl'])
args = parser.parse_args()
SHOTS = ROOT / 'shots' / 'archive-animation'
SHOTS.mkdir(parents=True, exist_ok=True)


def module_url(source):
    return 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()


# Load the real rack module in an isolated canvas to check its physics without
# adding debug exports to the shipped page or depending on pixel colours.
data_module = (ROOT / 'src/data/archive.js').read_text().replace(
    "import catalog from '../../knowledge-base/catalog.json';",
    'const catalog = ' + (ROOT / 'knowledge-base/catalog.json').read_text() + ';')
rack_module = (ROOT / 'src/pages/archive-rack.js').read_text()
for path, source in [('../core/util.js', (ROOT / 'src/core/util.js').read_text()),
                     ('../data/archive.js', data_module),
                     ('./archive-gl.js', (ROOT / 'src/pages/archive-gl.js').read_text())]:
    rack_module = rack_module.replace("'" + path + "'", "'" + module_url(source) + "'")
RACK_MODULE = module_url(rack_module)

# Observe the canvas and DOM without adding production debug hooks. Each advance
# renders every frame, including frames from interrupted/long-idle transitions.
INIT = """
sessionStorage.setItem('ca.booted', '1');
let now = performance.now(), serial = 0, queue = new Map(), face = null, spin = null;
window.requestAnimationFrame = fn => { queue.set(++serial, fn); return serial; };
window.cancelAnimationFrame = id => queue.delete(id);
window.__oscillators = [];
const AC = window.AudioContext || window.webkitAudioContext;
if (AC) {
  const create = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function(...args) {
    const osc = create.apply(this, args), stop = osc.stop;
    const item = {osc, stopped:false}; window.__oscillators.push(item);
    osc.stop = function(...args) { item.stopped = true; return stop.apply(this, args); };
    return osc;
  };
}
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, ...args) {
  const ctx = getContext.call(this, type, ...args);
  if (ctx && this.matches('.rack')) window.__rackMode = type;
  return ctx;
};
const proto = CanvasRenderingContext2D.prototype;
const fill = proto.fillRect, rotate = proto.rotate;
proto.fillRect = function(x, y, w, h) {
  if (this.canvas.matches('.focus') && x === 0 && y === 0 && w === 210) {
    const m = this.getTransform(), dpr = this.canvas.width / innerWidth;
    face = {x:m.e/dpr, y:m.f/dpr, ux:m.a*210/dpr, uy:m.b*210/dpr,
      vx:m.c*175/dpr, vy:m.d*175/dpr, visible:h};
  }
  return fill.apply(this, arguments);
};
proto.rotate = function(angle) {
  if (this.canvas.matches('.focus') && spin === null) spin = angle;
  return rotate.apply(this, arguments);
};
window.__frames = [];
window.__advance = (ms, step=1000/60) => {
  const count = Math.ceil(ms/step), delta = ms/count;
  for (let i=0; i<count; i++) {
    now += delta; face = null; spin = null;
    const callbacks = [...queue.values()]; queue.clear();
    const start = performance.now(); callbacks.forEach(fn => fn(now));
    const cost = performance.now()-start, det = document.querySelector('.det');
    if (det) window.__frames.push({face, spin, cost, on:det.classList.contains('on'),
      opacity:+det.style.opacity, scroll:det.scrollTop,
      masks:[...det.querySelectorAll('.mask')].map(m => +m.style.transform.match(/scaleX\\((.*)\\)/)?.[1] || 0)});
  }
  return window.__frames.at(-1);
};
"""


def advance(page, ms, step=1000/60):
    return page.evaluate('([ms,step]) => __advance(ms,step)', [ms, step])


def key(page, name):
    page.keyboard.press(name)


def route_record(page, record='CVE-2026-32709'):
    page.evaluate('id => location.hash = "#/archive/" + id', record)
    page.wait_for_timeout(20)  # deliver hashchange


def clear_frames(page):
    page.evaluate('__frames = []')


def shot(page, name):
    page.screenshot(path=str(SHOTS / f'{name}.png'))


def assert_hold_and_return_wave(page):
    page.evaluate('''async module => {
      const {createRack} = await import(module), canvases = [];
      const make = () => {
        const c = document.createElement('canvas');
        c.style.cssText = 'position:fixed;width:800px;height:600px;opacity:0;pointer-events:none';
        document.body.append(c); canvases.push(c); return createRack(c);
      };
      const a = make(), b = make(), flat = make(), check = (ok, msg) => { if (!ok) throw Error(msg); };
      const off = {inside:false};
      for (const rack of [a,b]) {
        const [x,y] = rack.P(0,0,0); rack.hover = {c:0,i:0};
        for (let t=0;t<=2000;t+=16) rack.update(t,16,{inside:true,x,y});
        check(rack.liftAt(0,0,2000)>30, 'hover never raised the source');
        rack.hover = null; rack.holdAt(0,0);
      }
      const crest = c => a.liftAt(c,0,2000)-flat.liftAt(c,0,2000);
      for (const side of [-1,1]) {
        check(crest(side)>5 && crest(side)<crest(0)*0.45,
          'neighbouring column should have a smaller visible hover crest');
        check(crest(side*2)>0 && crest(side*2)<crest(side),
          'hover crest should diminish with column distance');
      }
      for (let t=2000;t<=12000;t+=50) a.update(t,50,off);
      for (let c=-2;c<=2;c++) for (let i=-12;i<=12;i++) {
        check(Math.abs(a.liftAt(c,i,12000)-b.liftAt(c,i,12000))<1e-8,
          'opening changed the original raised shape');
      }
      a.returnRipple(0,0,12000);
      const wave = (c,i,t) => a.liftAt(c,i,t)-b.liftAt(c,i,t);
      check(wave(0,3,12436)>30, 'wave did not reach a near slot');
      check(Math.abs(wave(0,12,12436))<1e-8, 'far slot moved before the front arrived');
      check(wave(0,12,12845)>20, 'wave did not travel outward');
      check(Math.abs(wave(0,12,12845)-wave(0,-12,12845))<1e-8, 'wave was not bidirectional');
      const peakTime = (c,i) => 12000 + 1000*(Math.hypot(i, c*252/15*0.55)/22+0.3);
      const near = wave(1,0,peakTime(1,0)), far = wave(2,0,peakTime(2,0));
      check(near>5 && near<10 && far>0.5 && far<near,
        'return wave should weaken across columns');
      for (const c of [-1,1]) {
        check(Math.abs(wave(c,0,12300))<1e-8, 'neighbour column moved before the front arrived');
        check(Math.abs(wave(c,0,peakTime(1,0))-near)<1e-8, 'column spread was not symmetric');
        for (const i of [-6,6]) {
          check(wave(c,i,peakTime(c,i))>4, 'return wave failed to spread diagonally');
        }
      }
      check(Math.abs(wave(0,0,12300))<1e-8, 'landed case bounced instead of settling');
      for (let c=-3;c<=3;c++) for (let i=-20;i<=20;i++) {
        check(Math.abs(wave(c,i,15000))<1e-8, 'wave failed to decay');
      }
      a.held = null;
      for (let t=12016;t<=20000;t+=16) a.update(t,16,off);
      check(Math.abs(a.liftAt(0,0,20000))<6, 'source did not flatten after release');
      canvases.forEach(c => c.remove());
    }''', RACK_MODULE)


def assert_close(page, dwell=0, mobile_scroll=False, label='close'):
    if dwell:
        advance(page, dwell, 50)
    if mobile_scroll:
        scroll = page.locator('.det').evaluate('e => { e.scrollTop=e.scrollHeight; return e.scrollTop; }')
        assert scroll > 200, scroll
        advance(page, 17)
    clear_frames(page)
    key(page, 'Escape')
    advance(page, 650)
    halfway = page.evaluate('__frames.at(-1)')
    assert halfway['on'], halfway
    assert any(m > 0.1 for m in halfway['masks']), 'detail must retract before it is removed'
    if mobile_scroll:
        assert halfway['scroll'] == 0, halfway
        assert halfway['opacity'] == 0, halfway
    shot(page, label + '-retracting')
    advance(page, 650)
    frames = page.evaluate('__frames')
    assert not frames[-1]['on'], 'close did not finish'
    assert page.evaluate('location.hash') == '#/archive'
    faces = [f['face'] for f in frames if f['face']]
    assert len(faces) > 30, 'case disappeared before returning'
    assert faces[-1]['visible'] < 45, ('landing exposes too much case', faces[-1])
    # Continuous angular velocity after a long reading pause (no age multiplier).
    spins = [f['spin'] for f in frames if f['spin'] is not None]
    assert all(0 <= b-a <= 0.041 for a, b in zip(spins, spins[1:])), spins[:10]
    for face in faces:
        assert all(math.isfinite(v) for v in face.values()), face
    shot(page, label + '-landed')
    advance(page, 3500, 50)
    shot(page, label + '-settled')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or None)
    errors = []
    for label, width, height, query in [('desktop', 1440, 900, '?2d'), ('mobile', 390, 844, '?2d'), ('webgl', 1440, 900, '')]:
        if args.mode and args.mode != label:
            continue
        context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width < 1100)
        context.add_init_script(INIT)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto((ROOT / 'dist/index.html').as_uri() + query + '#/archive')
        page.wait_for_selector('.pg-archive')
        assert page.evaluate('__rackMode') == ('webgl2' if label == 'webgl' else '2d')
        advance(page, 3000, 50)

        # Open by clicking an actual case, rather than only entering a deep link.
        for x, y in [(width * .56, height * .53), (width * .65, height * .58), (width * .5, height * .55)]:
            page.mouse.move(x, y)
            advance(page, 180)
            page.mouse.click(x, y)
            if page.locator('.det.on').count():
                break
        assert page.locator('.det.on').count(), 'could not pick a visible CD case'
        first = advance(page, 17)
        assert first['opacity'] == 0, first
        assert page.locator('.dp .blk').evaluate_all('els => els.every(e => e.inert)'), 'hidden controls are interactive'
        advance(page, 750)
        shot(page, label + '-opening')
        advance(page, 1400, 50)
        assert page.locator('.det').evaluate('e => +e.style.opacity') == 1
        assert page.locator('.dp .blk').evaluate_all('els => els.every(e => !e.inert)')
        assert page.evaluate('''() => __oscillators.some(x => x.stopped) &&
          !__oscillators.some(x => !x.stopped && x.osc.frequency.value < 300)'''), \
            'interaction audio missing or a continuous low-frequency oscillator remains'
        shot(page, label + '-opened')
        assert_close(page, dwell=2000 if label == 'webgl' else 10000, mobile_scroll=width < 1100, label=label + '-idle')

        # Early interruption; the case should reverse from its current pose.
        route_record(page)
        advance(page, 800, 50)
        if not page.locator('.det.on').count():
            advance(page, 50)
        advance(page, 180)
        key(page, 'Escape')
        advance(page, 1000, 50)
        assert not page.locator('.det.on').count(), 'early close left an open overlay'

        # Queue rapid next/previous navigation during opening, then resize and close.
        route_record(page)
        advance(page, 850, 50)
        expected = page.locator('[data-r="nextId"]').text_content()
        key(page, 'ArrowRight')
        advance(page, 2300, 50)
        assert page.locator('.det.on').count()
        assert page.locator('[data-r="dFile"]').text_content() == 'FILE ' + expected
        assert page.locator('.dp .blk').evaluate_all('els => els.every(e => !e.inert)')
        key(page, 'ArrowLeft')
        advance(page, 1500, 50)
        page.set_viewport_size({'width': width + 30, 'height': height - 30})
        advance(page, 50)
        assert_close(page, label=label + '-switched')

        costs = page.evaluate('__frames.map(f => f.cost).sort((a,b) => a-b)')
        print(json.dumps({'mode': label, 'result': 'PASS', 'frame_js_median_ms': round(median(costs), 2),
                          'frame_js_p95_ms': round(costs[int(len(costs)*.95)], 2)}, ensure_ascii=False), flush=True)
        context.close()
    # Physics and propagation checks use independent canvases and the source
    # module, while the transition cases above exercise the production build.
    model = browser.new_page()
    model.goto((ROOT / 'dist/index.html').as_uri() + '?2d#/archive')
    assert_hold_and_return_wave(model)
    model.close()
    assert not errors, errors
    browser.close()
print('Archive animation checks passed.', flush=True)
