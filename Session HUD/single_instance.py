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


def _children(pid):
    """Every process descended from `pid`."""
    parents = {}
    for entry in os.listdir('/proc'):
        try:
            with open(f'/proc/{entry}/stat') as f:
                # The field after the ")" closing the command name: state, then ppid.
                parents[int(entry)] = int(f.read().rsplit(')', 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            continue
    found, todo = [], [pid]
    while todo:
        p = todo.pop()
        kids = [c for c, pp in parents.items() if pp == p]
        found += kids
        todo += kids
    return found


def replace_previous(name):
    path = _pid_file(name)
    script = os.path.basename(sys.argv[0])
    try:
        with open(path) as f:
            old = int(f.read().strip())
        with open(f'/proc/{old}/cmdline', 'rb') as f:
            cmdline = f.read().decode('utf-8', 'replace')
        if old != os.getpid() and script in cmdline:
            # Its children too (the web version's agent tabs): a session the new
            # window starts must be gone from the old one first.
            pids = [old] + _children(old)
            os.kill(old, signal.SIGTERM)
            for _ in range(100):
                if not any(os.path.exists(f'/proc/{p}') for p in pids):
                    break
                time.sleep(0.05)
    except (OSError, ValueError):
        pass
    with open(path, 'w') as f:
        f.write(str(os.getpid()))
