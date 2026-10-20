"""Exercise the built, offline knowledge archive against its complete real catalog."""
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist/index.html').as_uri()
CAT = json.loads((ROOT / 'knowledge-base/catalog.json').read_text())
RECORDS = CAT['records']
SHOTS = ROOT / 'shots'
SHOTS.mkdir(exist_ok=True)
errors, runtime_requests = [], []

def watch(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: runtime_requests.append(r.url) if r.resource_type in ['fetch', 'xhr'] else None)

def ready(page):
    expect(page.locator('.det')).to_have_class('det on', timeout=30000)
    page.wait_for_function("[...document.querySelectorAll('.det .mask')].every(e => e.style.opacity === '0')", timeout=45000)

def open_record(page, rid):
    page.evaluate('(id) => location.hash = "/archive/" + id', rid)
    expect(page.locator('[data-r="dFile"]')).to_have_text('FILE ' + rid, timeout=20000)
    ready(page)

def tab(page, n):
    page.locator(f'[data-tab="{n}"]').click()
    expect(page.locator(f'[data-tab="{n}"]')).to_have_class('on')

def width_ok(page, selector):
    for item in page.locator(selector).all():
        box = item.evaluate('e => ({w:e.clientWidth,s:e.scrollWidth,x:e.getBoundingClientRect().x,r:e.getBoundingClientRect().right})')
        assert box['s'] <= box['w'] + 2 and box['x'] >= -1 and box['r'] <= page.viewport_size['width'] + 1, (selector, box)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or None)
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    context.add_init_script("""sessionStorage.setItem('ca.booted','1');
      if (!localStorage.getItem('kb.test.seeded')) {
        localStorage.setItem('ca.saved', JSON.stringify(['E001','A001','CVE-2026-32709']));
        localStorage.setItem('kb.test.seeded','1');
      }""")
    page = context.new_page()
    watch(page)
    page.goto(URL + '#/archive/CVE-2026-32709')
    ready(page)
    assert page.evaluate('JSON.parse(localStorage.getItem("ca.saved"))') == ['CVE-2026-32709']
    assert '32 档案' in page.locator('.ttl .meta').text_content()
    assert page.locator('.cats .cat[data-k]').count() == 7
    assert sum(int(n.text_content()) for n in page.locator('.cat[data-k]:not(.sv) .n').all()) == 32

    # Every record: all six sections, references, typed relations and source metadata.
    for r in ([] if '--flows-only' in sys.argv else RECORDS):
        open_record(page, r['id'])
        expect(page.locator('[data-r="dZh"]')).to_have_text(r['title'])
        assert r['affected'] in page.locator('[data-r="bodyIn"]').inner_text()
        shelf = [x for x in RECORDS if x['shelf'] == r['shelf']]
        i = next(i for i, x in enumerate(shelf) if x['id'] == r['id'])
        expect(page.locator('[data-r="nextId"]')).to_have_text(shelf[(i + 1) % len(shelf)]['id'])
        expect(page.locator('[data-r="prevId"]')).to_have_text(shelf[(i - 1) % len(shelf)]['id'])
        tab(page, 1)
        for i, track in enumerate(r['tracks']):
            page.locator(f'[data-track="{i}"]').click()
            assert track['body'] in page.locator('.trb').inner_text()
            assert page.locator('.trb .refs a').count() == len(track['sources'])
        tab(page, 2)
        assert page.locator('[data-rel]').count() == len(r['related'])
        tab(page, 3)
        assert page.locator('.sources article').count() == len(r['sources'])
        for a in page.locator('.sources a').all():
            assert a.get_attribute('href').startswith('https://')
            assert a.get_attribute('target') == '_blank' and 'noopener' in a.get_attribute('rel')
        assert 'undefined' not in page.locator('[data-r="bodyIn"]').inner_text()
        assert 'NaN' not in page.locator('[data-r="grid"]').inner_text()
        print('record', r['id'], 'OK', flush=True)

    open_record(page, 'EDB-52339')
    tab(page, 2)
    page.locator('[data-rel="CVE-2025-5640"]').click()
    expect(page.locator('[data-r="dFile"]')).to_have_text('FILE CVE-2025-5640')
    assert page.evaluate('location.hash') == '#/archive/CVE-2025-5640'
    page.locator('[data-r="next"]').click()
    expect(page.locator('[data-r="dFile"]')).not_to_have_text('FILE CVE-2025-5640')

    # Complete Markdown download includes analysis, evidence, uncertainty and original row.
    open_record(page, 'CVE-2026-32709')
    with page.expect_download() as dl:
        page.locator('[data-r="export"]').click()
    assert dl.value.suggested_filename == 'CVE-2026-32709.md'
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / dl.value.suggested_filename
        dl.value.save_as(path)
        exported = path.read_text()
    record = next(r for r in RECORDS if r['id'] == 'CVE-2026-32709')
    assert all(t['body'] in exported for t in record['tracks'])
    assert all(s['url'] in exported and s['sha256'] in exported for s in record['sources'])
    assert 'Medium' in exported and '5.4' in exported and '9.8' in exported and '原始 BUGS.md 行' in exported
    page.screenshot(path=str(SHOTS / 'knowledge_desktop_detail.png'))
    page.locator('[data-r="save"]').click()
    expect(page.locator('[data-r="save"]')).not_to_have_class('btn done')
    page.locator('[data-r="save"]').click()
    assert 'CVE-2026-32709' in page.evaluate('JSON.parse(localStorage.getItem("ca.saved"))')

    # Tag -> search, aliases, more than eight matches, keyboard navigation, saved mode.
    page.locator('[data-tag="MAVLink"]').click()
    expect(page.locator('.det')).not_to_have_class('det on', timeout=30000)
    expect(page.locator('[data-r="q"]')).to_have_value('MAVLink')
    expect(page.locator('[data-r="q"]')).to_be_focused()
    page.locator('[data-r="q"]').fill('GHSA-fh32-qxj9-x32f')
    expect(page.locator('.res .it')).to_have_count(1)
    expect(page.locator('.res .it')).to_have_attribute('data-id', 'CVE-2026-32709')
    page.locator('[data-r="q"]').fill('CVE-')
    hits = set(page.locator('.res .it').evaluate_all('items => items.map(e => e.dataset.id)'))
    count = len(hits)
    assert {r['id'] for r in RECORDS if r['id'].startswith('CVE-')} <= hits and count > 8
    for _ in range(count - 1):
        page.locator('[data-r="q"]').press('ArrowDown')
    expect(page.locator('.res .it').last).to_have_class('it sel')
    page.locator('[data-r="savedBtn"]').click()
    expect(page.locator('[data-r="res"]')).not_to_have_class('res scroll on')
    expect(page.locator('.cat.sv')).to_have_class('cat sv on')
    page.locator('[data-r="q"]').fill('BST')
    expect(page.locator('.cat.sv')).not_to_have_class('cat sv on')
    page.locator('.res .it').first.click()
    ready(page)
    page.locator('[data-r="send"]').click()
    expect(page).to_have_url(re.compile(r'#/inference$'), timeout=20000)
    expect(page.locator('#slots .fn')).to_have_text('CVE-2026-32705.md')
    print('relations / pagination / export / saved migration / tags / search / inference cargo OK', flush=True)
    context.close()

    # Force the supported 2D fallback and exercise the longest IDs on a narrow viewport.
    context = browser.new_context(viewport={'width': 320, 'height': 568}, has_touch=True, is_mobile=True)
    context.add_init_script("sessionStorage.setItem('ca.booted','1')")
    page = context.new_page()
    watch(page)
    page.goto(URL + '?2d#/archive/GHSA-rfc7-3pxc-c68p')
    ready(page)
    for n in range(4):
        tab(page, n)
        width_ok(page, '.dp, .no, .tabsd, [data-r="bodyIn"]')
    page.locator('.sources details').first.click()
    width_ok(page, '.sources')
    page.screenshot(path=str(SHOTS / 'knowledge_mobile_sources.png'))
    tab(page, 2)
    page.locator('[data-rel="GHSL-2025-087"]').click()
    expect(page.locator('[data-r="dFile"]')).to_have_text('FILE GHSL-2025-087')
    width_ok(page, '.dp, .no')
    print('320px long IDs / four tabs / source hashes / 2D fallback links OK', flush=True)
    context.close()
    browser.close()

assert not errors, errors
assert not runtime_requests, runtime_requests
print('PASS: archive flows' + (' (focused rerun)' if '--flows-only' in sys.argv else ' and all 32 records')
      + '; no page errors or runtime API requests.', flush=True)
