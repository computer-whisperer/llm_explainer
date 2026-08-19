"""Real-time headless screenshot via CDP: load URL, wait wall-clock, screenshot.
Usage: python3 cdp_shot.py <url> <wait_seconds> <out.png>
"""
import asyncio, base64, json, subprocess, sys, urllib.request, time

URL, WAIT, OUT = sys.argv[1], float(sys.argv[2]), sys.argv[3]
PORT = 9333

async def main():
    proc = subprocess.Popen(
        ["chromium", "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
         "--window-size=1920,1080", "--user-data-dir=/tmp/claude-1000/cdp-profile", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://localhost:{PORT}/json"))
                if tabs: break
            except Exception:
                time.sleep(0.2)
        ws_url = next(t for t in tabs if t["type"] == "page")["webSocketDebuggerUrl"]
        import websockets
        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
            mid = 0
            async def cmd(method, **params):
                nonlocal mid
                mid += 1
                await ws.send(json.dumps({"id": mid, "method": method, "params": params}))
                while True:
                    r = json.loads(await ws.recv())
                    if r.get("id") == mid:
                        return r.get("result", {})
            await cmd("Emulation.setDeviceMetricsOverride", width=1920, height=1080,
                      deviceScaleFactor=1, mobile=False)
            await cmd("Page.navigate", url=URL)
            await asyncio.sleep(WAIT)
            shot = await cmd("Page.captureScreenshot", format="png")
            with open(OUT, "wb") as f:
                f.write(base64.b64decode(shot["data"]))
            # also dump kv + stats text for grepping
            res = await cmd("Runtime.evaluate", expression=
                "JSON.stringify({kv: document.getElementById('doc-kv')?.textContent,"
                "stats: document.getElementById('doc-stats')?.textContent,"
                "chat: document.getElementById('chat-log')?.innerText})")
            print(res["result"]["value"])
    finally:
        proc.terminate()

asyncio.run(main())
