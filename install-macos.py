#!/usr/bin/env python3
"""macOS setup. Run through ./install.sh; scheduled jobs are opt-in."""

import argparse
import json
import os
from pathlib import Path
import plistlib
import shlex
import shutil
import subprocess
import sys
import uuid
import venv

ROOT = Path(__file__).resolve().parent
VENV = ROOT / '.venv'
PYTHON = VENV / 'bin' / 'python3'
LABEL_PREFIX = 'local.agent-mission-control'


def runtime_path():
    return os.pathsep.join(dict.fromkeys([
        str(VENV / 'bin'), str(Path.home() / '.local/bin'),
        '/opt/homebrew/bin', '/usr/local/bin',
        *os.environ.get('PATH', '/usr/bin:/bin').split(os.pathsep)]))


def initialize_files(root=ROOT):
    pairs = [('agents.json', 'agents.template.json'),
             ('Session HUD/hud-config.json', 'Session HUD/hud-config.template.json'),
             ('Task Manager/tasks.md', 'Task Manager/tasks.template.md'),
             ('Task Manager/TaskDatabase.xlsx', 'Task Manager/TaskDatabase.template.xlsx')]
    for target, source in pairs:
        dest = root / target
        # Exclusive creation preserves existing settings on a repeat install.
        try:
            with dest.open('xb') as f:
                data = (root / source).read_bytes()
                if target == 'agents.json':
                    data = data.replace(b'__NEW_ID__', str(uuid.uuid4()).encode())
                f.write(data)
            print(f'Created {dest}')
        except FileExistsError:
            print(f'Kept {dest}')


def create_app(destination, python=PYTHON, root=ROOT):
    contents = destination / 'Contents'
    executable = contents / 'MacOS' / 'Agent Mission Control'
    executable.parent.mkdir(parents=True, exist_ok=True)
    info = {'CFBundleName': 'Agent Mission Control',
            'CFBundleIdentifier': LABEL_PREFIX,
            'CFBundleExecutable': executable.name,
            'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1',
            'NSDesktopFolderUsageDescription': 'Agent Mission Control needs access to its project, Python environment and agent working folders on your Desktop.',
            'NSHighResolutionCapable': True}
    (contents / 'Info.plist').write_bytes(plistlib.dumps(info))
    interpreter = python
    environment = ''
    if python.exists():
        prefix = subprocess.check_output([str(python), '-c', 'import sys; print(sys.base_prefix)'], text=True).strip()
        framework = Path(prefix) / 'Resources/Python.app/Contents/MacOS/Python'
        if framework.is_file():
            # Apple's python3 shim can fail under LaunchServices before our code
            # runs. Invoke the real framework binary, retaining venv discovery.
            interpreter = framework
            environment = 'export __PYVENV_LAUNCHER__=' + shlex.quote(str(python)) + '\n'
    command = [str(interpreter), str(root / 'Agents Launcher' / 'launch-agents.py')]
    executable.write_text('#!/bin/sh\n'
                          'log_dir="$HOME/Library/Logs/Agent Mission Control"\n'
                          'mkdir -p "$log_dir"\n'
                          'exec >>"$log_dir/launcher.log" 2>&1\n'
                          'echo "Starting Agent Mission Control: $(date)"\n'
                          'export PYTHONUNBUFFERED=1\nexport PATH=' + shlex.quote(runtime_path()) +
                          '\n' + environment + 'exec ' + shlex.join(command) + '\n', encoding='utf-8')
    executable.chmod(0o755)


def launch_agents(python=PYTHON, root=ROOT):
    """Generate dictionaries separately so calendar and quoting can be tested."""
    weekdays = list(range(1, 6))  # launchd: Sunday=0, Monday=1
    jobs = [('review', weekdays, 9, 30), ('daily', weekdays, 19, 0), ('weekly', [5], 19, 30)]
    for job, days, hour, minute in jobs:
        yield {'Label': f'{LABEL_PREFIX}.{job}',
               'ProgramArguments': [str(python), str(root / 'Daily Summary' / 'jobs.py'), job],
               'WorkingDirectory': str(root.parent),
               'EnvironmentVariables': {'PATH': runtime_path()},
               'StartCalendarInterval': [{'Weekday': d, 'Hour': hour, 'Minute': minute} for d in days],
               'LimitLoadToSessionType': 'Aqua',
               'StandardOutPath': str(root / 'Daily Summary' / f'launchd-{job}.log'),
               'StandardErrorPath': str(root / 'Daily Summary' / f'launchd-{job}.log')}


def configure_schedules(remove=False):
    folder = Path.home() / 'Library' / 'LaunchAgents'
    domain = f'gui/{os.getuid()}'
    if not remove:
        folder.mkdir(parents=True, exist_ok=True)
    for spec in launch_agents():
        path = folder / (spec['Label'] + '.plist')
        # bootout can report "not loaded" during the first install.
        subprocess.run(['launchctl', 'bootout', f"{domain}/{spec['Label']}"],
                       capture_output=True)
        if remove:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(plistlib.dumps(spec))
            subprocess.run(['launchctl', 'bootstrap', domain, str(path)], check=True)
        print(('Removed ' if remove else 'Registered ') + spec['Label'])


def check():
    python = str(PYTHON) if PYTHON.exists() else sys.executable
    failures = []
    config = ROOT / 'agents.json'
    settings = json.loads(config.read_text()) if config.exists() else {}
    required = {entry.get('provider', 'claude') for entry in settings.get('sessions', [])
                if entry.get('autoOpen', True)}
    required.add(settings.get('defaultProvider', 'claude'))
    for provider in sorted(required):
        if provider not in ('claude', 'codex') or not shutil.which(provider, path=runtime_path()):
            failures.append(f'{provider}: install the configured CLI and log in.')
    for module in ('webview', 'ptyprocess', 'openpyxl', 'Cocoa', 'WebKit'):
        result = subprocess.run([python, '-c', f'import {module}'], capture_output=True)
        if result.returncode:
            failures.append(f'{module}: run ./install.sh to install the Python dependencies.')
    for message in failures:
        print('MISSING ' + message)
    print(f'{len(failures)} requirement(s) missing. Python: {python}')
    return not failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true', help='check without creating or changing files')
    parser.add_argument('--schedule', action='store_true', help='register review/daily/weekly LaunchAgents')
    parser.add_argument('--remove-schedules', action='store_true', help='unregister only this app’s LaunchAgents')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('This installer is for macOS. Use install.sh on Linux or install.bat on Windows.')
    if args.check_only:
        return 0 if check() else 1
    if args.remove_schedules:
        configure_schedules(remove=True)
        return 0
    if sys.version_info < (3, 9):
        parser.error('Python 3.9 or later is required.')
    if not PYTHON.exists():
        venv.create(VENV, with_pip=True)
    subprocess.run([str(PYTHON), '-m', 'pip', 'install', '--upgrade', 'pip'], check=True)
    # PyObjC 12 dropped Python 3.9; its yanked metadata can confuse older pip.
    bridge = ['pyobjc-core', 'pyobjc-framework-Cocoa', 'pyobjc-framework-Quartz',
              'pyobjc-framework-WebKit', 'pyobjc-framework-Security']
    if sys.version_info < (3, 10):
        bridge = [package + '<12' for package in bridge]
    subprocess.run([str(PYTHON), '-m', 'pip', 'install', 'pywebview', 'ptyprocess', 'openpyxl',
                    *bridge], check=True)
    initialize_files()
    app = Path.home() / 'Applications' / 'Agent Mission Control.app'
    create_app(app)
    print(f'Open {app} to start. Every session works in {ROOT.parent}.')
    if not any(shutil.which(cli, path=runtime_path()) for cli in ('claude', 'codex')):
        print('No supported agent CLI found. Install Claude Code or Codex and log in before opening the app.')
    if args.schedule:
        configure_schedules()
    return 0


if __name__ == '__main__':
    sys.exit(main())
