"""Remote access: two small web servers on this computer's Tailscale address.

- The phone page (port 8770): each tab's terminal or conversation, with a box to type into.
- The remote desktop page ("desktopPort", e.g. 8771): the whole Agent Mission Control
  window in another computer's browser, working as it does here.

Off unless hud-config.json has a "remote" block with a "token"; the desktop page also
needs "desktopPort". They listen on this computer's Tailscale address (or the block's
"host"), and every API call must carry the token, as the header X-AMC-Token. The pages
and scripts are served without it; they hold nothing private.
"""
import hmac
import json
import mimetypes
import os
import re
import tempfile
from datetime import datetime
from urllib.parse import unquote
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = 8770
STATIC = {'/': ('mobile.html', 'text/html; charset=utf-8'),
          '/xterm.js': ('vendor/xterm.js', 'text/javascript'),
          '/xterm.css': ('vendor/xterm.css', 'text/css')}
# The keys the page's buttons send: enough to answer a permission prompt.
KEYS = {'1': '1', '2': '2', '3': '3', 'enter': '\r', 'esc': '\x1b', 'up': '\x1b[A',
        'down': '\x1b[B', 'backspace': '\x7f', 'tab': '\t', 'shift-tab': '\x1b[Z'}
UPLOAD_MAX = 20 * 1024 * 1024             # bytes: one file sent from the phone
CHAT_MAX = 60                              # the latest messages the chat view gets
_chats = {}                                # transcript path -> (bytes read, [messages]), read on as it grows
_chats_lock = threading.Lock()


ANSWERED = 'Your questions have been answered:'


def question(q):
    """One AskUserQuestion question as text: the question, then its options numbered as
    Claude Code shows them (the number keys pick one), then Other."""
    lines = [f"❓ {q.get('header') + ': ' if q.get('header') else ''}{q.get('question', '')}"
             + (' (pick any)' if q.get('multiSelect') else '')]
    opts = q.get('options') or []
    for i, o in enumerate(opts, 1):
        lines.append(f"  {i}. {o.get('label', '')}" + (f" — {o['description']}" if o.get('description') else ''))
    lines.append(f'  {len(opts) + 1}. Other (type your own)')
    return '\n'.join(lines)


def claude_message(e):
    """(who, text) for a typed message or a reply in a Claude transcript line, else None.
    Tool calls, their results, thinking and Claude Code's own notes are left out, except
    the questions Claude asks with options (AskUserQuestion) and the answers to them."""
    if e.get('isSidechain') or e.get('isMeta') or e.get('isCompactSummary') or e.get('type') not in ('user', 'assistant'):
        return None
    c = (e.get('message') or {}).get('content')
    blocks = [{'type': 'text', 'text': c}] if isinstance(c, str) else (c or [])
    for b in blocks:
        if b.get('type') != 'tool_result':
            continue
        r = b.get('content')
        r = r if isinstance(r, str) else ' '.join(x.get('text', '') for x in r or [] if isinstance(x, dict))
        if not r.startswith(ANSWERED):
            return None
        answers = re.findall(r'"=\s*"(.*?)"(?:[,.]|\s+selected)', r, re.S)
        return ('user', '✅ ' + ' / '.join(a.strip() for a in answers) if answers else r[len(ANSWERED):].strip())
    asked = [question(q) for b in blocks if b.get('type') == 'tool_use' and b.get('name') == 'AskUserQuestion'
             for q in (b.get('input') or {}).get('questions') or []]
    text = '\n'.join([b.get('text', '') for b in blocks if b.get('type') == 'text'] + asked).strip()
    if e['type'] == 'user' and text.startswith('<bash-input>'):
        text = '! ' + text[len('<bash-input>'):].replace('</bash-input>', '')
    elif e['type'] == 'user' and text.startswith('<'):
        return None
    return (e['type'], text) if text else None


def asking(sid, transcript):
    """The question Claude session `sid` waits on, as chat text (question() for each), or ''.
    ask_hook.py keeps it in <temp>/amc-ask while it waits; one whose answer (or refusal, when
    Esc dismissed it and the hook could not remove the file) is in the transcript is over."""
    path = os.path.join(tempfile.gettempdir(), 'amc-ask', f'{sid}.json')
    try:
        with open(path, encoding='utf-8') as f:
            q = json.load(f)
    except (OSError, ValueError):
        return ''
    if q.get('id') and transcript:
        try:
            with open(transcript, 'rb') as f:
                f.seek(max(0, os.path.getsize(transcript) - 1024 * 1024))
                if f'"tool_use_id":"{q["id"]}"'.encode() in f.read():
                    return ''
        except OSError:
            pass
    return '\n'.join(question(x) for x in q.get('questions') or [])


def codex_message(e):
    """The same for a Codex rollout line: its user_message and agent_message events, or
    (newer Codex, 0.16x) its item_completed events for a UserMessage or AgentMessage."""
    p = e.get('payload') or {}
    if e.get('type') != 'event_msg':
        return None
    if p.get('type') == 'item_completed':
        item = p.get('item') or {}
        if item.get('type') not in ('UserMessage', 'AgentMessage'):
            return None
        text = '\n'.join(c.get('text', '') for c in item.get('content') or []
                         if isinstance(c, dict) and c.get('type') in ('text', 'Text')).strip()
        return ('user' if item['type'] == 'UserMessage' else 'assistant', text) if text else None
    if p.get('type') not in ('user_message', 'agent_message'):
        return None
    text = (p.get('message') or '').strip()
    return ('user' if p['type'] == 'user_message' else 'assistant', text) if text else None


def chat(path, parse):
    """[{'who', 'text'}] of the transcript at `path`, read from where the last call stopped."""
    with _chats_lock:
        return _chat(path, parse)


def _chat(path, parse):
    done, msgs = _chats.get(path, (0, []))
    try:
        with open(path, 'rb') as f:
            f.seek(done)
            data = f.read()
    except OSError:
        return msgs
    data = data[:data.rfind(b'\n') + 1]   # a line still being written waits for the next call
    for line in data.splitlines():
        try:
            m = parse(json.loads(line))
        except ValueError:
            continue
        if m:
            msgs.append({'who': m[0], 'text': m[1]})
    _chats[path] = (done + len(data), msgs)
    return msgs


def tailscale_ip():
    """This computer's Tailscale IPv4 address, or None when Tailscale is not installed or up."""
    try:
        out = subprocess.run(['tailscale', 'ip', '-4'], capture_output=True, text=True, timeout=10,
                             **({'creationflags': 0x08000000} if sys.platform == 'win32' else {}))
    except (OSError, subprocess.SubprocessError):
        return None
    lines = out.stdout.split()
    return lines[0] if out.returncode == 0 and lines else None


def start(api, conf, web_dir):
    """Serves the phone page in the background when `conf` (hud-config.json's "remote") has a
    token, and the remote desktop page too when it has a "desktopPort". Without a "host" it
    waits for Tailscale, checking every 30 seconds."""
    if not conf or not conf.get('token'):
        return

    def serve(port, make):
        while True:
            host = conf.get('host') or tailscale_ip()
            if host:
                try:
                    server = ThreadingHTTPServer((host, port), make(api, conf['token'], web_dir))
                except OSError as e:       # the address is gone or the port taken
                    print(f'remote: {host}:{port}: {e}', file=sys.stderr)
                else:
                    server.daemon_threads = True
                    server.serve_forever()
            time.sleep(30)

    threading.Thread(target=serve, args=(int(conf.get('port') or PORT), handler), daemon=True).start()
    if conf.get('desktopPort'):
        threading.Thread(target=serve, args=(int(conf['desktopPort']), desktop_handler), daemon=True).start()


# What the remote desktop page may not call: the ones that use this computer's screen.
NOT_REMOTE = {'paste_clipboard_image'}


def desktop_handler(api, token, web_dir):
    """The remote desktop page: web/index.html with remote-desktop.js in front of its scripts,
    which turns its window.pywebview.api calls into POST /api/call/<name> and runs what the
    window here is told (POST /api/poll)."""
    base = handler(api, token, web_dir)
    root = os.path.realpath(web_dir)

    class Desktop(base):
        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/':
                with open(os.path.join(web_dir, 'index.html'), encoding='utf-8') as f:
                    page = f.read().replace('<meta charset="utf-8">',
                                            '<meta charset="utf-8">\n<script src="remote-desktop.js"></script>', 1)
                return self.reply(200, page.encode(), 'text/html; charset=utf-8')
            # Any other file of web/, never outside it.
            name = os.path.realpath(os.path.join(root, path.lstrip('/')))
            if not name.startswith(root + os.sep) or not os.path.isfile(name):
                return self.reply(404, {'error': 'not found'})
            with open(name, 'rb') as f:
                self.reply(200, f.read(), mimetypes.guess_type(name)[0] or 'application/octet-stream')

        def do_POST(self):
            if not self.allowed():
                return
            try:
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
            except ValueError:
                return self.reply(400, {'error': 'bad json'})
            path = urlparse(self.path).path
            if path == '/api/poll':
                return self.reply(200, api._remote_poll(int(body.get('since', -1)), body.get('out') or {}))
            name = path[len('/api/call/'):] if path.startswith('/api/call/') else ''
            fn = getattr(api, name, None) if name and not name.startswith('_') and name not in NOT_REMOTE else None
            if not callable(fn):
                return self.reply(404, {'error': f'no {name or path}'})
            try:
                self.reply(200, {'result': fn(*(body.get('args') or []))})
            except Exception as e:
                self.reply(200, {'error': f'{type(e).__name__}: {e}'})

    return Desktop


def handler(api, token, web_dir):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, code, body, ctype='application/json'):
            if not isinstance(body, bytes):
                body = json.dumps(body).encode()
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def allowed(self):
            if hmac.compare_digest(self.headers.get('X-AMC-Token', ''), token):
                return True
            self.reply(403, {'error': 'wrong token'})
            return False

        def do_GET(self):
            url = urlparse(self.path)
            if url.path in STATIC:
                name, ctype = STATIC[url.path]
                with open(os.path.join(web_dir, name), 'rb') as f:
                    return self.reply(200, f.read(), ctype)
            if not url.path.startswith('/api/'):
                return self.reply(404, {'error': 'not found'})
            if not self.allowed():
                return
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == '/api/tabs':
                return self.reply(200, api._remote_tabs())
            if url.path == '/api/out':
                return self.reply(200, api._remote_out(q.get('id', ''), int(q.get('since') or 0)))
            if url.path == '/api/usage':
                return self.reply(200, api._remote_usage())
            if url.path == '/api/chat':
                return self.reply(200, api._remote_chat(q.get('id', ''), int(q.get('since') or 0)))
            self.reply(404, {'error': 'not found'})

        def upload(self):
            """A file from the phone (the request body; its name in X-File-Name), saved where a
            pasted image goes. Returns its path, which the page puts in its message box."""
            size = int(self.headers.get('Content-Length') or 0)
            if size > UPLOAD_MAX:
                return self.reply(413, {'error': f'over {UPLOAD_MAX // 1024 // 1024} MB'})
            data = self.rfile.read(size)
            name = os.path.basename(unquote(self.headers.get('X-File-Name') or 'file'))
            stem, ext = os.path.splitext(name)
            stem = re.sub(r'[^\w.-]+', '_', stem, flags=re.ASCII).strip('_.')[:60] or 'file'
            ext = re.sub(r'[^\w.]+', '', ext, flags=re.ASCII)[:10]
            folder = os.path.join(tempfile.gettempdir(), 'amc-paste')
            os.makedirs(folder, exist_ok=True)
            path = os.path.join(folder, f'phone-{datetime.now():%Y%m%d-%H%M%S-%f}-{stem}{ext}')
            with open(path, 'wb') as f:
                f.write(data)
            self.reply(200, {'path': path})

        def do_POST(self):
            if not self.allowed():
                return
            if self.path == '/api/upload':
                return self.upload()
            try:
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
            except ValueError:
                return self.reply(400, {'error': 'bad json'})
            tid = str(body.get('id', ''))
            if self.path == '/api/send':
                text = str(body.get('text', '')).strip()
                err = api._remote_send(tid, text) if text else 'empty'
            elif self.path == '/api/open':
                err = api._remote_open(tid)
            elif self.path == '/api/pin':
                text = str(body.get('text', '')).strip()
                err = api.pin(tid, text) if text else 'empty'
            elif self.path == '/api/unpin':
                err = api.unpin(tid, str(body.get('pin', '')))
            elif self.path == '/api/key':
                key = KEYS.get(body.get('key'))
                err = api._remote_key(tid, key) if key else 'unknown key'
            else:
                return self.reply(404, {'error': 'not found'})
            self.reply(200, {'error': err})

    return Handler
