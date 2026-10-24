"""Codex `notify` hook. Store only thread identity and completion time, never messages.

Invoked as: python codex_notify.py STATE_FILE RUN_ID NOTIFICATION_JSON
"""
import json
import os
import sys
import tempfile
import time
import uuid


def record(path, run_id, notification):
    if notification.get('type') != 'agent-turn-complete':
        return
    thread_id = str(uuid.UUID(notification['thread-id']))
    run_id = str(uuid.UUID(run_id))
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=directory, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump({'threadId': thread_id, 'runId': run_id, 'completedAt': time.time()}, f)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    try:
        record(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]))
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        sys.exit(1)
