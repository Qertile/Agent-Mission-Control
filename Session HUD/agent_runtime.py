"""Provider commands and Codex's per-tab resume mapping; no UI or login access."""
import json
import os
import shutil
import sys
import uuid

import amc_core as core


def codex_state_path(entry):
    sid = str(uuid.UUID(entry['id']))
    return os.path.join(os.path.dirname(core.AGENTS_PATH), '.amc-state', 'codex', sid + '.json')


def codex_state(entry):
    return core.load_json(codex_state_path(entry)) or {}


def initial_prompt(entry):
    # Codex-specific prompts avoid depending on Claude-only tools like ListAgents.
    directory = os.path.join(core.LAUNCHER_DIR, 'prompts')
    names = [entry['name'] + '.md']
    if core.provider(entry) == 'codex':
        names.insert(0, os.path.join('codex', entry['name'] + '.md'))
    for name in names:
        path = os.path.abspath(os.path.join(directory, name))
        if os.path.commonpath([os.path.abspath(directory), path]) != os.path.abspath(directory):
            raise ValueError('Prompt name must stay inside the prompts directory')
        try:
            with open(path, encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            continue
    return None


def agent_argv(entry, run_id=None):
    if '--shell' in sys.argv:
        return [os.environ.get('COMSPEC', 'cmd.exe') if os.name == 'nt' else os.environ.get('SHELL', '/bin/bash')]
    provider = core.provider(entry)
    executable = shutil.which(provider)
    if not executable:
        raise RuntimeError(f'{provider} CLI not found on PATH. Install it and log in, then open this tab again.')
    if provider == 'claude':
        if core.transcript_path(entry['id']):
            return [executable, '--resume', entry['id'], '--name', entry['name']]
        argv = [executable, '--session-id', entry['id'], '--name', entry['name']]
    else:
        state = codex_state(entry)
        thread_id = state.get('threadId') or entry.get('codexSessionId')
        if thread_id:
            thread_id = str(uuid.UUID(thread_id))
        notify = [sys.executable, os.path.join(core.HERE, 'codex_notify.py'),
                  codex_state_path(entry), run_id or str(uuid.uuid4())]
        argv = [executable]
        if thread_id:
            argv += ['resume', thread_id]
        argv += ['--no-alt-screen', '-c', 'notify=' + json.dumps(notify)]
        if thread_id:
            return argv
    prompt = initial_prompt(entry)
    if prompt:
        argv.append(prompt)
    return argv
