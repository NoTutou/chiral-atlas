"""Responsive layout and touch flows. Build first; optionally pass a dev-server URL."""
import json
import os
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if a != '--flows-only']
URL = args[0] if args else (ROOT / "dist/index.html").as_uri()
SHOTS = ROOT / "shots"
SHOTS.mkdir(exist_ok=True)
errors = []


def load(page, route):
    page.goto(URL + "#/" + route)
    page.wait_for_selector(".page")
    page.wait_for_timeout(1800)


def within_width(page, selector):
    result = page.locator(selector).evaluate("""e => ({
      width: e.clientWidth, scroll: e.scrollWidth,
      left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right
    })""")
    assert result["scroll"] <= result["width"] + 2, (selector, result)
    assert result["left"] >= -1 and result["right"] <= page.viewport_size["width"] + 1, (selector, result)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROME_BIN") or None)
    sizes = [] if '--flows-only' in sys.argv else [(320, 568), (390, 844), (430, 932), (844, 390), (768, 1024), (1024, 768), (1440, 900)]
    for width, height in sizes:
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=True, is_mobile=width <= 1100)
        context.add_init_script("sessionStorage.setItem('ca.booted','1')")
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        for route in ["", "archive", "archive/CVE-2026-32709", "inference", "reserved"]:
            load(page, route)
            within_width(page, ".page")
            if width <= 1100:
                within_width(page, ".tabs")
                expect(page.locator('.tab-home')).to_be_visible()
                for tab in page.locator('.tabs .tab').all():
                    box = tab.bounding_box()
                    assert box["height"] >= 44 and box["y"] >= height - 66, box
            else:
                expect(page.locator('.tab-home')).to_be_hidden()
                assert page.locator('.hud').bounding_box()['height'] == 64
                assert page.locator('.foot').bounding_box()['height'] == 38
                # Flex centering against a 1px HUD border can yield a half-pixel offset.
                assert abs(page.locator('.tabs').bounding_box()['y']) <= 1
                assert page.locator('.sfx').evaluate("e => getComputedStyle(e).letterSpacing") == '1px'
            if route == "" and width <= 1100:
                for facility in [".f2", ".f3", ".f1"]:
                    within_width(page, facility)
            elif route == "archive/CVE-2026-32709":
                expect(page.locator('.det')).to_have_class('det on', timeout=20000)
                page.wait_for_timeout(2000)
                within_width(page, ".dp")
                if width <= 1100:
                    within_width(page, ".det")
                    page.locator('[data-r="send"]').scroll_into_view_if_needed()
                    assert page.locator('[data-r="send"]').bounding_box()["y"] < height - 64
            elif route == "inference":
                for panel in ["#L", "#C", "#R1", "#R2"]:
                    within_width(page, panel)
            elif route == "reserved":
                within_width(page, ".txt")
                page.locator('.req').scroll_into_view_if_needed()
            if width in [390, 844, 1440]:
                page.screenshot(path=str(SHOTS / f"responsive_{width}_{route.replace('/', '_') or 'hub'}.png"))
            print(f"layout {width}x{height} /{route or 'hub'} OK", flush=True)
        context.close()

    context = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, accept_downloads=True)
    context.add_init_script("sessionStorage.setItem('ca.booted','1')")
    page = context.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    load(page, "")
    page.locator('.f2 .enter').tap()
    expect(page).to_have_url(re.compile(r"#/archive$"), timeout=15000)
    page.wait_for_selector('.pg-archive')
    page.wait_for_timeout(1800)
    cdp = context.new_cdp_session(page)

    def touch(kind, points):
        cdp.send('Input.dispatchTouchEvent', {"type": kind, "touchPoints": [dict(x=x, y=y, id=i, radiusX=2, radiusY=2) for i, x, y in points]})

    before = page.locator('[data-r="pos"]').inner_text()
    touch('touchStart', [(0, 150, 430)])
    for i in range(1, 9):
        touch('touchMove', [(0, 150 + i * 10, 430 - i * 5)])
        page.wait_for_timeout(30)
    touch('touchEnd', [])
    page.wait_for_timeout(500)
    assert page.locator('[data-r="pos"]').inner_text() != before, 'touch pan failed'
    before = page.locator('[data-r="zv"]').inner_text()
    touch('touchStart', [(0, 160, 420), (1, 230, 420)])
    for i in range(1, 9):
        touch('touchMove', [(0, 160 - i * 4, 420), (1, 230 + i * 4, 420)])
        page.wait_for_timeout(40)
    touch('touchEnd', [])
    page.wait_for_timeout(800)
    assert page.locator('[data-r="zv"]').inner_text() != before, 'pinch zoom failed'
    touch('touchStart', [(0, 180, 420)])
    touch('touchCancel', [])
    assert page.locator('canvas.rack.grab').count() == 0
    print('touch pan / pinch / cancellation OK', flush=True)

    page.locator('[data-r="q"]').fill('CVE-2026-32709')
    page.locator('.res .it').first.tap()
    expect(page.locator('.det')).to_have_class('det on', timeout=15000)
    page.wait_for_timeout(2500)
    page.locator('[data-tab="1"]').tap()
    expect(page.locator('[data-tab="1"]')).to_have_class('on')
    page.locator('[data-r="save"]').tap()
    expect(page.locator('[data-r="save"]')).to_have_class('btn done')
    with page.expect_download() as dl:
        page.locator('[data-r="export"]').tap()
    assert dl.value.suggested_filename == 'CVE-2026-32709.md'
    page.locator('[data-r="send"]').tap()
    expect(page).to_have_url(re.compile(r"#/inference$"), timeout=15000)
    page.wait_for_selector('#slots .card')
    print('search / detail / save / export / send OK', flush=True)

    page.locator('#pasteBtn').tap()
    page.locator('#pName').fill('mobile.txt')
    page.locator('#pText').fill('Mobile verification: validate input and keep an audit log.')
    page.locator('#pOk').tap()
    expect(page.locator('#slots .card')).to_have_count(2)
    page.wait_for_timeout(2500)
    page.locator('#start').tap()
    expect(page.locator('#trace')).to_have_text('COMPLETE', timeout=90000)
    expect(page.locator('#start')).to_have_class('start btn done', timeout=30000)
    page.locator('[data-jump="R1"]').tap()
    page.wait_for_timeout(800)
    assert page.locator('#score').inner_text() != '--/100'
    page.screenshot(path=str(SHOTS / 'responsive_mobile_result.png'))
    page.locator('[data-jump="L"]').tap()
    with page.expect_download() as dl:
        page.locator('#start').tap()
    assert dl.value.suggested_filename.startswith('inference_report_')
    page.locator('.tab-home').tap()
    expect(page).to_have_url(re.compile(r"#/$"), timeout=15000)
    print('paste / run / result / report export / navigation OK', flush=True)
    context.close()
    browser.close()

assert not errors, json.dumps(errors, ensure_ascii=False)
print('All responsive and touch checks passed; no page errors.', flush=True)
