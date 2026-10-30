"""Phone access: a small web server showing each tab's terminal, with a box to type into.

Off unless hud-config.json has a "remote" block with a "token". It listens on this
computer's Tailscale address (or the block's "host"), and every API call must carry the
token, as the header X-AMC-Token. The page and xterm.js are served without it; they
hold nothing private.
"""
import hmac
import json
import os
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
CHAT_MAX = 60                              # the latest messages the chat view gets
_chats = {}                                # transcript path -> (bytes read, [messages]), read on as it grows
_chats_lock = threading.Lock()


def claude_message(e):
    """(who, text) for a typed message or a reply in a Claude transcript line, else None.
    Tool calls, their results, thinking and Claude Code's own notes are left out."""
    if e.get('isSidechain') or e.get('isMeta') or e.get('isCompactSummary') or e.get('type') not in ('user', 'assistant'):
        return None
    c = (e.get('message') or {}).get('content')
    blocks = [{'type': 'text', 'text': c}] if isinstance(c, str) else (c or [])
    if any(b.get('type') == 'tool_result' for b in blocks):
        return None
    text = '\n'.join(b.get('text', '') for b in blocks if b.get('type') == 'text').strip()
    if e['type'] == 'user' and text.startswith('<bash-input>'):
        text = '! ' + text[len('<bash-input>'):].replace('</bash-input>', '')
    elif e['type'] == 'user' and text.startswith('<'):
        return None
    return (e['type'], text) if text else None


def codex_message(e):
    """The same for a Codex rollout line: its user_message and agent_message events."""
    p = e.get('payload') or {}
    if e.get('type') != 'event_msg' or p.get('type') not in ('user_message', 'agent_message'):
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
    """Serves the phone page in the background when `conf` (hud-config.json's "remote") has a token.
    Without a "host" it waits for Tailscale, checking every 30 seconds."""
    if not conf or not conf.get('token'):
        return

    def serve():
        while True:
            host = conf.get('host') or tailscale_ip()
            if host:
                try:
                    server = ThreadingHTTPServer((host, int(conf.get('port') or PORT)),
                                                 handler(api, conf['token'], web_dir))
                except OSError as e:       # the address is gone or the port taken
                    print(f'remote: {host}: {e}', file=sys.stderr)
                else:
                    server.daemon_threads = True
                    server.serve_forever()
            time.sleep(30)

    threading.Thread(target=serve, daemon=True).start()


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

        def do_POST(self):
            if not self.allowed():
                return
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
            elif self.path == '/api/key':
                key = KEYS.get(body.get('key'))
                err = api._remote_key(tid, key) if key else 'unknown key'
            else:
                return self.reply(404, {'error': 'not found'})
            self.reply(200, {'error': err})

    return Handler
