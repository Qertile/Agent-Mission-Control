#!/usr/bin/env python3
"""Agent Mission Control: one window for everything. The Agents Launcher starts it.

Left, the task list; middle, account usage and the live Claude Code sessions (and
this window's Codex tabs) with a 60-second activity sparkline each; right, a terminal
tab per agents.json session, drawn by xterm.js. Each tab is a pseudo-terminal this
process owns - ptyprocess on Linux, ConPTY (pywinpty) on Windows - running `claude` on
the session's fixed id, or `codex` for an entry with "tool": "codex", so closing the
window ends them; their conversations are kept and resume next time.

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
from datetime import date, datetime, timedelta

import webview
from webview.dom import DOMEventHandler

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
# The aliases `claude --model` takes for the latest model of each family; '' is Claude Code's default.
# Codex's list comes from its models cache (amc_core.codex_models).
MODELS = ['fable', 'opus', 'sonnet', 'haiku']
# Codex makes a tab's thread as the tab starts (session_meta's time) but writes the
# rollout only at the first message, so a new tab's thread is the new rollout in
# WORK_DIR whose thread started this close after the tab.
THREAD_MATCH = (timedelta(seconds=-2), timedelta(seconds=30))


def arg_value(flag):
    if flag in sys.argv[:-1]:
        return sys.argv[sys.argv.index(flag) + 1]
    return None


def window_caption(minutes):
    """A limit window's length as the pies name it: 5H, WEEK, otherwise days or hours."""
    named = {300: '5H', 10080: 'WEEK'}
    if minutes in named:
        return named[minutes]
    return f'{minutes // 1440}D' if minutes % 1440 == 0 else f'{minutes // 60}H'


def first_prompt(name):
    """Agents Launcher/prompts/<name>.md, or None."""
    try:
        with open(os.path.join(LAUNCHER_DIR, 'prompts', f'{name}.md'), encoding='utf-8') as f:
            return f.read()
    except OSError:
        return None


def is_codex(entry):
    return (entry or {}).get('tool') == 'codex'


def codex_thread(entry):
    """The entry's Codex thread when its rollout is still there, otherwise ''."""
    thread = entry.get('thread') or ''
    return thread if thread and core.codex_rollout(thread) else ''


def agent_argv(entry):
    """The command a tab runs for the agents.json entry. First run creates the
    session with its fixed id and, when
    Agents Launcher/prompts/<name>.md exists, sends that file as its first message;
    later runs resume the same conversation. --name pins the name in the registry, and
    the entry's "model", when set, is passed as --model.

    A Codex entry cannot choose its id: a new one starts plain `codex` (with the prompt
    file as its first message) and its "thread" is filled in once Codex has made one;
    from then on it runs `codex resume <thread>`. Its model is passed as -m."""
    if '--shell' in sys.argv:
        return [os.environ.get('COMSPEC', 'cmd.exe') if WINDOWS else os.environ.get('SHELL', '/bin/bash')]
    sid, name = entry['id'], entry['name']
    prompt = first_prompt(name)
    if is_codex(entry):
        argv = [shutil.which('codex') or 'codex']
        model = ['-m', entry['model']] if entry.get('model') else []
        thread = codex_thread(entry)
        if thread:
            return argv + ['resume', thread] + model
        return argv + model + ([prompt] if prompt else [])
    argv = [shutil.which('claude') or 'claude']
    model = ['--model', entry['model']] if entry.get('model') else []
    if transcript_path(sid):
        return argv + ['--resume', sid, '--name', name] + model
    argv += ['--session-id', sid, '--name', name] + model
    if prompt is not None:
        argv.append(prompt)
    return argv


class Term:
    """One pseudo-terminal and the thread reading it."""

    def __init__(self, tid, argv, on_output, on_exit):
        env = dict(os.environ)
        if not WINDOWS:
            env.update(TERM='xterm-256color', COLORTERM='truecolor')
        self.proc = PtyProcess.spawn(argv, cwd=WORK_DIR, env=env, dimensions=(30, 100))
        self.lock = threading.Lock()
        self.started = datetime.now()
        self.enters = deque(maxlen=20)     # when Enter was typed: tells apart Codex tabs started together
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
        if '\r' in data:
            self.enters.append(datetime.now())
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
        self._drop_hooked = False
        self._terms = {}                   # agents.json id -> Term while its process runs
        self._out = {}                     # id -> output not yet handed to the page
        self._out_lock = threading.Lock()
        self._start_lock = threading.Lock()
        self._config = load_json(os.path.join(HERE, 'hud-config.json')) or {}
        self._usage = {'snap': None, 'fetched': None, 'failed': False, 'week': None, 'week_at': None,
                       'account': None, 'account_at': None, 'account_error': None, 'codex': None}
        self._samples, self._transcripts, self._last_len = {}, {}, {}
        self._sessions = []
        self._codex_models = []
        self._metas = {}                   # rollout path -> its session_meta, read once
        self._seen = {}                    # rollout path -> when this window first saw it

    # --- page -> python: tabs and terminals

    def init(self):
        """Starts the background work and the ticked tabs; returns the tab list."""
        threading.Thread(target=self._flush_loop, daemon=True).start()
        threading.Thread(target=self._usage_loop, daemon=True).start()
        threading.Thread(target=self._activity_loop, daemon=True).start()
        running = {s['sid'] for s in active_sessions()}
        for e in core.agents():
            # A session already running elsewhere (another terminal) is left there.
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

    def new_session(self, name, tool='claude'):
        """Adds a session named `name` with a new id to agents.json and starts its tab;
        tool 'codex' makes it a Codex session. Returns {'id': ...} or {'error': ...}."""
        name = ' '.join(str(name).split())
        if not name:
            return {'error': 'type a name'}
        if any(e['name'] == name for e in core.agents()):
            return {'error': f"'{name}' is already in agents.json"}
        entry = {'name': name, 'id': str(uuid.uuid4()), 'window': 1}
        if tool == 'codex':
            if not shutil.which('codex') and '--shell' not in sys.argv:
                return {'error': 'codex is not on PATH'}
            entry['tool'] = 'codex'
        core.save_agents(core.agents() + [entry])
        try:
            self._start(entry)
        except Exception as e:
            return {'error': str(e)}
        return {'id': entry['id']}

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
            rows.append({'sid': s['sid'], 'pid': s['pid'], 'name': s['name'], 'short': s.get('short') or s['sid'][:8],
                         'status': s['status'], 'color': STATUS_COLORS.get(s['status'], GREY),
                         'tokens': format_tokens(slot['block']['total']) if slot else '-',
                         'up': format_uptime(s['started']),
                         'updated': updated.strftime('%Y-%m-%d %H:%M:%S') if updated else '',
                         'listed': bool(entry), 'autoOpen': bool(entry and entry.get('autoOpen', True)),
                         'model': (entry or {}).get('model', ''),
                         'tool': 'codex' if is_codex(entry) else 'claude', 'models': self._models_for(entry),
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

    def move_session(self, sid, target, after):
        """Moves the agents.json session `sid` just before (or, `after`, just after)
        session `target`: the tab bar's order after a drag, kept for next time."""
        sessions = core.agents()
        moving = next((s for s in sessions if s.get('id') == sid), None)
        if not moving or sid == target:
            return
        sessions.remove(moving)
        at = next((i for i, s in enumerate(sessions) if s.get('id') == target), None)
        if at is None:
            return
        sessions.insert(at + 1 if after else at, moving)
        core.save_agents(sessions)

    def set_model(self, sid, model):
        """Saves the model the session starts with ('' = default). When its tab here is
        idle, the tab restarts so the model applies now; the conversation resumes. A busy
        or waiting session is not interrupted. Returns what happened."""
        entry = next((e for e in core.agents() if e['id'] == sid), None)
        if not entry:
            return 'not in agents.json'
        if model and model not in self._models_for(entry):
            return f"unknown model '{model}'"
        core.set_model(sid, model)
        entry = dict(entry, model=model)
        label = model or ('Codex default' if is_codex(entry) else 'Claude default')
        term = self._terms.get(sid)
        if not term:
            return f'model {label}: applies when the session next starts'
        if not any(s['sid'] == sid and s['status'] == 'idle' for s in self._sessions):
            return f'model {label}: not idle, applies when the session next starts'
        term.close()
        for _ in range(50):
            if not term.alive():
                break
            time.sleep(0.1)
        with self._start_lock:
            if self._terms.get(sid) is term:
                del self._terms[sid]
        try:
            self._start(entry)
        except Exception as e:
            return f'model {label} saved, restart failed: {e}'
        return f'model {label}: restarted'

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
                term = Term(entry['id'], agent_argv(entry), self._output, self._exited)
                # Started with its first message: its rollout appears without an Enter.
                if is_codex(entry) and not codex_thread(entry) and first_prompt(entry['name']):
                    term.enters.append(term.started)
                self._terms[entry['id']] = term

    def _models_for(self, entry):
        return self._codex_models if is_codex(entry) else MODELS

    def _codex_rows(self):
        """Rows shaped like active_sessions()' for this window's running Codex tabs,
        finding a new tab's thread on the way."""
        tabs = [(rank, e, self._terms.get(e['id'])) for rank, e in enumerate(core.agents())]
        tabs = [(rank, e, term) for rank, e, term in tabs if is_codex(e) and term]
        pending = [(e, term) for _, e, term in tabs if not codex_thread(e)]
        found = self._find_threads(pending) if pending else {}
        rows = []
        for rank, e, term in tabs:
            thread = found.get(e['id']) or codex_thread(e)
            path = core.codex_rollout(thread) if thread else ''
            modified = core.mtime(path) if path else 0
            rows.append({'pid': term.proc.pid, 'sid': e['id'], 'name': e['name'],
                         'short': thread[:8] if thread else 'new',
                         'status': core.codex_status(path) if path else 'idle', 'started': term.started,
                         'updated': datetime.fromtimestamp(modified) if modified else None,
                         'transcript': path, 'rank': rank})
        return rows

    def _find_threads(self, pending):
        """Gives each new rollout in WORK_DIR that no agents.json session has yet to the
        pending (entry, term) Codex tab that started just before its thread, saving it
        as the entry's "thread". When two such tabs started together, the rollout goes
        to the one whose latest Enter came just before the file appeared. Returns
        {entry id: thread} for the tabs given one."""
        claimed = {e.get('thread') for e in core.agents()}
        here = os.path.normcase(os.path.normpath(WORK_DIR))
        oldest = min(term.started for _, term in pending).timestamp() - 5
        found = {}
        for path in core.codex_rollouts():
            if core.mtime(path) < oldest:
                continue
            self._seen.setdefault(path, datetime.now())
            # A file this new may not have its first line yet, so only a read meta is kept.
            meta = self._metas.get(path) or core.rollout_meta(path)
            if not meta:
                continue
            self._metas[path] = meta
            if not meta['started'] or meta['id'] in claimed:
                continue
            if os.path.normcase(os.path.normpath(meta['cwd'])) != here:
                continue
            fits = [(e, term) for e, term in pending
                    if THREAD_MATCH[0] <= meta['started'] - term.started <= THREAD_MATCH[1]]
            if len(fits) > 1:
                seen = self._seen[path]
                # A copy: the page's thread appends to enters while this one reads.
                typed = [(max(t for t in list(term.enters) if t <= seen), e, term) for e, term in fits
                         if any(t <= seen for t in list(term.enters))]
                fits = [max(typed, key=lambda x: x[0])[1:]] if typed else []
            if not fits:
                continue
            e, term = fits[0]
            core.set_field(e['id'], 'thread', meta['id'])
            found[e['id']] = meta['id']
            claimed.add(meta['id'])
            pending = [p for p in pending if p[0]['id'] != e['id']]
            if not pending:
                break
        return found

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
            # Both lists come in agents.json order (rank); sorted() keeps the rest as they are.
            self._sessions = sorted(active_sessions() + self._codex_rows(), key=lambda s: s['rank'])
            for s in self._sessions:
                sid = s['sid']
                if not sid:
                    continue
                if 'transcript' in s:              # a Codex tab: its rollout, once it has one
                    self._transcripts[sid] = s['transcript']
                elif not self._transcripts.get(sid):
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
            # Codex: the limits its latest turn here wrote, and the models its picker lists.
            u['codex'] = core.codex_rate_limits()
            self._codex_models = core.codex_models()
            time.sleep(15)

    def _usage_view(self):
        """The usage panel as text and pie fractions."""
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
        # Codex's windows are named by length (the free plan has one, 30D).
        codex = ''
        if u['codex'] and u['codex']['windows']:
            parts_cx = [u['codex']['plan']] if u['codex']['plan'] else []
            for w in u['codex']['windows']:
                caption = window_caption(w['minutes'])
                pies.append((f'CODEX {caption}', w['used'] / 100))
                parts_cx.append(f"{caption} {w['used']:.0f}%" +
                                (f" · resets {w['reset']:%m-%d %H:%M}" if w['reset'] else ''))
            codex = ' · '.join(parts_cx)
        return {'total': format_tokens(block['total']), 'headline': headline, 'codex': codex,
                'detail': (f"new input {format_tokens(block['input'])} · output {format_tokens(block['output'])} · "
                           f"cache write {format_tokens(block['cacheCreate'])} · "
                           f"cache read {format_tokens(block['cacheRead'])}"),
                'week': f"{format_tokens(snap['today']['total'])} tokens / {week_total} tokens",
                'models': ' · '.join(parts),
                'pies': [{'caption': c, 'frac': f} for c, f in pies if f >= 0]}

    def _on_drop(self, event):
        # pywebview adds each dropped file's full path; the page only sees the names.
        files = (event.get('dataTransfer') or {}).get('files') or []
        paths = [f['pywebviewFullPath'] for f in files if f.get('pywebviewFullPath')]
        if paths:
            self._js(f'amc.dropFiles({json.dumps(paths)})')

    def _loaded(self):
        if not self._drop_hooked:
            self._drop_hooked = True
            self._window.dom.get_element('#terms').events.drop += DOMEventHandler(self._on_drop, True)

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
    window.events.loaded += api._loaded         # files dropped on the terminals
    webview.start(private_mode=False)      # keeps the page's saved column widths


if __name__ == '__main__':
    main()
