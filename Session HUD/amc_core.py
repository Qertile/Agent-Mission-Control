"""What both Agent Mission Control windows share: paths, agents.json, the Claude Code
session registry, account usage and number formats. No UI and no tmux here, and
nothing Linux-only, so the web version runs it on Windows too."""

import glob
import json
import os
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # the package folder
TASK_DIR = os.path.join(ROOT, 'Task Manager')
TASKS_PATH = os.path.join(TASK_DIR, 'tasks.md')
XLSX_PATH = os.path.join(TASK_DIR, 'TaskDatabase.xlsx')
TASKS_SCRIPT = os.path.join(TASK_DIR, 'tasks.py')
CLAUDE_DIR = os.path.expanduser('~/.claude')
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
    return f'{h}h{m:02d}m' if h >= 1 else f'{m}m'


def format_uptime(started):
    if not started:
        return ''
    # Hours only, one decimal, no other unit: "25.1 hrs".
    return f'{(datetime.now() - started).total_seconds() / 3600:.1f} hrs'
