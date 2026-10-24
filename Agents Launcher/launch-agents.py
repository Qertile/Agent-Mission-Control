#!/usr/bin/env python3
"""Starts Agent Mission Control (the web version, Session HUD/amc_web.py): one
window with the task list, the session monitor and a terminal tab per agents.json
session. The window opens the sessions ticked "Open on start" itself, so there
are no terminal windows to open here. A second click replaces the running window.

--dry-run prints the command instead of running it.
"""

import os
import shlex
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                  # the package folder
WEB = os.path.join(ROOT, 'Session HUD', 'amc_web.py')


def main():
    if sys.platform == 'darwin':
        os.environ['PATH'] = os.pathsep.join([
            os.path.expanduser('~/.local/bin'), '/opt/homebrew/bin', '/usr/local/bin',
            os.environ.get('PATH', '/usr/bin:/bin')])
    cmd = [sys.executable, WEB]
    if '--dry-run' in sys.argv:
        print(shlex.join(cmd))
        return
    log = open(os.path.join(ROOT, 'Session HUD', 'amc-web.log'), 'a')
    subprocess.Popen(cmd, stdout=log, stderr=log, start_new_session=True)


if __name__ == '__main__':
    main()
