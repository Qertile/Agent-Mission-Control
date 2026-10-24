"""Platform regression tests; no Claude login, desktop, or real schedules needed."""
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'Session HUD'))
import amc_core as core
import single_instance


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load('mac_installer', 'install-macos.py')
jobs = load('jobs', 'Daily Summary/jobs.py')
tasks = load('tasks', 'Task Manager/tasks.py')


class ProcessTests(unittest.TestCase):
    def test_live_and_exited_process(self):
        proc = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
        try:
            self.assertTrue(core.pid_alive(proc.pid))
        finally:
            proc.terminate()
            proc.wait()
        self.assertFalse(core.pid_alive(proc.pid))

    def test_macos_process_without_proc(self):
        with patch.object(core.sys, 'platform', 'darwin'), patch.object(core.os, 'kill') as kill:
            self.assertTrue(core.pid_alive(123))
            kill.assert_called_once_with(123, 0)
            kill.side_effect = ProcessLookupError
            self.assertFalse(core.pid_alive(123))
            kill.side_effect = PermissionError
            self.assertTrue(core.pid_alive(123))

    def test_linux_keeps_proc_detection(self):
        with patch.object(core.sys, 'platform', 'linux'), patch.object(core.os, 'name', 'posix'), \
                patch.object(core.os.path, 'exists', return_value=True) as exists:
            self.assertTrue(core.pid_alive(123))
            exists.assert_called_once_with('/proc/123')

    def test_macos_descendants(self):
        result = subprocess.CompletedProcess([], 0, '10 1\n11 10\n12 11\n20 1\n')
        with patch.object(single_instance.sys, 'platform', 'darwin'), \
                patch.object(single_instance.subprocess, 'run', return_value=result):
            self.assertEqual(single_instance._children(10), [11, 12])

    def test_single_instance_ignores_reused_pid(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'instance.pid'
            path.write_text('123')
            result = subprocess.CompletedProcess([], 0, 'some-other-app')
            with patch.object(single_instance.sys, 'platform', 'darwin'), \
                    patch.object(single_instance, '_pid_file', return_value=str(path)), \
                    patch.object(single_instance.subprocess, 'run', return_value=result), \
                    patch.object(single_instance.os, 'kill') as kill:
                single_instance.replace_previous('test')
                kill.assert_not_called()
            self.assertEqual(path.read_text(), str(os.getpid()))

    @unittest.skipIf(os.name == 'nt', 'POSIX descendant detection')
    def test_native_descendants(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
        try:
            self.assertIn(child.pid, single_instance._children(os.getpid()))
        finally:
            child.terminate()
            child.wait()


class CredentialsTests(unittest.TestCase):
    def test_macos_keychain_fallback(self):
        credentials = {'claudeAiOauth': {'accessToken': 'test-token'}}
        result = subprocess.CompletedProcess([], 0, json.dumps(credentials))
        payload = {'five_hour': {'utilization': 10}, 'seven_day': {'utilization': 20}}
        with patch.object(core.sys, 'platform', 'darwin'), \
                patch.object(core, 'load_json', return_value=None), \
                patch.object(core.subprocess, 'run', return_value=result) as run, \
                patch.object(core.urllib.request, 'urlopen') as urlopen:
            import io
            urlopen.return_value.__enter__.return_value = io.StringIO(json.dumps(payload))
            self.assertEqual(core.account_usage()['five_hour'], 10)
            self.assertEqual(run.call_args.args[0][0], 'security')
            request = urlopen.call_args.args[0]
            self.assertEqual(request.get_header('Authorization'), 'Bearer test-token')

    def test_file_credentials_do_not_use_keychain(self):
        with patch.object(core, 'load_json', return_value={'claudeAiOauth': {}}), \
                patch.object(core.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'no OAuth token'):
                core.account_usage()
            run.assert_not_called()


class InstallerTests(unittest.TestCase):
    def test_preserve_settings_and_generate_uuid(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for relative in ['agents.template.json', 'Session HUD/hud-config.template.json',
                             'Task Manager/tasks.template.md', 'Task Manager/TaskDatabase.template.xlsx']:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, target)
            installer.initialize_files(root)
            sid = json.loads((root / 'agents.json').read_text())['sessions'][0]['id']
            import uuid
            uuid.UUID(sid)
            (root / 'agents.json').write_text('personal config')
            installer.initialize_files(root)
            self.assertEqual((root / 'agents.json').read_text(), 'personal config')

    def test_app_and_launchagent_paths_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='amc space ') as temp:
            app = Path(temp) / 'Agent Mission Control.app'
            installer.create_app(app, python=Path(temp) / 'python3', root=Path(temp))
            info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
            self.assertEqual(info['CFBundleExecutable'], 'Agent Mission Control')
            script = app / 'Contents/MacOS/Agent Mission Control'
            if os.name != 'nt':
                subprocess.run(['sh', '-n', str(script)], check=True)
            specs = list(installer.launch_agents(root=Path(temp)))
            self.assertEqual([s['ProgramArguments'][-1] for s in specs], ['review', 'daily', 'weekly'])
            self.assertEqual(specs[0]['StartCalendarInterval'][0], {'Weekday': 1, 'Hour': 9, 'Minute': 30})
            self.assertEqual(specs[2]['StartCalendarInterval'], [{'Weekday': 5, 'Hour': 19, 'Minute': 30}])
            for spec in specs:
                self.assertEqual(plistlib.loads(plistlib.dumps(spec)), spec)
                self.assertEqual(spec['ProgramArguments'][1], str(Path(temp) / 'Daily Summary/jobs.py'))
                self.assertNotIn('RunAtLoad', spec)


class JobAndTaskTests(unittest.TestCase):
    def test_review_uses_native_terminal_and_marks_after_launch(self):
        for platform in ('darwin', 'linux'):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory(prefix="amc review '") as temp:
                reports = Path(temp) / 'Reports'
                reports.mkdir()
                (reports / '2020-01-01.md').write_text('Open items')
                mkstemp = tempfile.mkstemp
                with patch.object(jobs, 'BASE', temp), patch.object(jobs, 'REPORTS', str(reports)), \
                        patch.object(jobs.sys, 'platform', platform), patch.object(jobs, 'log'), \
                        patch.object(jobs.subprocess, 'run') as run, \
                        patch.object(jobs.subprocess, 'Popen') as popen, \
                        patch.object(jobs.tempfile, 'mkstemp', side_effect=lambda **kw: mkstemp(dir=temp, **kw)):
                    jobs.review()
                    self.assertEqual((Path(temp) / 'last-reviewed-report.txt').read_text(), '2020-01-01')
                    if platform == 'darwin':
                        self.assertEqual(run.call_args.args[0][:3], ['open', '-a', 'Terminal'])
                        popen.assert_not_called()
                    else:
                        self.assertEqual(popen.call_args.args[0][0], 'gnome-terminal')
                        run.assert_not_called()

    def test_bsd_elapsed_time(self):
        for text, seconds in [('02:03', 123), ('02:00:01', 7201), ('1-02:03:04', 93784)]:
            self.assertEqual(jobs.elapsed_seconds(text), seconds)

    def test_orphan_cleanup_uses_platform_ps_fields(self):
        for platform, age, fields in [('darwin', '02:00:01', 'etime='), ('linux', '7201', 'etimes=')]:
            result = subprocess.CompletedProcess([], 0,
                f'123 {age} claude --settings {jobs.SETTINGS}\n124 {age} claude interactive\n')
            with self.subTest(platform=platform), patch.object(jobs.sys, 'platform', platform), \
                    patch.object(jobs.subprocess, 'run', return_value=result) as run, \
                    patch.object(jobs.os, 'kill') as kill, patch.object(jobs, 'log'):
                jobs.kill_orphans('test.log')
                self.assertIn(fields, run.call_args.args[0][-1])
                kill.assert_called_once_with(123, jobs.signal.SIGKILL)

    def test_task_sync_and_edit_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp:
            md, sheet = str(Path(temp) / 'tasks.md'), str(Path(temp) / 'TaskDatabase.xlsx')
            Path(md).write_text('- [ ] Test task (added:2026-10-20) [due:2026-10-25]\n', encoding='utf-8')
            self.assertEqual(tasks.sync(md, sheet), 1)
            tasks.set_due(md, 'Test task', '2026-10-26')
            tasks.write_status(sheet, 'Test task', 'Ongoing')
            tasks.sync(md, sheet)
            row = tasks.read_sheet(sheet)[0]
            self.assertEqual(row['Status'], 'Ongoing')
            self.assertEqual(row['Due'].day, 26)
            tasks.set_checked(md, 'Test task')
            tasks.sync(md, sheet)
            self.assertEqual(tasks.read_sheet(sheet)[0]['Status'], 'Finished')


if __name__ == '__main__':
    unittest.main()
