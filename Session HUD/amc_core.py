"""Agent Mission Control's data side: paths, agents.json, the Claude Code session
registry, Codex rollouts, Antigravity conversations, account usage and number formats. No UI here, and nothing
Linux-only, so it runs on Windows too."""

import glob
import json
import os
import re
import shutil
import sqlite3
import subprocess
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # the package folder
TASK_DIR = os.path.join(ROOT, 'Task Manager')
TASKS_PATH = os.path.join(TASK_DIR, 'tasks.md')
XLSX_PATH = os.path.join(TASK_DIR, 'TaskDatabase.xlsx')
TASKS_SCRIPT = os.path.join(TASK_DIR, 'tasks.py')
CLAUDE_DIR = os.path.expanduser('~/.claude')
CODEX_DIR = os.environ.get('CODEX_HOME') or os.path.expanduser('~/.codex')
AGY_DIR = os.path.expanduser('~/.gemini/antigravity-cli')
LAUNCHER_DIR = os.path.join(ROOT, 'Agents Launcher')
WORK_DIR = os.path.dirname(ROOT)                   # every agent tab starts here
CREATE_ON_SEND = {'Session Manager', 'Task Reminder'}  # opened (and added to agents.json) on first send
AGENTS_PATH = os.path.join(ROOT, 'agents.json')    # amc_web.py --agents points it elsewhere


def load_json(path):
    try:
        with open(path, encoding='utf-8-sig') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def agents():
    """The agents.json session list, read on every call so edits show at once."""
    return (load_json(AGENTS_PATH) or {}).get('sessions') or []


def save_agents(sessions):
    """Writes agents.json in its one-session-per-line layout."""
    lines = ',\n'.join('    { ' + json.dumps(s, ensure_ascii=False)[1:-1] + ' }' for s in sessions)
    with open(AGENTS_PATH + '.tmp', 'w', encoding='utf-8') as f:
        f.write('{\n  "sessions": [\n' + lines + '\n  ]\n}\n')
    os.replace(AGENTS_PATH + '.tmp', AGENTS_PATH)


def set_auto_open(sid, on):
    """Marks the agents.json session `sid` to open, or not, when Agent Mission Control starts."""
    sessions = agents()
    for s in sessions:
        if s.get('id') == sid:
            s['autoOpen'] = on
            save_agents(sessions)
            return


def set_field(sid, key, value):
    """Sets `key` of the agents.json session `sid`; an empty value removes it."""
    sessions = agents()
    for s in sessions:
        if s.get('id') == sid:
            if value:
                s[key] = value
            else:
                s.pop(key, None)
            save_agents(sessions)
            return


def set_model(sid, model):
    """Sets the model the agents.json session `sid` starts with; '' goes back to the tool's default."""
    set_field(sid, 'model', model)


def session_order():
    """(id, label) pairs from agents.json."""
    return [(s.get('id'), s.get('name')) for s in agents()]


def from_ms(ms):
    return datetime.fromtimestamp(int(ms) / 1000) if ms else None


def pid_alive(pid):
    if os.name != 'nt':
        return os.path.exists(f'/proc/{pid}')
    # os.kill(pid, 0) would end the process on Windows, so ask for its exit code instead.
    import ctypes
    k32 = ctypes.windll.kernel32
    handle = k32.OpenProcess(0x1000, False, int(pid))        # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        return False
    code = ctypes.c_ulong()
    ok = k32.GetExitCodeProcess(handle, ctypes.byref(code))
    k32.CloseHandle(handle)
    return bool(ok) and code.value == 259                    # STILL_ACTIVE


def active_sessions():
    """Registry entries whose process is still alive (a crash leaves its json behind)."""
    sessions = []
    for path in glob.glob(os.path.join(CLAUDE_DIR, 'sessions', '*.json')):
        data = load_json(path)
        if not data or not data.get('pid') or data.get('spare'):
            continue
        if not pid_alive(data['pid']):
            continue
        sid = str(data.get('sessionId') or '')
        name = data.get('name') or (sid[:8] if sid else f"pid {data['pid']}")
        sessions.append({'pid': int(data['pid']), 'sid': sid, 'name': str(name),
                         'status': str(data.get('status') or ''),
                         'started': from_ms(data.get('startedAt')),
                         'updated': from_ms(data.get('updatedAt'))})
    order = session_order()
    for s in sessions:
        s['rank'] = 1000
        for i, (sid, label) in enumerate(order):
            if sid == s['sid']:
                s['rank'], s['name'] = i, label
                break
    sessions.sort(key=lambda s: (s['started'] or datetime.min), reverse=True)
    sessions.sort(key=lambda s: s['rank'])
    return sessions


def transcript_path(sid):
    """The session's transcript under ~/.claude/projects, or '' when it has none yet."""
    hits = glob.glob(os.path.join(CLAUDE_DIR, 'projects', '*', f'{sid}.jsonl'))
    return hits[0] if hits else ''


# --- Codex. It keeps no registry of running sessions, so Agent Mission Control knows
# only the Codex tabs it runs; each session's transcript is a rollout file whose first
# line (session_meta) holds the thread id, cwd and start time. The id exists only once
# the first message is sent, so a new tab's thread is found afterwards (amc_web.py).

def codex_rollouts():
    return glob.glob(os.path.join(CODEX_DIR, 'sessions', '*', '*', '*', 'rollout-*.jsonl'))


def mtime(path):
    """The file's modified time, or 0 when it is gone."""
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0


def codex_rollout(thread):
    """The thread's rollout file, or '' when it has none."""
    hits = glob.glob(os.path.join(CODEX_DIR, 'sessions', '*', '*', '*', f'rollout-*-{thread}.jsonl'))
    return hits[0] if hits else ''


def local_time(iso):
    """An ISO UTC timestamp ('...Z') as a naive local datetime, or None."""
    try:
        return datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone().replace(tzinfo=None)
    except (AttributeError, ValueError):
        return None


def rollout_meta(path):
    """{'id', 'cwd', 'started'} from a rollout's session_meta line, or None."""
    try:
        with open(path, encoding='utf-8') as f:
            first = json.loads(f.readline())
    except (OSError, ValueError):
        return None
    meta = first.get('payload') or {}
    if first.get('type') != 'session_meta' or not meta.get('id'):
        return None
    return {'id': meta['id'], 'cwd': meta.get('cwd') or '', 'started': local_time(meta.get('timestamp'))}


def _tail_events(path, size=262144):
    """The rollout's last lines as parsed json, newest first (a partial first line is skipped)."""
    try:
        with open(path, 'rb') as f:
            f.seek(0, os.SEEK_END)
            f.seek(max(0, f.tell() - size))
            lines = f.read().decode('utf-8', 'replace').splitlines()
    except OSError:
        return []
    events = []
    for line in reversed(lines):
        try:
            events.append(json.loads(line))
        except ValueError:
            pass
    return events


def codex_status(path):
    """'busy' while a turn runs, otherwise 'idle'. Codex's approval prompts are not
    told apart yet, so a session waiting on one shows busy."""
    for e in _tail_events(path):
        kind = (e.get('payload') or {}).get('type') if e.get('type') == 'event_msg' else None
        if kind == 'task_started':
            return 'busy'
        if kind in ('task_complete', 'turn_aborted'):
            return 'idle'
    return 'idle'


def codex_rate_limits():
    """The account limits Codex wrote after its latest turn on this machine, or None:
    {'plan', 'windows': [{'minutes', 'used', 'reset'}]}. Use elsewhere shows up only
    after the next turn here."""
    for path in sorted(codex_rollouts(), key=mtime, reverse=True)[:5]:
        for e in _tail_events(path):
            payload = e.get('payload') or {}
            limits = payload.get('rate_limits') if payload.get('type') == 'token_count' else None
            if not limits:
                continue
            windows = []
            for key in ('primary', 'secondary'):
                w = limits.get(key)
                if w and w.get('window_minutes'):
                    at = w.get('resets_at')
                    windows.append({'minutes': int(w['window_minutes']), 'used': float(w.get('used_percent') or 0),
                                    'reset': datetime.fromtimestamp(at, timezone.utc).astimezone().replace(tzinfo=None)
                                    if at else None})
            return {'plan': limits.get('plan_type') or '', 'windows': windows}
    return None


def codex_models():
    """The model slugs Codex lists in its picker (from its models cache), or []."""
    data = load_json(os.path.join(CODEX_DIR, 'models_cache.json'))
    models = data.get('models') if isinstance(data, dict) else data
    return [m['slug'] for m in models or [] if isinstance(m, dict) and m.get('slug') and m.get('visibility') == 'list']


# --- Antigravity (`agy`). Like Codex it keeps no registry of running sessions. Each
# conversation is conversations/<id>.db (SQLite), made at its first message, and
# conversation_summaries.db lists each one's workspace (the folder it ran in).

def _sqlite_rows(path, sql, args=()):
    """The query's rows from a SQLite file opened read-only, or [] when it cannot be read."""
    try:
        con = sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=1)
        try:
            return con.execute(sql, args).fetchall()
        finally:
            con.close()
    except sqlite3.Error:
        return []


def agy_conversation(cid):
    """The conversation's file, or '' when it has none."""
    path = os.path.join(AGY_DIR, 'conversations', f'{cid}.db')
    return path if cid and os.path.exists(path) else ''


def agy_conversations():
    return glob.glob(os.path.join(AGY_DIR, 'conversations', '*.db'))


def agy_workspaces(cid):
    """The folders the conversation runs in, as local paths ([] when not listed yet)."""
    rows = _sqlite_rows(os.path.join(AGY_DIR, 'conversation_summaries.db'),
                        'select workspace_uris from conversation_summaries where conversation_id = ?', (cid,))
    try:
        uris = json.loads(rows[0][0]) if rows else []
    except ValueError:
        return []
    return [urllib.request.url2pathname(u[len('file://'):]) for u in uris if u.startswith('file://')]


def agy_status(path):
    """'busy' while a turn runs, otherwise 'idle'. A turn ends with a finished model
    reply (step type 15, status 3); its steps while it runs have status 8. Between the
    message and the reply every step is finished, so then the file's last write tells:
    a turn left unanswered (stopped with Esc) shows idle a minute later."""
    rows = _sqlite_rows(path, 'select step_type, status from steps order by idx desc limit 1')
    if not rows:
        return 'idle'
    kind, status = rows[0]
    if status == 8:
        return 'busy'
    if kind != 15 and datetime.now().timestamp() - max(mtime(path), mtime(path + '-wal')) < 60:
        return 'busy'
    return 'idle'


def agy_models():
    """The model ids `agy models` lists (it asks the server, so a few seconds), or []."""
    exe = shutil.which('agy')
    if not exe:
        return []
    try:
        out = subprocess.run([exe, 'models'], capture_output=True, text=True, timeout=30,
                             stdin=subprocess.DEVNULL).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    return [line.split('\t')[0] for line in out.splitlines() if '\t' in line]


def parse_agy_usage(screen):
    """agy's /usage screen (escape codes removed) as [{'group', 'used', 'reset'}], or
    None when it is not there. Each model group has a weekly limit, shown as
    'Weekly Limit Remaining ... 94.85%' then 'Refreshes in 167h 37m' (or 'Quota
    available' when untouched)."""
    groups = []
    parts = re.split(r'\b([A-Z][A-Z ]*MODELS)\b', screen)
    for name, body in zip(parts[1::2], parts[2::2]):
        pct = re.search(r'([\d.]+)%', body)
        if 'Weekly Limit' not in body or not pct:
            continue
        reset = re.search(r'Refreshes in (?:(\d+)h)?\s*(?:(\d+)m)?', body)
        at = None
        if reset and (reset.group(1) or reset.group(2)):
            at = datetime.now() + timedelta(hours=int(reset.group(1) or 0), minutes=int(reset.group(2) or 0))
        groups.append({'group': name.replace(' MODELS', '').strip(), 'used': 100 - float(pct.group(1)),
                       'reset': at})
    return groups or None


def account_usage():
    """The account-wide 5-hour and weekly utilization the Claude app and /usage show.

    Uses the OAuth token Claude Code keeps in .credentials.json; it goes nowhere
    but Anthropic's usage endpoint and is never shown.
    """
    cred = load_json(os.path.join(CLAUDE_DIR, '.credentials.json'))
    if not cred:
        raise RuntimeError('no .credentials.json')
    token = (cred.get('claudeAiOauth') or {}).get('accessToken')
    if not token:
        raise RuntimeError('no OAuth token in .credentials.json')
    req = urllib.request.Request('https://api.anthropic.com/api/oauth/usage', headers={
        'Authorization': f'Bearer {token}', 'anthropic-beta': 'oauth-2025-04-20',
        'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)

    def reset(block):
        at = (data.get(block) or {}).get('resets_at')
        return datetime.fromisoformat(at.replace('Z', '+00:00')).astimezone().replace(tzinfo=None) if at else None
    return {'five_hour': float(data['five_hour']['utilization']), 'five_hour_reset': reset('five_hour'),
            'week': float(data['seven_day']['utilization']), 'week_reset': reset('seven_day')}


def format_tokens(v):
    v = float(v or 0)
    if v >= 1_000_000:
        return f'{v / 1_000_000:,.1f}M'
    if v >= 1000:
        return f'{v / 1000:,.1f}K'
    return f'{v:,.0f}'


def format_remaining(seconds):
    if seconds <= 0:
        return 'resetting'
    h, m = int(seconds // 3600), int(seconds % 3600 // 60)
    if h >= 24:
        return f'{h // 24}d{h % 24}h'
    return f'{h}h{m:02d}m' if h >= 1 else f'{m}m'


def format_uptime(started):
    if not started:
        return ''
    # Hours only, one decimal, no other unit: "25.1 hrs".
    return f'{(datetime.now() - started).total_seconds() / 3600:.1f} hrs'
