"""Interactive macOS smoke test: opens and closes a real Cocoa window + shell tab.

Run: .venv/bin/python3 tests/smoke_macos_gui.py
Uses temporary session data; never starts Claude or reads its credentials.
"""
import json
from pathlib import Path
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'Session HUD'))
import amc_web
import single_instance
import webview


def main():
    if sys.platform != 'darwin':
        raise SystemExit('This interactive smoke test is for macOS.')
    sid = str(uuid.uuid4())
    results = {}
    failures = []
    processes = []
    real_start = webview.start

    def exercise():
        window = webview.windows[0]
        try:
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                try:
                    ready = window.evaluate_js(f'Boolean(amc.tabs[{json.dumps(sid)}]?.running)')
                except Exception:
                    ready = False
                if ready:
                    break
                time.sleep(0.2)
            else:
                raise AssertionError('Shell tab did not become ready')
            api = window._js_api
            processes.append(api._terms[sid].proc)
            api.write(sid, "printf 'AMC_%s\\n' SMOKE_OK\r")
            while time.monotonic() < deadline:
                output = window.evaluate_js(f'''(() => {{
                    const b = amc.tabs[{json.dumps(sid)}].term.buffer.active;
                    return Array.from({{length:b.length}}, (_,i) => b.getLine(i).translateToString()).join('\\n');
                }})()''')
                if 'AMC_SMOKE_OK' in output:
                    break
                time.sleep(0.2)
            else:
                raise AssertionError('PTY output did not reach xterm.js')
            api.resize(sid, 90, 24)
            results.update(cocoa_window=True, shell_input_output=True, terminal_resize=True)
        except Exception as exc:
            failures.append(str(exc))
        finally:
            window.destroy()

    def start(*args, **kwargs):
        return real_start(exercise, *args, **kwargs)

    with tempfile.TemporaryDirectory(prefix='amc-gui-') as temp:
        agents = Path(temp) / 'agents.json'
        agents.write_text(json.dumps({'sessions': [{'name': 'Smoke shell', 'id': sid}]}))
        sys.argv = ['amc_web.py', '--shell', '--agents', str(agents)]
        single_instance.replace_previous = lambda name: None
        amc_web.Api._usage_loop = lambda self: None
        webview.start = start
        amc_web.main()
    if not processes or any(proc.isalive() for proc in processes):
        failures.append('Shell process was not cleaned up on close')
    if failures:
        raise SystemExit('; '.join(failures))
    results['cleanup_on_close'] = True
    print(json.dumps(results))


if __name__ == '__main__':
    main()
