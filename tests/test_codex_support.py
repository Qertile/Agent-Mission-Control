"""Provider regressions. No agent requests, login, or account credentials."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import types
import unittest
import uuid
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'Session HUD'))
import amc_core as core
import agent_runtime as runtime
import codex_notify

# Exercise the controller on headless CI without loading native GUI libraries.
with patch.dict(sys.modules, {'webview': types.ModuleType('webview'),
                             'winpty': types.SimpleNamespace(PtyProcess=Mock()),
                             'ptyprocess': types.SimpleNamespace(PtyProcessUnicode=Mock())}):
    spec = importlib.util.spec_from_file_location('controller_under_test', ROOT / 'Session HUD/amc_web.py')
    controller = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(controller)


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='amc codex ')
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / 'agents.json')
        self.patch_path = patch.object(core, 'AGENTS_PATH', self.path)
        self.patch_path.start()
        self.addCleanup(self.patch_path.stop)
        self.entry = {'id': str(uuid.uuid4()), 'name': 'Test agent', 'provider': 'codex'}
        self.run_id = str(uuid.uuid4())

    def command(self, entry=None):
        with patch.object(runtime.shutil, 'which', side_effect=lambda name: '/bin/' + name), \
                patch.object(sys, 'argv', ['amc_web.py']):
            return runtime.agent_argv(entry or self.entry, self.run_id)

    def test_legacy_entries_still_launch_and_resume_claude(self):
        entry = dict(self.entry)
        del entry['provider']
        with patch.object(core, 'transcript_path', return_value=''):
            self.assertEqual(self.command(entry), ['/bin/claude', '--session-id', entry['id'], '--name', entry['name']])
        with patch.object(core, 'transcript_path', return_value='saved.jsonl'):
            self.assertEqual(self.command(entry), ['/bin/claude', '--resume', entry['id'], '--name', entry['name']])

    def test_codex_hook_persists_identity_then_resumes_exact_thread(self):
        argv = self.command()
        self.assertNotIn('--session-id', argv)
        notify = json.loads(argv[argv.index('-c') + 1].removeprefix('notify='))
        thread = str(uuid.uuid4())
        event = {'type': 'agent-turn-complete', 'thread-id': thread,
                 'input-messages': ['private input'], 'last-assistant-message': 'private output'}
        subprocess.run(notify + [json.dumps(event)], check=True)
        self.assertEqual(runtime.codex_state(self.entry)['threadId'], thread)
        state_text = Path(runtime.codex_state_path(self.entry)).read_text()
        self.assertNotIn('private', state_text)
        self.assertEqual(self.command()[:3], ['/bin/codex', 'resume', thread])
        self.assertEqual(runtime.codex_state(self.entry)['runId'], self.run_id)

    def test_explicit_existing_codex_session(self):
        self.entry['codexSessionId'] = str(uuid.uuid4())
        self.assertEqual(self.command()[:3], ['/bin/codex', 'resume', self.entry['codexSessionId']])
        self.entry['codexSessionId'] = 'invalid'
        with self.assertRaises(ValueError):
            self.command()

    def test_new_chat_notification_updates_an_imported_session(self):
        self.entry['codexSessionId'] = str(uuid.uuid4())
        new_thread = str(uuid.uuid4())
        codex_notify.record(runtime.codex_state_path(self.entry), self.run_id,
                            {'type': 'agent-turn-complete', 'thread-id': new_thread})
        self.assertEqual(self.command()[1:3], ['resume', new_thread])

    def test_unrelated_events_and_invalid_ids_do_not_write(self):
        path = runtime.codex_state_path(self.entry)
        codex_notify.record(path, self.run_id, {'type': 'other'})
        self.assertFalse(Path(path).exists())
        with self.assertRaises(ValueError):
            codex_notify.record(path, self.run_id, {'type': 'agent-turn-complete', 'thread-id': 'bad'})
        self.assertFalse(Path(path).exists())

    def test_separate_tabs_have_separate_resume_ids(self):
        second = dict(self.entry, id=str(uuid.uuid4()))
        for entry in (self.entry, second):
            thread = str(uuid.uuid4())
            codex_notify.record(runtime.codex_state_path(entry), self.run_id,
                                {'type': 'agent-turn-complete', 'thread-id': thread})
        self.assertNotEqual(self.command()[2], self.command(second)[2])

    def test_provider_validation_and_missing_cli(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported provider'):
            self.command(dict(self.entry, provider='unknown'))
        with patch.object(runtime.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'codex CLI not found'):
                runtime.agent_argv(self.entry)

    def test_saving_sessions_preserves_default_and_other_settings(self):
        Path(self.path).write_text(json.dumps({'defaultProvider': 'codex', 'custom': 1}))
        core.save_agents([self.entry])
        core.set_auto_open(self.entry['id'], False)
        self.assertEqual(core.default_provider(), 'codex')
        self.assertEqual(core.load_json(self.path)['custom'], 1)
        self.assertFalse(core.agents()[0]['autoOpen'])

    def test_codex_specific_prompt_and_safe_prompt_path(self):
        entry = dict(self.entry, name='Session Manager')
        prompt = self.command(entry)[-1]
        self.assertIn('Codex Session Manager', prompt)
        self.assertNotIn('你是 Session Manager：', prompt)
        with self.assertRaisesRegex(ValueError, 'prompts directory'):
            self.command(dict(self.entry, name='../../outside'))

    def test_new_session_respects_default_and_rejects_invalid_provider(self):
        Path(self.path).write_text(json.dumps({'defaultProvider': 'codex'}))
        api = controller.Api()
        with patch.object(controller, 'agent_argv', return_value=['codex']), patch.object(api, '_start'):
            result = api.new_session('New Codex')
            self.assertNotIn('error', result)
            self.assertEqual(core.agents()[0]['provider'], 'codex')
            count = len(core.agents())
            self.assertIn('error', api.new_session('Invalid', 'other'))
            self.assertEqual(len(core.agents()), count)

    def test_codex_multiline_send_is_one_bracketed_paste(self):
        core.save_agents([self.entry])
        api = controller.Api()
        term = Mock()
        api._terms[self.entry['id']] = term
        with patch.object(controller.time, 'sleep'):
            self.assertIsNone(api.send(self.entry['name'], 'first line\nsecond line'))
        self.assertEqual([call.args[0] for call in term.write.call_args_list],
                         ['\x1b[200~first line\nsecond line\x1b[201~', '\r'])

    def test_status_ignores_previous_launch_completion(self):
        from datetime import datetime
        api = controller.Api()
        term = Mock(entry=self.entry, run_id=self.run_id, last_submit=time.time(),
                    started=datetime.now(), updated=datetime.now())
        term.proc.pid = 123
        term.alive.return_value = True
        api._terms[self.entry['id']] = term
        path = runtime.codex_state_path(self.entry)
        event = {'type': 'agent-turn-complete', 'thread-id': str(uuid.uuid4())}
        codex_notify.record(path, str(uuid.uuid4()), event)
        self.assertEqual(api._codex_sessions()[0]['status'], 'running')
        codex_notify.record(path, self.run_id, event)
        self.assertEqual(api._codex_sessions()[0]['status'], 'idle')
        term.last_submit = time.time() + 1
        self.assertEqual(api._codex_sessions()[0]['status'], 'running')

    def test_missing_cli_does_not_abort_other_startup_tabs(self):
        core.save_agents([dict(self.entry, provider='claude'), dict(self.entry, id=str(uuid.uuid4()))])
        api = controller.Api()
        with patch.object(controller.threading, 'Thread'), \
                patch.object(controller, 'active_sessions', return_value=[]), \
                patch.object(api, '_start', side_effect=[RuntimeError('claude CLI missing'), None]) as start:
            api.init()
        self.assertEqual(start.call_count, 2)
        self.assertIn(self.entry['id'], api._startup_errors)


if __name__ == '__main__':
    unittest.main()
