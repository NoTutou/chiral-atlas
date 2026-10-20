"""End-to-end smoke test of the BUILT site (dist/index.html via file://): every route, key flows, console errors."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parent.parent
url = (root / "dist" / "index.html").as_uri()
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_BIN") or None)
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    pg.on("console", lambda m: m.type == "error" and errs.append(f"console: {m.text}"))
    pg.goto(url); pg.wait_for_timeout(1500)
    pg.mouse.click(800, 450); pg.wait_for_timeout(1500)          # skip boot
    out = root / "shots"; out.mkdir(exist_ok=True)
    pg.screenshot(path=str(out / "e2e_hub.png"))
    for key, name in [("2", "archive"), ("Escape", "hub2"), ("3", "inference"), ("Escape", "hub3"), ("1", "reserved")]:
        pg.keyboard.press(key); pg.wait_for_timeout(1800)
        pg.screenshot(path=str(out / f"e2e_{name}.png"))
        print(name, pg.evaluate("location.hash"))
    pg.goto(url + "#/archive/CVE-2026-32709"); pg.wait_for_timeout(4000)
    pg.screenshot(path=str(out / "e2e_deeplink.png"))
    print("deeplink", pg.evaluate("location.hash"), pg.evaluate("document.querySelector('.pg-archive .det')?.className"))
    b.close()
print("errors:", errs or "none")
assert not errs, errs
