"""Claude Code hook for the phone page: a question Claude asks with options (AskUserQuestion)
reaches the session's transcript only once it is answered, so the phone's chat view could not
show it while it waits. This keeps it in <temp>/amc-ask/<session id>.json meanwhile.

In ~/.claude/settings.json, for the tool AskUserQuestion:
- PreToolUse runs it to write the file: the tool's input ({"questions": [...]}) and its "id";
- PostToolUse runs it to remove the file once answered.
It always exits 0, so a failure here never stops the question.
"""
import json
import os
import sys
import tempfile

try:
    e = json.load(sys.stdin)
    d = os.path.join(tempfile.gettempdir(), 'amc-ask')
    path = os.path.join(d, os.path.basename(str(e['session_id'])) + '.json')
    if e.get('hook_event_name') == 'PreToolUse':
        os.makedirs(d, exist_ok=True)
        with open(path + '.tmp', 'w', encoding='utf-8') as f:
            json.dump(dict(e.get('tool_input') or {}, id=e.get('tool_use_id')), f, ensure_ascii=False)
        os.replace(path + '.tmp', path)
    elif os.path.exists(path):
        os.remove(path)
except Exception:
    pass
sys.exit(0)
