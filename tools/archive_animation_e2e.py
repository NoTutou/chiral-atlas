"""Exercise real archive rendering with a deterministic rAF clock. Build first."""
import argparse
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

# Observe the canvas and DOM without adding production debug hooks. Each advance
# renders every frame, including frames from interrupted/long-idle transitions.
INIT = """
sessionStorage.setItem('ca.booted', '1');
let now = performance.now(), serial = 0, queue = new Map(), face = null, spin = null;
window.requestAnimationFrame = fn => { queue.set(++serial, fn); return serial; };
window.cancelAnimationFrame = id => queue.delete(id);
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
    assert not errors, errors
    browser.close()
print('Archive animation checks passed.', flush=True)
