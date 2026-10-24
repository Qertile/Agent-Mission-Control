"""Agent Mission Control for Linux: the counterpart of show-session-hud.ps1.

Task list on the left, live Claude Code sessions on the right with a 60-second
activity sparkline per session, and 5-hour / weekly usage on top.

Sessions come from the registry Claude Code keeps in ~/.claude/sessions; names
and order from agents.json in the package folder. The chat boxes type a line
into a session through tmux: the Agents Launcher starts every agent inside the
"amc" tmux server, so a session is reached by finding the tmux pane its
process runs in. No window has to be brought to the front.
"""

import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import tkinter as tk
import tkinter.font as tkfont
import uuid
from collections import deque
from datetime import date, datetime, timedelta, timezone
from queue import Queue, Empty

from amc_core import (HERE, TASKS_PATH, XLSX_PATH, TASKS_SCRIPT, LAUNCHER_DIR, WORK_DIR,
                      CREATE_ON_SEND, TASK_DIR, load_json, agents, save_agents, set_auto_open,
                      active_sessions, transcript_path, account_usage, format_tokens,
                      format_remaining, format_uptime)

TMUX = ['tmux', '-L', 'amc']

sys.path.insert(0, TASK_DIR)
import tasks  # noqa: E402
from single_instance import replace_previous  # noqa: E402

BG = '#060a06'
BAR = '#0a100a'
ACCENT = '#33ff66'
TITLE = '#8cff8c'
DESC = '#46a05a'
NOTE = '#5a9664'
SPARK_FILL = '#124d20'          # the Windows fill: 70/255 of the accent over the background
FONT = 'DejaVu Sans Mono'
ACTIVITY_WINDOW = 60

# The layout is in pixels at 100 % scale; on a scaled desktop (Xft.dpi 192 = 200 %)
# every size is multiplied, and fonts are given in pixels so Tk cannot scale them twice.
S = 1.0


def px(n):
    return int(round(n * S))


def display_scale():
    try:
        out = subprocess.run(['xrdb', '-query'], capture_output=True, text=True, timeout=5).stdout
        m = re.search(r'^Xft\.dpi:\s*([\d.]+)', out, re.M)
        return max(1.0, float(m.group(1)) / 96) if m else 1.0
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return 1.0


def primary_monitor(root):
    """(x, y, width, height) of the primary monitor, or the whole screen."""
    try:
        out = subprocess.run(['xrandr', '--listactivemonitors'], capture_output=True, text=True, timeout=5).stdout
        m = re.search(r'\*\S*\s+(\d+)/\d+x(\d+)/\d+\+(\d+)\+(\d+)', out)
        if m:
            w, h, x, y = map(int, m.groups())
            return x, y, w, h
    except (OSError, subprocess.TimeoutExpired):
        pass
    return 0, 0, root.winfo_screenwidth(), root.winfo_screenheight()


def font(pt, **kw):
    return tkfont.Font(family=FONT, size=-px(pt * 96 / 72), **kw)

STATUS_COLORS = {'busy': '#00dcff', 'running': '#00dcff', 'waiting': '#ffc400', 'idle': '#8cff8c'}
TASK_STATUS_COLORS = {'Ongoing': '#00dcff', 'Checking': '#ffc400'}
GREY = '#8c96a0'


# --- typing into a session ------------------------------------------------------

def parent_pid(pid):
    try:
        with open(f'/proc/{pid}/stat') as f:
            return int(f.read().rsplit(')', 1)[1].split()[1])
    except (OSError, IndexError, ValueError):
        return 0


def find_pane(pid):
    """The tmux pane (in the "amc" server) whose process tree holds `pid`, or None."""
    try:
        out = subprocess.run(TMUX + ['list-panes', '-a', '-F', '#{pane_pid} #{pane_id}'],
                             capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    panes = dict(line.split() for line in out.splitlines() if line.strip())
    while pid > 1:
        if str(pid) in panes:
            return panes[str(pid)]
        pid = parent_pid(pid)
    return None


def tmux_name(name):
    # tmux reads "." and ":" in a target as window/pane separators.
    return name.replace('.', '_').replace(':', '_')


def terminal_env():
    """The environment for a gnome-terminal call that adds its tab to the window already
    showing an agent, or None when none is shown. gnome-terminal --tab opens a new window
    unless GNOME_TERMINAL_SCREEN names a terminal to open beside; a tmux client of the
    "amc" server runs in such a terminal and still has it in its environment."""
    try:
        out = subprocess.run(TMUX + ['list-clients', '-F', '#{client_pid}'],
                             capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    for pid in out.split():
        try:
            with open(f'/proc/{pid}/environ', 'rb') as f:
                pairs = [v.decode(errors='replace').split('=', 1) for v in f.read().split(b'\0') if b'=' in v]
        except OSError:
            continue
        found = {k: v for k, v in pairs if k in ('GNOME_TERMINAL_SCREEN', 'GNOME_TERMINAL_SERVICE')}
        if len(found) == 2:
            return {**os.environ, **found}
    return None


def wait_for_client(name, timeout=5):
    """Waits until a terminal is attached to the tmux session `name`."""
    end = time.time() + timeout
    while time.time() < end:
        out = subprocess.run(TMUX + ['list-clients', '-F', '#{session_name}'], capture_output=True, text=True).stdout
        if tmux_name(name) in out.splitlines():
            return
        time.sleep(0.2)


def open_session(name):
    """Opens `name` in a terminal tab the way the Agents Launcher does, adding it to
    agents.json with a new session id first if it is not listed there yet."""
    sessions = agents()
    entry = next((s for s in sessions if s.get('name') == name), None)
    if not entry:
        entry = {'name': name, 'id': str(uuid.uuid4()), 'window': 1}
        save_agents(sessions + [entry])
    inner = TMUX + ['-f', os.path.join(LAUNCHER_DIR, 'tmux.conf'), 'new-session', '-A', '-s', tmux_name(name),
                    '-c', WORK_DIR, os.path.join(LAUNCHER_DIR, 'agent.sh'), entry['id'], name]
    subprocess.Popen(['gnome-terminal', '--tab', f'--title={name}', f'--working-directory={WORK_DIR}', '--', *inner],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=terminal_env())


def open_auto_sessions():
    """Opens every agents.json session marked "autoOpen" (the default) that has no tab: not
    running yet, or still alive in tmux with no terminal attached (re-attached, not restarted)."""
    running = {s['sid'] for s in active_sessions()}
    out = subprocess.run(TMUX + ['list-sessions', '-F', '#{session_attached} #{session_name}'],
                         capture_output=True, text=True).stdout       # empty when no tmux server
    attached = {line.split(' ', 1)[1]: line.split(' ', 1)[0] != '0' for line in out.splitlines()}
    for s in agents():
        if not s.get('autoOpen', True):
            continue
        name = tmux_name(s['name'])
        if name in attached:
            if attached[name]:
                continue      # already shown in a tab
        elif s.get('id') in running:
            continue          # running outside tmux, nothing to attach to
        open_session(s['name'])
        # The next tab joins this one's window, and keeps agents.json order.
        wait_for_client(s['name'])


def terminate_session(pid):
    """Ends the Claude session `pid`: its whole tmux session (closing the tab) when it runs
    in one, otherwise just the process."""
    pane = find_pane(pid)
    if pane:
        subprocess.run(TMUX + ['kill-session', '-t', pane], stderr=subprocess.DEVNULL)
    else:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass


def close_all_sessions():
    """Ends every agent tab: the whole "amc" tmux server, so each claude ends and its tab closes."""
    subprocess.run(TMUX + ['kill-server'], stderr=subprocess.DEVNULL)


def wait_for_session(name, timeout=90):
    """The session named `name` once it is registered, inside tmux and idle at its prompt, or None."""
    end = time.time() + timeout
    while time.time() < end:
        for s in active_sessions():
            if s['name'] == name and s['status'] == 'idle' and find_pane(s['pid']):
                time.sleep(1)     # let the prompt finish drawing before typing into it
                return s
        time.sleep(1)
    return None


def send_to_session(name, text):
    """Type `text` and Enter into the session shown as `name`. Returns None or what went wrong."""
    match = [s for s in active_sessions() if s['name'] == name]
    if not match and name in CREATE_ON_SEND:
        open_session(name)
        found = wait_for_session(name)
        if not found:
            return f"opened '{name}' - answer its tab, then send again"
        match = [found]
    if not match:
        return f"no '{name}' tab open"
    pane = find_pane(match[0]['pid'])
    if not pane:
        return f"'{name}' was not started by Agents Launcher"
    run = lambda *args: subprocess.run(TMUX + ['send-keys', '-t', pane, *args], timeout=5).returncode
    # A newline inside the text is typed the way Claude Code documents it for any
    # terminal: a backslash, then Enter.
    lines = text.splitlines()
    for n, line in enumerate(lines):
        chunk = line + '\\' if n < len(lines) - 1 else line
        if chunk and run('-l', '--', chunk) != 0:
            return 'tmux send-keys failed'
        # Enter on its own after a pause, so it lands as a submit, not as part of the typed text.
        time.sleep(0.3)
        run('Enter')
        time.sleep(0.15)
    return None


def wrap(text, font, width):
    if not text:
        return ['']
    lines, line = [], ''
    for w in text.split(' '):
        test = w if line == '' else f'{line} {w}'
        if font.measure(test) > width and line != '':
            lines.append(line)
            line = w
        else:
            line = test
    if line:
        lines.append(line)
    return lines or ['']


class DuePicker(tk.Toplevel):
    """A small month calendar; picking a day calls `on_pick(date)`."""

    def __init__(self, master, x, y, current, on_pick):
        super().__init__(master, bg=BAR)
        self.title('Due date')
        self.transient(master)
        self.resizable(False, False)
        self.geometry(f'+{x}+{y}')
        self.on_pick, self.current = on_pick, current
        self.month = current.replace(day=1)
        self.font = font(11)
        self.bind('<Escape>', lambda e: self.destroy())
        self.bind('<FocusOut>', lambda e: self.after(150, self._close_if_unfocused))
        self.draw()
        self.focus_force()

    def _close_if_unfocused(self):
        try:
            if self.focus_get() is None:
                self.destroy()
        except (KeyError, tk.TclError):
            self.destroy()

    def shift(self, months):
        y, m = divmod(self.month.month - 1 + months, 12)
        self.month = date(self.month.year + y, m + 1, 1)
        self.draw()

    def draw(self):
        for w in self.winfo_children():
            w.destroy()
        head = tk.Frame(self, bg=BAR)
        head.grid(row=0, column=0, columnspan=7, sticky='ew', pady=(px(4), px(2)))
        tk.Button(head, text='<', command=lambda: self.shift(-1), bg=BAR, fg=ACCENT, relief='flat',
                  activebackground=BG, activeforeground=ACCENT, font=self.font, bd=0).pack(side='left', padx=px(6))
        tk.Button(head, text='>', command=lambda: self.shift(1), bg=BAR, fg=ACCENT, relief='flat',
                  activebackground=BG, activeforeground=ACCENT, font=self.font, bd=0).pack(side='right', padx=px(6))
        tk.Label(head, text=self.month.strftime('%Y-%m'), bg=BAR, fg=ACCENT, font=font(11, weight='bold')).pack()
        for c, d in enumerate(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']):
            tk.Label(self, text=d, bg=BAR, fg=DESC, font=self.font, width=3).grid(row=1, column=c)
        day = self.month - timedelta(days=self.month.weekday())
        today = date.today()
        for r in range(6):
            for c in range(7):
                fg = TITLE if day.month == self.month.month else NOTE
                bg = ACCENT if day == self.current else (BG if day == today else BAR)
                lab = tk.Label(self, text=str(day.day), bg=bg, fg=BG if day == self.current else fg,
                               font=self.font, width=3, cursor='hand2')
                lab.grid(row=r + 2, column=c, padx=1, pady=1)
                lab.bind('<Button-1>', lambda e, d=day: self.pick(d))
                day += timedelta(days=1)

    def pick(self, d):
        self.destroy()
        self.on_pick(d)


class MissionControl:
    def __init__(self, root):
        self.root = root
        self.config = load_json(os.path.join(HERE, 'hud-config.json')) or {}
        self.ui = Queue()                     # work done off the UI thread hands results back here
        self.samples, self.transcripts, self.last_len = {}, {}, {}
        self.usage = {'snap': None, 'fetched': None, 'failed': False, 'week': None, 'week_at': None,
                      'account': None, 'account_at': None, 'account_error': None}
        self.rows, self.layout, self.selected = [], [], None
        self.session_target = 'Session Manager'
        self.task_sig = None

        self.f_grid = font(12)
        self.f_bold = font(12, weight='bold')
        self.f_usage = font(13)
        self.f_big = font(20, weight='bold')
        self.f_note = font(9, slant='italic')
        self.f_caption = font(9, weight='bold')

        root.title('Agent Mission Control')
        mx, my, mw, mh = primary_monitor(root)
        w, h = min(px(1461), int(mw * 0.95)), min(px(805), int(mh * 0.9))
        root.geometry(f'{w}x{h}+{mx + (mw - w) // 2}+{my + (mh - h) // 2}')
        root.minsize(px(700), px(400))
        root.configure(bg=BG)
        try:
            root.attributes('-alpha', 0.92)
        except tk.TclError:
            pass
        tk.Frame(root, bg=ACCENT, height=px(2)).pack(side='top', fill='x')
        body = tk.Frame(root, bg=BG)
        body.pack(fill='both', expand=True)
        self.build_tasks(body)
        tk.Frame(body, bg=BAR, width=px(2)).pack(side='left', fill='y')
        self.build_sessions(body)

        root.after(100, self.drain_ui)
        root.after(200, self.start)

    # --- layout ----------------------------------------------------------------

    def header(self, parent, text):
        tk.Label(parent, text=text, bg=BAR, fg=ACCENT, font=self.f_bold, anchor='w',
                 padx=px(8), height=1, pady=px(4)).pack(side='top', fill='x')

    def input_row(self, parent, caption, target):
        row = tk.Frame(parent, bg=BAR, padx=px(8), pady=px(5))
        row.pack(side='bottom', fill='x')
        head = tk.Frame(row, bg=BAR)
        head.pack(side='top', fill='x')
        cap = tk.Label(head, text=caption, bg=BAR, fg=ACCENT, font=self.f_caption)
        cap.pack(side='left')
        status = tk.Label(head, text='', bg=BAR, fg=NOTE, font=self.f_note)
        status.pack(side='right')
        # Two lines, no scrollbar: the box follows the caret as you type.
        box = tk.Text(row, bg=BG, fg=TITLE, insertbackground=ACCENT, font=self.f_grid, relief='flat',
                      highlightthickness=1, highlightbackground=DESC, highlightcolor=ACCENT,
                      height=2, wrap='word', padx=px(2), pady=px(2))
        box.pack(side='top', fill='x', pady=(px(3), 0))
        # Enter sends, Shift+Enter is a newline.
        box.bind('<Return>', lambda e: self.send(box, status, target()))
        box.bind('<Shift-Return>', lambda e: self.newline(box))
        # Up on the first line / Down on the last line walk the lines sent from this
        # box, like a shell history; send() appends to it. Index == len(history): a new line.
        box.history, box.hist_index = [], 0
        box.bind('<Up>', lambda e: self.walk_history(box, -1))
        box.bind('<Down>', lambda e: self.walk_history(box, 1))
        return cap, status, box

    def newline(self, box):
        box.insert('insert', '\n')
        box.see('insert')
        return 'break'

    def walk_history(self, box, step):
        # count() gives None for 0, else a 1-tuple.
        above = (box.count('1.0', 'insert', 'displaylines') or (0,))[0]
        below = (box.count('insert', 'end-1c', 'displaylines') or (0,))[0]
        if (above if step < 0 else below):
            return None               # not on the first / last line: move the caret as usual
        i = box.hist_index + step
        if 0 <= i <= len(box.history):
            box.hist_index = i
            box.delete('1.0', 'end')
            box.insert('1.0', box.history[i] if i < len(box.history) else '')
            box.mark_set('insert', 'end-1c')
            box.see('insert')
        return 'break'

    def send(self, box, status, name):
        text = box.get('1.0', 'end-1c').strip()
        if not text:
            return 'break'
        status.configure(text='sending...')

        def work():
            try:
                err = send_to_session(name, text)
            except Exception as e:      # tmux missing, timeout ...
                err = str(e)

            def done():
                if err:
                    status.configure(text=err)
                else:
                    box.history.append(text)
                    box.hist_index = len(box.history)
                    box.delete('1.0', 'end')
                    status.configure(text='sent ' + datetime.now().strftime('%H:%M:%S'))
            self.ui.put(done)
        threading.Thread(target=work, daemon=True).start()
        return 'break'

    def build_tasks(self, parent):
        panel = tk.Frame(parent, bg=BG, width=px(360))
        panel.pack(side='left', fill='y')
        panel.pack_propagate(False)
        self.header(panel, 'Tasks')
        self.input_row(panel, 'to Task Reminder', lambda: 'Task Reminder')
        self.task_note = tk.Label(panel, text='', bg=BG, fg=NOTE, font=self.f_note, anchor='w', padx=px(10))
        self.task_note.pack(side='bottom', fill='x')
        frame = tk.Frame(panel, bg=BG)
        frame.pack(fill='both', expand=True, padx=(px(10), 0), pady=(px(8), px(4)))
        scroll = tk.Scrollbar(frame, bg=BAR, troughcolor=BG, activebackground=ACCENT, relief='flat',
                              bd=0, width=px(10), highlightthickness=0, elementborderwidth=0)
        self.task_box = tk.Text(frame, bg=BG, fg=TITLE, font=self.f_grid, relief='flat', bd=0,
                                highlightthickness=0, wrap='word', cursor='arrow',
                                selectbackground=BAR, selectforeground=ACCENT, yscrollcommand=scroll.set)
        scroll.configure(command=self.task_box.yview)
        scroll.pack(side='right', fill='y')
        self.task_box.pack(side='left', fill='both', expand=True)
        tb = self.task_box
        tb.tag_configure('title', foreground=TITLE)
        tb.tag_configure('desc', foreground=DESC)
        tb.tag_configure('note', foreground=NOTE)
        for name, color in list(TASK_STATUS_COLORS.items()) + [('other', GREY), ('none', NOTE)]:
            tb.tag_configure(f'st-{name}', foreground=color, font=self.f_bold)
        tb.tag_configure('click', underline=False)
        tb.tag_bind('click', '<Enter>', lambda e: tb.configure(cursor='hand2'))
        tb.tag_bind('click', '<Leave>', lambda e: tb.configure(cursor='arrow'))
        tb.configure(state='disabled')

        self.status_menu = tk.Menu(self.root, tearoff=0, bg=BAR, fg=TITLE, activebackground=BG,
                                   activeforeground=ACCENT, font=self.f_grid, bd=0)
        for name in ('Pending', 'Ongoing', 'Checking', 'Finished'):
            self.status_menu.add_command(label=name, command=lambda n=name: self.set_task_status(n))

    def build_sessions(self, parent):
        panel = tk.Frame(parent, bg=BG)
        panel.pack(side='left', fill='both', expand=True)
        self.header(panel, 'Session Monitor')
        self.session_caption, self.session_status, self.session_box = \
            self.input_row(panel, 'to Session Manager', lambda: self.session_target)
        self.usage_canvas = tk.Canvas(panel, bg=BG, height=px(140), highlightthickness=0)
        self.usage_canvas.pack(side='top', fill='x')
        self.usage_canvas.bind('<Configure>', lambda e: self.draw_usage())

        self.note = tk.Label(panel, text='', bg=BG, fg=NOTE, font=self.f_note, anchor='w', padx=px(10))
        self.note.pack(side='bottom', fill='x')
        self.grid_head = tk.Canvas(panel, bg=BAR, height=px(30), highlightthickness=0)
        self.grid_head.pack(side='top', fill='x')
        frame = tk.Frame(panel, bg=BG)
        frame.pack(fill='both', expand=True)
        scroll = tk.Scrollbar(frame, bg=ACCENT, troughcolor=BAR, activebackground=ACCENT, relief='flat',
                              bd=0, width=px(12), highlightthickness=0, elementborderwidth=0)
        self.grid = tk.Canvas(frame, bg=BG, highlightthickness=0, yscrollincrement=px(30),
                              yscrollcommand=scroll.set)
        scroll.configure(command=self.grid.yview)
        scroll.pack(side='right', fill='y')
        self.grid.pack(side='left', fill='both', expand=True)
        self.grid.bind('<Configure>', lambda e: self.draw_grid())
        self.grid.bind('<Button-1>', self.grid_click)
        self.grid.bind('<Double-Button-1>', self.grid_double)
        # On release: on X11 a menu posted on press takes the release as a pick and closes.
        self.grid.bind('<ButtonRelease-3>', self.grid_menu)
        self.grid.bind('<Control-c>', lambda e: self.copy_rows(all_rows=False))
        for seq, step in (('<Button-4>', -1), ('<Button-5>', 1)):
            self.grid.bind(seq, lambda e, s=step: self.grid.yview_scroll(s, 'units'))
        self.grid.bind('<MouseWheel>', lambda e: self.grid.yview_scroll(-1 if e.delta > 0 else 1, 'units'))

        self.copy_menu = tk.Menu(self.root, tearoff=0, bg=BAR, fg=TITLE, activebackground=BG,
                                 activeforeground=ACCENT, font=self.f_grid, bd=0)
        self.copy_menu.add_command(label='Copy', command=lambda: self.copy_rows(all_rows=False))
        self.copy_menu.add_command(label='Copy all rows', command=lambda: self.copy_rows(all_rows=True))
        self.copy_menu.add_separator()
        self.auto_open = tk.BooleanVar(value=True)
        self.copy_menu.add_checkbutton(label='Open on start', variable=self.auto_open, selectcolor=ACCENT,
                                       command=lambda: set_auto_open(self.menu_sid, self.auto_open.get()))
        self.copy_menu.add_command(label='Terminate', command=self.terminate_menu)
        self.menu_sid = None
        self.menu_pid = None

    # --- timers ------------------------------------------------------------------

    def start(self):
        self.refresh_grid()
        threading.Thread(target=self.usage_loop, daemon=True).start()
        self.every(1000, self.activity_tick)
        self.every(3000, self.refresh_grid)
        self.refresh_tasks()
        self.every(30000, self.refresh_tasks)

    def every(self, ms, fn):
        def tick():
            try:
                fn()
            finally:
                self.root.after(ms, tick)
        self.root.after(ms, tick)

    def drain_ui(self):
        try:
            while True:
                self.ui.get_nowait()()
        except Empty:
            pass
        self.root.after(100, self.drain_ui)

    # --- usage -------------------------------------------------------------------

    def usage_loop(self):
        """Runs off the UI thread: the scans and the account fetch can take seconds."""
        u = self.usage
        scanner = os.path.join(HERE, 'scan-usage.py')
        while True:
            now = datetime.now()
            # The weekly total reads up to seven days of transcripts, so only every 5 min.
            if not u['week_at'] or (now - u['week_at']).total_seconds() >= 300:
                week_file = os.path.join(HERE, 'week-usage.json')
                day = self.config.get('weekResetWeekday', 4)
                hour = self.config.get('weekResetHour', 21)
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
            self.ui.put(self.draw_usage)
            time.sleep(15)

    def draw_usage(self):
        c = self.usage_canvas
        c.delete('all')
        W, H = c.winfo_width(), c.winfo_height()
        u, snap = self.usage, self.usage['snap']
        x, y = px(12), px(8)
        value_x = x + px(180)
        if not snap:
            msg = 'USAGE  scanner unavailable (needs python3)' if u['failed'] else 'USAGE  scanning...'
            c.create_text(x, y, text=msg, anchor='nw', fill=NOTE, font=self.f_usage)
        else:
            block = snap['block']
            c.create_text(x, y + px(8), text='5H BLOCK', anchor='nw', fill=ACCENT, font=self.f_bold)
            c.create_text(value_x, y, text=format_tokens(block['total']), anchor='nw', fill=TITLE, font=self.f_big)
            headline = f"tokens · {block['requests']} req"
            # Reset time from the account when known: the block the account is in is what counts.
            acct = u['account']
            if acct and acct['five_hour_reset']:
                left = format_remaining(max(0, (acct['five_hour_reset'] - datetime.now()).total_seconds()))
                headline += f" · resets {acct['five_hour_reset']:%H:%M} · {left} left"
            elif snap.get('blockEnd'):
                to = datetime.fromisoformat(snap['blockEnd'])
                headline += f" · resets {to:%H:%M} · {format_remaining(snap['blockSecondsLeft'] or 0)} left"
            else:
                headline += ' · no block running'
            c.create_text(x + px(300), y + px(8), text=headline, anchor='nw', fill=DESC, font=self.f_usage)

            y += px(38)
            cap5h, cap_week = float(self.config.get('costCap5h') or 0), float(self.config.get('costCapWeek') or 0)
            if acct or cap5h > 0:
                # Two pies, upper right: the account's own percentages when they could be
                # fetched, otherwise this machine's spend against the caps in hud-config.json.
                if acct:
                    pies = [('5H', acct['five_hour'] / 100), ('WEEK', acct['week'] / 100)]
                else:
                    used5h = snap.get('blockCost')
                    used5h = block['total'] if used5h is None else used5h
                    week = u['week'] or {}
                    used_wk = week.get('cost', week.get('total', 0)) or 0
                    pies = [('5H', used5h / cap5h if cap5h > 0 else -1),
                            ('WEEK', used_wk / cap_week if cap_week > 0 else -1)]
                d, gap, py = px(64), px(34), px(30)
                for k, (caption, frac) in enumerate(pies):
                    if frac < 0:
                        continue
                    frac = min(1.0, frac)
                    fill = '#ff5a5a' if frac >= 0.9 else '#ffc400' if frac >= 0.7 else ACCENT
                    pie_x = W - px(24) - (len(pies) - k) * d - (len(pies) - 1 - k) * gap
                    c.create_oval(pie_x, py, pie_x + d, py + d, fill=BAR, outline='')
                    if frac >= 0.999:
                        c.create_oval(pie_x, py, pie_x + d, py + d, fill=fill, outline='')
                    elif frac > 0:
                        c.create_arc(pie_x, py, pie_x + d, py + d, start=90, extent=-360 * frac,
                                     fill=fill, outline='', style='pieslice')
                    c.create_oval(pie_x, py, pie_x + d, py + d, outline=DESC)
                    c.create_text(pie_x + d / 2, py - px(14), text=caption, fill=DESC, font=self.f_bold)
                    c.create_text(pie_x + d / 2, py + d + px(15), text=f'{round(frac * 100)}%', fill=TITLE, font=self.f_bold)

            c.create_text(x, y, anchor='nw', fill=DESC, font=self.f_usage, text=(
                f"new input {format_tokens(block['input'])} · output {format_tokens(block['output'])} · "
                f"cache write {format_tokens(block['cacheCreate'])} · cache read {format_tokens(block['cacheRead'])}"))
            y += px(30)
            c.create_text(x, y, text='TODAY/WEEK', anchor='nw', fill=ACCENT, font=self.f_bold)
            week_total = format_tokens(u['week']['total']) if u['week'] else '...'
            c.create_text(value_x, y - px(2), anchor='nw', fill=TITLE, font=self.f_usage,
                          text=f"{format_tokens(snap['today']['total'])} tokens / {week_total} tokens")
            y += px(28)
            # Only the biggest few models fit on one line; the rest are counted.
            models = sorted(snap.get('byModel', {}).items(), key=lambda kv: kv[1], reverse=True)
            parts = [f"{re.sub('^claude-', '', m)} {format_tokens(v)}" for m, v in models[:3]]
            if len(models) > 3:
                parts.append(f'+{len(models) - 3} more')
            if parts:
                c.create_text(x, y, text='MODELS', anchor='nw', fill=ACCENT, font=self.f_bold)
                c.create_text(value_x, y - px(4), text=' · '.join(parts), anchor='nw', fill=DESC, font=self.f_usage)
        c.create_line(0, H - 1, W, H - 1, fill=BAR)

    # --- sessions ------------------------------------------------------------------

    def activity_tick(self):
        """One sample a second: bytes each session appended to its transcript."""
        for s in active_sessions():
            sid = s['sid']
            if not sid:
                continue
            if not self.transcripts.get(sid):
                self.transcripts[sid] = transcript_path(sid)
            try:
                length = os.path.getsize(self.transcripts[sid]) if self.transcripts[sid] else 0
            except OSError:
                length = 0
            # First sighting has no previous length, so its delta is zero rather than the whole file.
            prev = self.last_len.get(sid, length)
            self.last_len[sid] = length
            self.samples.setdefault(sid, deque(maxlen=ACTIVITY_WINDOW)).append(max(0, length - prev))
        self.draw_grid()

    def refresh_grid(self):
        sessions = active_sessions()
        snap = self.usage['snap'] or {}
        rows = []
        if not sessions:
            rows.append({'paragraphs': [('  ', 'No active sessions', NOTE)],
                         'cells': ['No active sessions', '', '', '', ''], 'color': NOTE, 'sid': None, 'name': None, 'pid': None})
        for s in sessions:
            slot = (snap.get('bySession') or {}).get(s['sid'])
            tokens = format_tokens(slot['block']['total']) if slot else '-'
            short = s['sid'][:8]
            # Prefer real token activity when the scan saw any, otherwise the registry's updatedAt.
            updated = s['updated']
            if slot and slot.get('lastTs'):
                scanned = datetime.fromisoformat(slot['lastTs']).astimezone().replace(tzinfo=None)
                if not updated or scanned > updated:
                    updated = scanned
            rows.append({
                'paragraphs': [('▸ ', s['name'], TITLE), ('    · ', f"{short}  (pid {s['pid']})", DESC)],
                'cells': [f"{s['name']}  {short}  pid {s['pid']}", s['status'], tokens,
                          format_uptime(s['started']), updated.strftime('%Y-%m-%d %H:%M:%S') if updated else ''],
                'color': STATUS_COLORS.get(s['status'], GREY), 'sid': s['sid'], 'name': s['name'], 'pid': s['pid']})
        self.rows = rows
        self.draw_grid()

        u = self.usage
        stamp = datetime.now().strftime('%H:%M:%S')
        text = f'{len(sessions)} active · sessions {stamp}'
        if u['fetched']:
            text += f" · usage {u['fetched']:%H:%M:%S}"
            if u['account']:
                text += f" · account {u['account_at']:%H:%M:%S}"
            elif u['account_error']:
                text += f" · account: {u['account_error']}"
        self.note.configure(text=text)

    def columns(self):
        w = max(self.grid.winfo_width(), 1)
        fixed = [('Status', px(90)), ('5h Tok', px(85)), ('Up', px(85)), ('Last Update', px(215))]
        return [('Session', max(px(160), w - sum(c[1] for c in fixed)))] + fixed

    def draw_grid(self):
        cols = self.columns()
        h = self.grid_head
        h.delete('all')
        x = 0
        for i, (title, width) in enumerate(cols):
            if i == 0:
                h.create_text(x + px(6), px(15), text=title, anchor='w', fill=ACCENT, font=self.f_bold)
            else:
                h.create_text(x + width / 2, px(15), text=title, fill=ACCENT, font=self.f_bold)
            x += width

        g = self.grid
        g.delete('all')
        session_w = cols[0][1]
        line_h = self.f_grid.metrics('linespace')
        spark_w = px(210)
        scale = max([2048.0] + [v for buf in self.samples.values() for v in buf])
        y = 0
        self.layout = []
        for row in self.rows:
            # The sparkline sits at the right end of the session cell; the text keeps clear of it.
            draw_spark = session_w - spark_w - px(10) > px(160)
            text_w = (session_w - spark_w - px(26)) if draw_spark else session_w - px(10)
            wrapped = []
            for prefix, text, color in row['paragraphs']:
                pw = self.f_grid.measure(prefix)
                wrapped.append((prefix, pw, wrap(text, self.f_grid, text_w - pw), color))
            n_lines = sum(len(w[2]) for w in wrapped)
            height = max(px(30), n_lines * line_h + px(12))
            selected = self.selected is not None and row['cells'][0] == self.selected
            g.create_rectangle(0, y, sum(c[1] for c in cols), y + height, fill=BAR if selected else BG, outline='')

            ty = y + px(6)
            for prefix, pw, lines, color in wrapped:
                for k, ln in enumerate(lines):
                    g.create_text(px(6) + (0 if k == 0 else pw), ty, text=(prefix + ln) if k == 0 else ln,
                                  anchor='nw', fill=color, font=self.f_grid)
                    ty += line_h

            x = session_w
            for i, (_, width) in enumerate(cols[1:], 1):
                fill = row['color'] if i == 1 else TITLE
                g.create_text(x + width / 2, y + height / 2, text=row['cells'][i], fill=fill,
                              font=self.f_bold if i == 1 else self.f_grid)
                x += width

            buf = self.samples.get(row['sid']) if row['sid'] else None
            spark_h = height - px(14)
            if draw_spark and buf and len(buf) >= 2 and spark_h >= px(16):
                sx, sy = session_w - spark_w - px(10), y + px(7)
                step = spark_w / (ACTIVITY_WINDOW - 1)
                offset = ACTIVITY_WINDOW - len(buf)   # oldest sample at the left even before the buffer fills
                pts = []
                for k, v in enumerate(buf):
                    pts += [sx + (offset + k) * step, sy + spark_h - 1 - (v / scale) * (spark_h - 2)]
                g.create_polygon([pts[0], sy + spark_h] + pts + [pts[-2], sy + spark_h], fill=SPARK_FILL, outline='')
                g.create_line(pts, fill=ACCENT, width=1.4 * S)

            g.create_line(0, y + height - 1, sum(c[1] for c in cols), y + height - 1, fill=BAR)
            self.layout.append((y, y + height, row))
            y += height
        g.configure(scrollregion=(0, 0, g.winfo_width(), max(y, g.winfo_height())))

    def row_at(self, event):
        cy = self.grid.canvasy(event.y)
        for top, bottom, row in self.layout:
            if top <= cy < bottom:
                return row
        return None

    def grid_click(self, event):
        self.grid.focus_set()
        row = self.row_at(event)
        self.selected = row['cells'][0] if row else None
        self.draw_grid()

    def grid_double(self, event):
        # Double-click a session: the chat box talks to it from then on.
        row = self.row_at(event)
        if not row or not row['name']:
            return
        self.session_target = row['name']
        self.session_caption.configure(text=f"to {row['name']}")
        self.session_status.configure(text='')
        self.session_box.focus_set()

    def grid_menu(self, event):
        # Right-click selects the row under the cursor first, so Copy acts on it.
        self.grid_click(event)
        # "Open on start" is kept in agents.json, so only sessions listed there have it.
        row = self.row_at(event)
        sessions = agents()
        entry = next((s for s in sessions if row and s.get('id') == row['sid']), None)
        self.menu_sid = entry and entry['id']
        self.auto_open.set(bool(entry and entry.get('autoOpen', True)))
        self.copy_menu.entryconfigure('Open on start', state='normal' if entry else 'disabled')
        self.menu_pid = row and row['pid']
        self.copy_menu.entryconfigure('Terminate', state='normal' if self.menu_pid else 'disabled')
        self.copy_menu.tk_popup(event.x_root, event.y_root)

    def terminate_menu(self):
        if self.menu_pid:
            terminate_session(self.menu_pid)
            self.refresh_grid()

    def copy_rows(self, all_rows):
        rows = [r for r in self.rows if all_rows or r['cells'][0] == self.selected]
        if rows:
            self.root.clipboard_clear()
            self.root.clipboard_append('\n'.join('\t'.join(r['cells']) for r in rows))

    # --- tasks -------------------------------------------------------------------

    def refresh_tasks(self, force=False):
        # Every open task, in priority order - the whole list, not a top 5.
        top, remaining = tasks.display_tasks(TASKS_PATH, count=10 ** 6)
        sig = '\n'.join(f"{t['text']}|{t['due']}|{t['status']}|{'/'.join(t['description'])}" for t in top)
        sig += f'|{remaining}'
        # Only redraw when something changed, so a selection survives refreshes.
        if sig == self.task_sig and not force:
            return
        self.task_sig = sig
        tb = self.task_box
        tb.configure(state='normal')
        tb.delete('1.0', 'end')
        if not top:
            tb.insert('end', 'No open tasks', 'note')
        for i, t in enumerate(top):
            if i:
                tb.insert('end', '\n\n')
            title = t['text'][:1].upper() + t['text'][1:]
            tb.insert('end', '▸ ' + title, 'title')
            for d in t['description']:
                tb.insert('end', '\n    ▸ ' + d, 'desc')
            # Due and status are clickable.
            due = t['due'] or 'no due'
            tb.insert('end', '\n>> ', 'note')
            tb.insert('end', due, ('note', 'click', f'due{i}'))
            tb.insert('end', ' ' * max(1, 12 - len(due)), 'note')
            if t['status']:
                tag = f"st-{t['status']}" if t['status'] in TASK_STATUS_COLORS else 'st-other'
                tb.insert('end', t['status'], (tag, 'click', f'status{i}'))
            else:
                tb.insert('end', '-', ('st-none', 'click', f'status{i}'))   # not in TaskDatabase.xlsx yet
            tb.tag_bind(f'due{i}', '<ButtonRelease-1>', lambda e, t=t: self.task_click(e, t, 'due'))
            tb.tag_bind(f'status{i}', '<ButtonRelease-1>', lambda e, t=t: self.task_click(e, t, 'status'))
        tb.configure(state='disabled')
        self.task_note.configure(text=f'+{remaining} more in tasks.md' if remaining > 0 else '')

    def task_click(self, event, task, kind):
        # A drag leaves a selection: that is copying, not a click on a field.
        if self.task_box.tag_ranges('sel'):
            return
        self.edit_target = task
        if kind == 'due':
            current = tasks.parse_date(task['due']) or date.today()
            DuePicker(self.root, event.x_root, event.y_root, current, self.set_task_due)
        else:
            self.status_menu.tk_popup(event.x_root, event.y_root)

    def start_sync(self):
        subprocess.Popen([sys.executable, TASKS_SCRIPT, 'sync'], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)

    def set_task_due(self, day):
        due = day.strftime('%Y-%m-%d')
        try:
            tasks.set_due(TASKS_PATH, self.edit_target['text'], due)
            self.start_sync()
            msg = f'due set to {due}'
        except Exception as e:
            msg = f'due not saved: {e}'
        self.refresh_tasks(force=True)
        self.task_note.configure(text=msg)

    def set_task_status(self, status):
        title = self.edit_target['text']
        try:
            if status == 'Finished':
                # Ticked in tasks.md: gone from the list at once, Finished in the sheet after sync.
                tasks.set_checked(TASKS_PATH, title)
                self.start_sync()
            else:
                tasks.set_status(XLSX_PATH, title, status)
            msg = f'status set to {status}'
        except Exception as e:
            msg = f'status not saved: {e}'
        self.refresh_tasks(force=True)
        self.task_note.configure(text=msg)


def main():
    global S
    replace_previous('mission-control')
    S = display_scale()
    root = tk.Tk(className='AgentMissionControl')
    MissionControl(root)
    # Closing the window ends the agents too. A newer start replacing this one stops it
    # with SIGTERM instead, which leaves the tabs alone.
    root.protocol('WM_DELETE_WINDOW', lambda: (close_all_sessions(), root.destroy()))
    # The Agents Launcher has just opened the tabs itself and says so with --no-auto-open.
    if '--no-auto-open' not in sys.argv:
        threading.Thread(target=open_auto_sessions, daemon=True).start()
    root.mainloop()


if __name__ == '__main__':
    main()
