"""Drive the running dev server (npm run dev, port 5173) and take screenshots.

usage: python tools/shot.py archive step step ...      (route WITHOUT "#/", e.g. "" for hub, "archive/C-031")
steps (executed in order):
  wait:MS            move:X,Y[,STEPS]     click:X,Y      down:X,Y   up:X,Y
  wheel:DY[,X,Y]     key:KEY              type:TEXT      shot:NAME  (-> shots/NAME.png)
  size:W,H (first step only)   fps:MS  (measure average frame time over MS, prints it)
  skipboot           (sets sessionStorage so the boot sequence is skipped)
  eval:JS            evaluate a JS expression in the page and print the result
Console errors / page errors are printed.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
route, steps = sys.argv[1].lstrip("#/"), sys.argv[2:]
W, H = 1600, 900
if steps and steps[0].startswith("size:"):
    W, H = map(int, steps.pop(0)[5:].split(","))
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": W, "height": H})
    pg.on("pageerror", lambda e: print("[pageerror]", e))
    pg.on("console", lambda m: m.type in ("error", "warning") and print(f"[console.{m.type}]", m.text))
    if "skipboot" in steps:
        pg.add_init_script("sessionStorage.setItem('ca.booted','1')")
        steps.remove("skipboot")
    pg.goto("http://localhost:5173/#/" + route)
    pg.wait_for_timeout(300)
    for s in steps:
        k, _, v = s.partition(":")
        a = v.split(",") if v else []
        if k == "wait": pg.wait_for_timeout(int(v))
        elif k == "move": pg.mouse.move(float(a[0]), float(a[1]), steps=int(a[2]) if len(a) > 2 else 1)
        elif k == "click": pg.mouse.click(float(a[0]), float(a[1]))
        elif k == "down": pg.mouse.move(float(a[0]), float(a[1])); pg.mouse.down()
        elif k == "up": pg.mouse.move(float(a[0]), float(a[1]), steps=12); pg.mouse.up()
        elif k == "wheel":
            if len(a) > 1: pg.mouse.move(float(a[1]), float(a[2]))
            pg.mouse.wheel(0, float(a[0]))
        elif k == "key": pg.keyboard.press(v)
        elif k == "type": pg.keyboard.type(v, delay=30)
        elif k == "shot":
            (root / "shots").mkdir(exist_ok=True)
            pg.screenshot(path=str(root / "shots" / f"{v}.png"))
        elif k == "eval":
            print("[eval]", pg.evaluate(v))
        elif k == "fps":
            ms = pg.evaluate("""(ms) => new Promise(r => { let n = 0, t0 = performance.now(), worst = 0, last = t0;
                const f = (t) => { n++; worst = Math.max(worst, t - last); last = t;
                  if (t - t0 < ms) requestAnimationFrame(f); else r([(t - t0) / n, worst]); }; requestAnimationFrame(f); })""", int(v))
            print(f"[fps] avg frame {ms[0]:.1f} ms ({1000/ms[0]:.0f} fps), worst {ms[1]:.1f} ms")
    b.close()
