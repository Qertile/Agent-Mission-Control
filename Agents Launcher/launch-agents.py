#!/usr/bin/env python3
"""Opens the Claude Code tabs listed in agents.json (in the package folder, one
level up), grouped into GNOME Terminal windows by their "window" number, then
starts Agent Mission Control. agents.json is the one list both this launcher
and Agent Mission Control read.

Every tab runs its agent inside the "amc" tmux server (tmux -L amc), one tmux
session per agent, named after it. That is what lets Agent Mission Control
type into a tab; tmux.conf keeps it looking like a plain terminal.

--dry-run prints the commands instead of running them.
"""

import json
import os
import shlex
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                  # the package folder
WORK_DIR = os.path.dirname(ROOT)              # every tab starts here
AGENT = os.path.join(HERE, 'agent.sh')
HUD = os.path.join(ROOT, 'Session HUD', 'mission_control.py')
TMUX = ['tmux', '-L', 'amc', '-f', os.path.join(HERE, 'tmux.conf')]


def tmux_name(name):
    # tmux reads "." and ":" in a target as window/pane separators.
    return name.replace('.', '_').replace(':', '_')


def main():
    dry = '--dry-run' in sys.argv
    with open(os.path.join(ROOT, 'agents.json'), encoding='utf-8-sig') as f:
        listed = json.load(f)['sessions']
    # Sessions unticked "Open on start" (in Agent Mission Control's right-click menu) stay closed.
    sessions = [s for s in listed if s.get('autoOpen', True)]

    # A second click must not stack a second set of tabs on the first one, so the
    # previous launch is closed first: ending an agent's tmux session ends its
    # claude and closes the terminal tab attached to it.
    for s in sessions:
        cmd = TMUX + ['kill-session', '-t', '=' + tmux_name(s['name'])]
        if dry:
            print('close tab:', shlex.join(cmd))
        else:
            subprocess.run(cmd, stderr=subprocess.DEVNULL)
    if not dry:
        time.sleep(0.5)

    windows = {}
    for s in sessions:
        windows.setdefault(int(s.get('window', 1)), []).append(s)
    for number in sorted(windows):
        args = ['gnome-terminal']
        for i, s in enumerate(windows[number]):
            inner = TMUX + ['new-session', '-A', '-s', tmux_name(s['name']), '-c', WORK_DIR,
                            AGENT, s['id'], s['name']]
            args += ['--window' if i == 0 else '--tab', f"--title={s['name']}",
                     f'--working-directory={WORK_DIR}', '--command', shlex.join(inner)]
        if dry:
            print(shlex.join(args))
        else:
            subprocess.Popen(args)
            time.sleep(0.5)       # keep the windows in agents.json order

    # Agent Mission Control closes a window it finds still open from the last launch.
    cmd = [sys.executable, HUD, '--no-auto-open']
    if dry:
        print(shlex.join(cmd))
    else:
        log = open(os.path.join(ROOT, 'Session HUD', 'mission-control.log'), 'a')
        subprocess.Popen(cmd, stdout=log, stderr=log, start_new_session=True)


if __name__ == '__main__':
    main()
