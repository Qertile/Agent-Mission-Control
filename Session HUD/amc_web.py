#!/usr/bin/env python3
"""Agent Mission Control, web version (stage 2): one window for everything.

Left, the task list; middle, account usage and the live Claude Code sessions with
a 60-second activity sparkline each; right, a terminal tab per agents.json session,
drawn by xterm.js. Each tab is a pseudo-terminal this process owns - ptyprocess on
Linux, ConPTY (pywinpty) on Windows - running `claude` on the session's fixed id,
so closing the window ends them; their conversations are kept and resume next time.

    python3 amc_web.py                    the agents.json tabs ticked "Open on start"
    python3 amc_web.py --agents FILE      another agents.json, e.g. for testing
    python3 amc_web.py --shell            tabs run the login shell instead of claude

Needs: pywebview (Linux: sudo apt install python3-webview; Windows: pip install
pywebview pywinpty), and openpyxl for the task statuses.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from datetime import date, datetime

import webview

import amc_core as core
from amc_core import (HERE, TASK_DIR, TASKS_PATH, XLSX_PATH, TASKS_SCRIPT, LAUNCHER_DIR, WORK_DIR,
                      CREATE_ON_SEND, load_json, active_sessions, transcript_path, account_usage,
                      format_tokens, format_remaining, format_uptime)

sys.path.insert(0, TASK_DIR)
import tasks  # noqa: E402

WINDOWS = os.name == 'nt'
if WINDOWS:
    from winpty import PtyProcess
else:
    from ptyprocess import PtyProcessUnicode as PtyProcess

ACTIVITY_WINDOW = 60
STATUS_COLORS = {'busy': '#00dcff', 'running': '#00dcff', 'waiting': '#ffc400', 'idle': '#8cff8c'}
GREY = '#8c96a0'


def arg_value(flag):
    if flag in sys.argv[:-1]:
        return sys.argv[sys.argv.index(flag) + 1]
    return None


def agent_argv(entry):
    """The command a tab runs for the agents.json entry: the Agents Launcher's agent.sh /
    agent.bat in Python. First run creates the session with its fixed id and, when
    Agents Launcher/prompts/<name>.md exists, sends that file as its first message;
    later runs resume the same conversation. --name pins the name in the registry."""
    if '--shell' in sys.argv:
        return [os.environ.get('COMSPEC', 'cmd.exe') if WINDOWS else os.environ.get('SHELL', '/bin/bash')]
    sid, name = entry['id'], entry['name']
    argv = [shutil.which('claude') or 'claude']
    if transcript_path(sid):
        return argv + ['--resume', sid, '--name', name]
    argv += ['--session-id', sid, '--name', name]
    try:
        with open(os.path.join(LAUNCHER_DIR, 'prompts', f'{name}.md'), encoding='utf-8') as f:
            argv.append(f.read())
    except OSError:
        pass
    return argv


class Term:
    """One pseudo-terminal and the thread reading it."""

    def __init__(self, tid, argv, on_output, on_exit):
        env = dict(os.environ)
        if not WINDOWS:
            env.update(TERM='xterm-256color', COLORTERM='truecolor')
        self.proc = PtyProcess.spawn(argv, cwd=WORK_DIR, env=env, dimensions=(30, 100))
        self.lock = threading.Lock()
        threading.Thread(target=self.pump, args=(tid, on_output, on_exit), daemon=True).start()

    def pump(self, tid, on_output, on_exit):
        while True:
            try:
                data = self.proc.read(65536)
            except (EOFError, OSError):
                break
            if data:
                on_output(tid, data)
        on_exit(tid, self)

    def write(self, data):
        with self.lock:
            self.proc.write(data)

    def resize(self, cols, rows):
        self.proc.setwinsize(rows, cols)

    def alive(self):
        try:
            return self.proc.isalive()
        except Exception:
            return False

    def close(self):
        try:
            if self.proc.isalive():
                self.proc.terminate(force=True)
        except Exception:
            pass


class Api:
    """Called from the page as window.pywebview.api.<name>(...). Private members start
    with "_": pywebview hands every public attribute to the page."""

    def __init__(self):
        self._window = None
        self._terms = {}                   # agents.json id -> Term while its process runs
        self._out = {}                     # id -> output not yet handed to the page
        self._out_lock = threading.Lock()
        self._start_lock = threading.Lock()
        self._config = load_json(os.path.join(HERE, 'hud-config.json')) or {}
        self._usage = {'snap': None, 'fetched': None, 'failed': False, 'week': None, 'week_at': None,
                       'account': None, 'account_at': None, 'account_error': None}
        self._samples, self._transcripts, self._last_len = {}, {}, {}
        self._sessions = []

    # --- page -> python: tabs and terminals

    def init(self):
        """Starts the background work and the ticked tabs; returns the tab list."""
        threading.Thread(target=self._flush_loop, daemon=True).start()
        threading.Thread(target=self._usage_loop, daemon=True).start()
        threading.Thread(target=self._activity_loop, daemon=True).start()
        running = {s['sid'] for s in active_sessions()}
        for e in core.agents():
            # A session already running elsewhere (an old tmux tab) is left there.
            if e.get('autoOpen', True) and e['id'] not in running:
                self._start(e)
        return self.tabs()

    def tabs(self):
        return [{'id': e['id'], 'name': e['name'], 'running': e['id'] in self._terms} for e in core.agents()]

    def open_tab(self, tid):
        """Starts the tab's process when it is not running. Returns None or what went wrong."""
        if tid in self._terms:
            return None
        if tid in {s['sid'] for s in active_sessions()}:
            return 'already running outside this window'
        entry = next((e for e in core.agents() if e['id'] == tid), None)
        if not entry:
            return 'not in agents.json'
        try:
            self._start(entry)
        except Exception as e:
            return str(e)
        return None

    def write(self, tid, data):
        term = self._terms.get(tid)
        if term:
            term.write(data)

    def resize(self, tid, cols, rows):
        term = self._terms.get(tid)
        if term and cols > 0 and rows > 0:
            term.resize(int(cols), int(rows))

    def send(self, name, text):
        """A chat box: types `text` into the tab named `name` and submits it, opening the
        tab first when it is not running (and adding it to agents.json when it is one
        of CREATE_ON_SEND). Returns None or what went wrong."""
        entry = next((e for e in core.agents() if e['name'] == name), None)
        if not entry and name in CREATE_ON_SEND:
            entry = {'name': name, 'id': str(uuid.uuid4()), 'window': 1}
            core.save_agents(core.agents() + [entry])
        if not entry:
            return f"no '{name}' in agents.json"
        if entry['id'] not in self._terms:
            err = self.open_tab(entry['id'])
            if err:
                return err
            self._js('amc.syncTabs()')
            if not self._wait_idle(entry['id']):
                return f"opened '{name}' - answer its tab, then send again"
        term = self._terms[entry['id']]
        # A newline inside the text is typed the way Claude Code documents it for any
        # terminal: a backslash, then Enter. Enter goes on its own after a pause, so it
        # lands as a submit, not as part of the typed text.
        lines = text.splitlines()
        for n, line in enumerate(lines):
            chunk = line + '\\' if n < len(lines) - 1 else line
            if chunk:
                term.write(chunk)
            time.sleep(0.3)
            term.write('\r')
            time.sleep(0.15)
        return None

    # --- page -> python: session list

    def snapshot(self):
        """Everything the page draws except the terminals, polled once a second."""
        u, snap = self._usage, self._usage['snap'] or {}
        listed = {e['id']: e for e in core.agents()}
        rows = []
        for s in self._sessions:
            slot = (snap.get('bySession') or {}).get(s['sid'])
            # Prefer real token activity when the scan saw any, otherwise the registry's updatedAt.
            updated = s['updated']
            if slot and slot.get('lastTs'):
                scanned = datetime.fromisoformat(slot['lastTs']).astimezone().replace(tzinfo=None)
                if not updated or scanned > updated:
                    updated = scanned
            entry = listed.get(s['sid'])
            rows.append({'sid': s['sid'], 'pid': s['pid'], 'name': s['name'], 'short': s['sid'][:8],
                         'status': s['status'], 'color': STATUS_COLORS.get(s['status'], GREY),
                         'tokens': format_tokens(slot['block']['total']) if slot else '-',
                         'up': format_uptime(s['started']),
                         'updated': updated.strftime('%Y-%m-%d %H:%M:%S') if updated else '',
                         'listed': bool(entry), 'autoOpen': bool(entry and entry.get('autoOpen', True)),
                         'tab': s['sid'] in self._terms,
                         'samples': list(self._samples.get(s['sid'], []))})
        note = f"{len(rows)} active · sessions {datetime.now():%H:%M:%S}"
        if u['fetched']:
            note += f" · usage {u['fetched']:%H:%M:%S}"
            if u['account']:
                note += f" · account {u['account_at']:%H:%M:%S}"
            elif u['account_error']:
                note += f" · account: {u['account_error']}"
        return {'rows': rows, 'usage': self._usage_view(), 'note': note}

    def terminate(self, sid, pid):
        """Ends a session: its tab's process here, otherwise the process itself."""
        term = self._terms.get(sid)
        if term:
            term.close()
            return
        try:
            os.kill(int(pid), signal.SIGTERM)
        except (OSError, ValueError):
            pass

    def set_auto_open(self, sid, on):
        core.set_auto_open(sid, bool(on))

    # --- page -> python: tasks

    def task_list(self):
        # Every open task, in priority order - the whole list, not a top 5.
        top, remaining = tasks.display_tasks(TASKS_PATH, count=10 ** 6)
        return {'tasks': [{'text': t['text'], 'description': t['description'], 'due': t['due'] or '',
                           'status': t['status'] or ''} for t in top],
                'remaining': remaining}

    def set_task_due(self, title, due):
        try:
            tasks.set_due(TASKS_PATH, title, due)
            self._start_sync()
            return f'due set to {due}'
        except Exception as e:
            return f'due not saved: {e}'

    def set_task_status(self, title, status):
        try:
            if status == 'Finished':
                # Ticked in tasks.md: gone from the list at once, Finished in the sheet after sync.
                tasks.set_checked(TASKS_PATH, title)
                self._start_sync()
            else:
                tasks.set_status(XLSX_PATH, title, status)
            return f'status set to {status}'
        except Exception as e:
            return f'status not saved: {e}'

    # --- internals

    def _start(self, entry):
        with self._start_lock:
            if entry['id'] not in self._terms:
                self._terms[entry['id']] = Term(entry['id'], agent_argv(entry), self._output, self._exited)

    def _wait_idle(self, sid, timeout=90):
        """True once the session is registered and idle at its prompt."""
        if '--shell' in sys.argv:
            time.sleep(1)
            return True
        end = time.time() + timeout
        while time.time() < end:
            if any(s['sid'] == sid and s['status'] == 'idle' for s in active_sessions()):
                time.sleep(1)       # let the prompt finish drawing before typing into it
                return True
            time.sleep(1)
        return False

    def _start_sync(self):
        kw = {} if WINDOWS else {'start_new_session': True}
        subprocess.Popen([sys.executable, TASKS_SCRIPT, 'sync'], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, **kw)

    def _js(self, code):
        try:
            self._window.evaluate_js(code)
        except Exception:
            pass

    def _output(self, tid, data):
        with self._out_lock:
            self._out[tid] = self._out.get(tid, '') + data

    def _exited(self, tid, term):
        if self._terms.get(tid) is term:
            del self._terms[tid]
        self._output(tid, '\r\n\x1b[33m[process ended]\x1b[0m\r\n')
        self._js('amc.syncTabs()')

    def _flush_loop(self):
        # Output is batched every 15 ms: one evaluate_js per burst, not per read.
        while True:
            time.sleep(0.015)
            with self._out_lock:
                pending, self._out = self._out, {}
            for tid, data in pending.items():
                self._js(f'amc.output({json.dumps(tid)}, {json.dumps(data)})')

    def _activity_loop(self):
        """One sample a second: bytes each session appended to its transcript."""
        while True:
            self._sessions = active_sessions()
            for s in self._sessions:
                sid = s['sid']
                if not sid:
                    continue
                if not self._transcripts.get(sid):
                    self._transcripts[sid] = transcript_path(sid)
                try:
                    length = os.path.getsize(self._transcripts[sid]) if self._transcripts[sid] else 0
                except OSError:
                    length = 0
                # First sighting has no previous length, so its delta is zero rather than the whole file.
                prev = self._last_len.get(sid, length)
                self._last_len[sid] = length
                self._samples.setdefault(sid, deque(maxlen=ACTIVITY_WINDOW)).append(max(0, length - prev))
            time.sleep(1)

    def _usage_loop(self):
        """The scans and the account fetch can take seconds, so they run here."""
        u = self._usage
        scanner = os.path.join(HERE, 'scan-usage.py')
        while True:
            now = datetime.now()
            # The weekly total reads up to seven days of transcripts, so only every 5 min.
            if not u['week_at'] or (now - u['week_at']).total_seconds() >= 300:
                week_file = os.path.join(HERE, 'week-usage.json')
                day = self._config.get('weekResetWeekday', 4)
                hour = self._config.get('weekResetHour', 21)
                subprocess.run([sys.executable, scanner, '--week', week_file, str(day), str(hour)],
                               capture_output=True)
                u['week'] = load_json(week_file) or u['week']
                u['week_at'] = now
            # Account-wide limits once a minute; a failed fetch keeps the last reading.
            if not u['account_at'] or (now - u['account_at']).total_seconds() >= 60:
                try:
                    u['account'], u['account_error'] = account_usage(), None
                except Exception as e:
                    u['account_error'] = str(e)
                u['account_at'] = now
            try:
                out = subprocess.run([sys.executable, scanner], capture_output=True, text=True).stdout
                u['snap'], u['fetched'], u['failed'] = json.loads(out), datetime.now(), False
            except (OSError, ValueError):
                u['failed'] = True
            time.sleep(15)

    def _usage_view(self):
        """The usage panel as text and pie fractions, the way the Tk HUD draws it."""
        u, snap = self._usage, self._usage['snap']
        if not snap:
            return {'message': 'USAGE  scanner unavailable (needs python3)' if u['failed'] else 'USAGE  scanning...'}
        block, acct = snap['block'], u['account']
        headline = f"tokens · {block['requests']} req"
        # Reset time from the account when known: the block the account is in is what counts.
        if acct and acct['five_hour_reset']:
            left = format_remaining(max(0, (acct['five_hour_reset'] - datetime.now()).total_seconds()))
            headline += f" · resets {acct['five_hour_reset']:%H:%M} · {left} left"
        elif snap.get('blockEnd'):
            to = datetime.fromisoformat(snap['blockEnd'])
            headline += f" · resets {to:%H:%M} · {format_remaining(snap['blockSecondsLeft'] or 0)} left"
        else:
            headline += ' · no block running'
        # The account's own percentages when they could be fetched, otherwise this
        # machine's spend against the caps in hud-config.json.
        cap5h = float(self._config.get('costCap5h') or 0)
        cap_week = float(self._config.get('costCapWeek') or 0)
        pies = []
        if acct:
            pies = [('5H', acct['five_hour'] / 100), ('WEEK', acct['week'] / 100)]
        elif cap5h > 0:
            used5h = snap.get('blockCost')
            used5h = block['total'] if used5h is None else used5h
            week = u['week'] or {}
            used_wk = week.get('cost', week.get('total', 0)) or 0
            pies = [('5H', used5h / cap5h), ('WEEK', used_wk / cap_week if cap_week > 0 else -1)]
        # Only the biggest few models fit on one line; the rest are counted.
        models = sorted(snap.get('byModel', {}).items(), key=lambda kv: kv[1], reverse=True)
        parts = [f"{re.sub('^claude-', '', m)} {format_tokens(v)}" for m, v in models[:3]]
        if len(models) > 3:
            parts.append(f'+{len(models) - 3} more')
        week_total = format_tokens(u['week']['total']) if u['week'] else '...'
        return {'total': format_tokens(block['total']), 'headline': headline,
                'detail': (f"new input {format_tokens(block['input'])} · output {format_tokens(block['output'])} · "
                           f"cache write {format_tokens(block['cacheCreate'])} · "
                           f"cache read {format_tokens(block['cacheRead'])}"),
                'week': f"{format_tokens(snap['today']['total'])} tokens / {week_total} tokens",
                'models': ' · '.join(parts),
                'pies': [{'caption': c, 'frac': f} for c, f in pies if f >= 0]}

    def _close_all(self):
        for t in list(self._terms.values()):
            t.close()


def main():
    if arg_value('--agents'):
        core.AGENTS_PATH = os.path.abspath(arg_value('--agents'))
    if not WINDOWS:
        from single_instance import replace_previous
        replace_previous('mission-control-web')
    api = Api()
    # The browser cache outlives the window (private_mode=False), so the page's
    # modified time in its URL makes an edited page load fresh.
    page = os.path.join(HERE, 'web', 'index.html')
    window = webview.create_window('Agent Mission Control', f'{page}?v={int(os.path.getmtime(page))}',
                                   js_api=api, width=1880, height=1000, min_size=(1100, 600),
                                   maximized=True, background_color='#060a06')
    api._window = window
    window.events.closed += api._close_all
    webview.start(private_mode=False)      # keeps the page's saved column widths


if __name__ == '__main__':
    main()
