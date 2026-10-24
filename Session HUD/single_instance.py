"""One window of each kind: a new start closes the previous one.

The pid of the running window is kept in a file under $XDG_RUNTIME_DIR; the
old process is only stopped when its command line still names this package's
script, so a reused pid is never hit.
"""

import os
import signal
import sys
import time


def _pid_file(name):
    base = os.environ.get('XDG_RUNTIME_DIR') or '/tmp'
    return os.path.join(base, f'agent-mission-control-{name}.pid')


def replace_previous(name):
    path = _pid_file(name)
    script = os.path.basename(sys.argv[0])
    try:
        with open(path) as f:
            old = int(f.read().strip())
        with open(f'/proc/{old}/cmdline', 'rb') as f:
            cmdline = f.read().decode('utf-8', 'replace')
        if old != os.getpid() and script in cmdline:
            os.kill(old, signal.SIGTERM)
            for _ in range(20):
                if not os.path.exists(f'/proc/{old}'):
                    break
                time.sleep(0.05)
    except (OSError, ValueError):
        pass
    with open(path, 'w') as f:
        f.write(str(os.getpid()))
