"""Polling must preserve runner results, cache lifecycle and timeout semantics."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


class Base:
    def run(self, tmp=None, task_vars=None):
        return {}


stub = ModuleType('ansible.plugins.action')
stub.ActionBase = Base
spec = importlib.util.spec_from_file_location('alis_wait', Path(__file__).resolve().parents[1] / 'templates/ansible/action_plugins/alis_wait.py')
wait = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'ansible': ModuleType('ansible'), 'ansible.plugins': ModuleType('ansible.plugins'), 'ansible.plugins.action': stub}):
    spec.loader.exec_module(wait)


class WaitTests(unittest.TestCase):
    def run_wait(self, statuses, summaries=('DB_PATCHING 20%',), interval=1, timeout=120):
        action = wait.ActionModule()
        action._task = SimpleNamespace(check_mode=False, args={'jid': 'j123.456', 'work_dir': '/test cycle', 'action': 'deploy', 'plan_sha': 'a' * 64, 'interval': interval, 'timeout': timeout})
        messages, calls = [], []
        action._display = SimpleNamespace(display=messages.append)
        results, progress = iter(statuses), iter(summaries)
        last_status, last_summary = statuses[-1], summaries[-1]
        def execute(module_name, module_args, task_vars):
            calls.append((module_name, module_args))
            if module_args.get('mode') == 'cleanup':
                return {'erased': True}
            if module_name == 'alis_progress':
                return {'summary': next(progress, last_summary), 'report_age': 4}
            return next(results, last_status)
        action._execute_module = execute
        clock = [0]
        def sleep(seconds):
            clock[0] += seconds
        with patch.object(wait, 'time', SimpleNamespace(monotonic=lambda: clock[0], sleep=sleep)):
            result = action.run(task_vars={'inventory_hostname': 'oracle_db'})
        return result, messages, calls

    def test_stage_updates_preserve_success_and_clean_only_the_finished_async_cache(self):
        final = {'finished': True, 'rc': 0, 'stdout': '{"changed": true}', 'changed': True}
        result, messages, calls = self.run_wait([{'finished': False}, {'finished': False}, final], ('DB_PATCHING 20%', 'DB_PATCHING 60%'))
        self.assertEqual(result, final)
        self.assertEqual(len(messages), 2)
        self.assertIn('DB_PATCHING 60%', messages[1])
        self.assertEqual(calls[-1], ('ansible.builtin.async_status', {'jid': 'j123.456', '_async_dir': '/test cycle/async', 'mode': 'cleanup'}))

    def test_native_failure_is_not_turned_into_success_by_progress(self):
        final = {'finished': True, 'rc': 1, 'stdout': '{"error": "failed checks"}'}
        result, _, calls = self.run_wait([{'finished': False}, final], ('total 100%',))
        self.assertEqual(result, final)
        self.assertEqual(calls[-1][1]['mode'], 'cleanup')

    def test_unchanged_progress_gets_heartbeat_without_printing_every_poll(self):
        result, messages, _ = self.run_wait([{'finished': False}] * 3 + [{'finished': True, 'rc': 0}], interval=31)
        self.assertEqual(result['rc'], 0)
        self.assertEqual(len(messages), 2)
        self.assertIn('elapsed 62s', messages[1])

    def test_timeout_and_connection_failure_keep_the_unfinished_job_cache(self):
        result, _, calls = self.run_wait([{'finished': False}], timeout=3, interval=2)
        self.assertEqual(result['rc'], 1)
        self.assertIn('may still be active', result['msg'])
        self.assertFalse(any(args.get('mode') == 'cleanup' for _, args in calls))
        result, _, calls = self.run_wait([{'unreachable': True, 'msg': 'connection lost'}])
        self.assertTrue(result['unreachable'])
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
