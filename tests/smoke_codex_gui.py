"""Optional live Codex integration test for macOS.

Run with .venv/bin/python3 tests/smoke_codex_gui.py after codex login.
Sends one short model request in a temporary directory with a read-only sandbox.
Requires a Codex CLI with --no-daemon support. No tasks or files are modified.
"""
import json
from pathlib import Path
import sys
import tempfile
import time
import uuid
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'Session HUD'))
import amc_web as app
import amc_core as core
import agent_runtime as runtime
import single_instance
import webview

if sys.platform != 'darwin':
    raise SystemExit('This interactive smoke test is for macOS.')

original_start = webview.start
original_argv = runtime.agent_argv
errors = []
results = {}
with tempfile.TemporaryDirectory(prefix='amc-real-codex-') as temp:
    sid = str(uuid.uuid4())
    entry = {'id': sid, 'name': 'Codex smoke', 'provider': 'codex'}
    path = Path(temp) / 'agents.json'
    path.write_text(json.dumps({'sessions': [entry]}))
    app.WORK_DIR = temp
    core.WORK_DIR = temp
    app.Api._usage_loop = lambda self: None
    single_instance.replace_previous = lambda name: None
    sys.argv = ['amc_web.py', '--agents', str(path)]
    def argv(e, run_id=None):
        args = original_argv(e, run_id)
        args += ['--no-daemon', '-s', 'read-only', '-c',
                 'projects.' + json.dumps(temp) + '.trust_level="trusted"']
        args.append('Reply exactly AMC_CODEX_SMOKE_OK. Do not use tools or read files.')
        return args
    app.agent_argv = argv
    def exercise():
        window = webview.windows[0]
        try:
            end = time.monotonic() + 55
            while time.monotonic() < end:
                state = runtime.codex_state(entry)
                if state.get('threadId'):
                    results['notification_received'] = True
                    results['resume_command_uses_recorded_id'] = original_argv(entry)[1:3] == ['resume', state['threadId']]
                    break
                time.sleep(0.25)
            else:
                raise AssertionError('No completion notification within 55 seconds')
        except Exception as exc:
            errors.append(str(exc))
        finally:
            window.destroy()
    def start(*args, **kwargs):
        return original_start(exercise, *args, **kwargs)
    webview.start = start
    app.main()
print(json.dumps({'results': results, 'errors': errors}))
if errors:
    sys.exit(1)
