#!/usr/bin/env python3
"""Agent Mission Control, web version - stage 1 prototype.

One window (pywebview) with terminal tabs drawn by xterm.js and a chat box that
types into the active tab. Each tab is a pseudo-terminal this process owns:
ptyprocess on Linux, ConPTY (pywinpty) on Windows. Closing the window ends them.

    python3 amc_web.py            two tabs running claude (new sessions)
    python3 amc_web.py --shell    two tabs running the login shell, for testing

Needs: pywebview (Linux: sudo apt install python3-webview; Windows: pip install
pywebview pywinpty).
"""

import json
import os
import shutil
import sys
import threading
import time

import webview

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORK_DIR = os.path.dirname(ROOT)                   # every agent tab starts here
WINDOWS = os.name == 'nt'

if WINDOWS:
    from winpty import PtyProcess
else:
    from ptyprocess import PtyProcessUnicode as PtyProcess


def tab_commands():
    """(title, argv) for each tab."""
    if '--shell' in sys.argv:
        shell = os.environ.get('COMSPEC', 'cmd.exe') if WINDOWS else os.environ.get('SHELL', '/bin/bash')
        return [('shell 1', [shell]), ('shell 2', [shell])]
    claude = shutil.which('claude') or 'claude'
    return [('claude 1', [claude]), ('claude 2', [claude])]


class Term:
    """One pseudo-terminal and the thread reading it."""

    def __init__(self, tid, argv, on_output, on_exit):
        env = dict(os.environ)
        if not WINDOWS:
            env.update(TERM='xterm-256color', COLORTERM='truecolor')
        self.tid = tid
        self.proc = PtyProcess.spawn(argv, cwd=WORK_DIR, env=env, dimensions=(30, 100))
        self.lock = threading.Lock()
        threading.Thread(target=self.pump, args=(on_output, on_exit), daemon=True).start()

    def pump(self, on_output, on_exit):
        while True:
            try:
                data = self.proc.read(65536)
            except EOFError:
                break
            except OSError:
                break
            if data:
                on_output(self.tid, data)
        on_exit(self.tid)

    def write(self, data):
        with self.lock:
            self.proc.write(data)

    def resize(self, cols, rows):
        self.proc.setwinsize(rows, cols)

    def close(self):
        try:
            if self.proc.isalive():
                self.proc.terminate(force=True)
        except Exception:
            pass


class Api:
    """Called from the page as window.pywebview.api.<name>(...)."""

    def __init__(self):
        self._window = None
        self._terms = {}
        self._out = {}                      # tid -> output not yet handed to the page
        self._out_lock = threading.Lock()

    # --- page -> python

    def start(self):
        """Opens the tabs; returns [{id, title}] for the page to draw."""
        if not self._terms:
            for i, (title, argv) in enumerate(tab_commands()):
                self._terms[str(i)] = Term(str(i), argv, self._output, self._exited)
                self._terms[str(i)].title = title
            threading.Thread(target=self._flush, daemon=True).start()
        return [{'id': tid, 'title': t.title} for tid, t in self._terms.items()]

    def write(self, tid, data):
        if tid in self._terms:
            self._terms[tid].write(data)

    def resize(self, tid, cols, rows):
        if tid in self._terms and cols > 0 and rows > 0:
            self._terms[tid].resize(int(cols), int(rows))

    def send(self, tid, text):
        """The chat box: types `text` into tab `tid` and submits it. A newline inside
        the text is typed the way Claude Code documents it for any terminal: a
        backslash, then Enter. Enter goes on its own after a pause, so it lands as a
        submit, not as part of the typed text."""
        term = self._terms.get(tid)
        if not term:
            return 'no such tab'
        lines = text.splitlines()
        for n, line in enumerate(lines):
            chunk = line + '\\' if n < len(lines) - 1 else line
            if chunk:
                term.write(chunk)
            time.sleep(0.3)
            term.write('\r')
            time.sleep(0.15)
        return None

    # --- python -> page

    def _output(self, tid, data):
        with self._out_lock:
            self._out[tid] = self._out.get(tid, '') + data

    def _exited(self, tid):
        self._output(tid, '\r\n\x1b[33m[process ended]\x1b[0m\r\n')

    def _flush(self):
        # Output is batched every 15 ms: one evaluate_js per burst, not per read.
        while True:
            time.sleep(0.015)
            with self._out_lock:
                pending, self._out = self._out, {}
            for tid, data in pending.items():
                try:
                    self._window.evaluate_js(f'amc.output({json.dumps(tid)}, {json.dumps(data)})')
                except Exception:
                    return                  # the window is gone

    def _close_all(self):
        for t in self._terms.values():
            t.close()


def main():
    api = Api()
    window = webview.create_window('Agent Mission Control', os.path.join(HERE, 'web', 'index.html'),
                                   js_api=api, width=1200, height=760, background_color='#060a06')
    api._window = window
    window.events.closed += api._close_all
    webview.start()


if __name__ == '__main__':
    main()
