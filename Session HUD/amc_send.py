"""Sends a message to an AMC tab, waking it first when it is hibernating.

    python "Session HUD/amc_send.py" "<tab name>" "<message>"

For a session that SendMessage cannot see: a hibernating tab's process has ended, so
it is not listed. The message is left in Session HUD/inbox/ for the running AMC
(amc_web.py, _inbox_loop), which opens the tab in the same conversation and types it in,
headed "[message from <sender tab> via amc_send]". Prints "sent" or what went wrong; the
exit code is 0 only when it was sent.
"""

import json
import os
import sys
import time
import uuid

INBOX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'inbox')
WAIT = 150      # waking a tab waits up to 90 s for its prompt (amc_web.py, _wait_idle)


def main():
    if len(sys.argv) != 3 or not sys.argv[2].strip():
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    os.makedirs(INBOX, exist_ok=True)
    name = uuid.uuid4().hex
    path, done = os.path.join(INBOX, name + '.json'), os.path.join(INBOX, name + '.done')
    with open(path + '.tmp', 'w', encoding='utf-8') as f:
        json.dump({'to': sys.argv[1], 'text': sys.argv[2], 'pid': os.getpid()}, f)
    os.replace(path + '.tmp', path)        # AMC never reads half a file
    end = time.time() + WAIT
    while time.time() < end:
        if os.path.exists(done):
            time.sleep(0.1)
            with open(done, encoding='utf-8') as f:
                err = json.load(f).get('error')
            os.remove(done)
            print(err or 'sent', file=sys.stderr if err else sys.stdout)
            return 1 if err else 0
        time.sleep(0.5)
    # Not taken: no AMC running. Removed, so a later AMC does not send it late.
    try:
        os.remove(path)
        print('AMC is not running (nothing picked up the message)', file=sys.stderr)
    except OSError:
        print(f'no answer from AMC in {WAIT} s (it may still be sent)', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
