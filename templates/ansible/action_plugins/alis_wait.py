"""Wait for the original async runner and display advisory native progress."""
import re
import time

from ansible.plugins.action import ActionBase


class ActionModule(ActionBase):
    TRANSFERS_FILES = False

    def run(self, tmp=None, task_vars=None):
        super().run(tmp, task_vars)
        args = self._task.args
        jid, work_dir = args.get('jid', ''), args.get('work_dir', '')
        if (self._task.check_mode or not re.fullmatch(r'[A-Za-z0-9_.-]+', jid) or
                not work_dir.startswith('/') or work_dir == '/'):
            return {'failed': True, 'rc': 1, 'msg': 'A normal run, job ID and dedicated absolute work directory are required.'}
        interval, timeout = int(args['interval']), int(args['timeout'])
        if interval < 1 or timeout < 1:
            return {'failed': True, 'rc': 1, 'msg': 'Polling interval and timeout must be positive.'}
        task_vars = task_vars or {}
        host = task_vars.get('inventory_hostname', 'host')
        action = args['action']
        started = time.monotonic()
        last_summary, last_display = None, started
        async_args = {'jid': jid, '_async_dir': work_dir.rstrip('/') + '/async'}
        while True:
            result = self._execute_module(module_name='ansible.builtin.async_status',
                                          module_args=dict(async_args, mode='status'), task_vars=task_vars)
            if result.get('finished'):
                self._execute_module(module_name='ansible.builtin.async_status',
                                     module_args=dict(async_args, mode='cleanup'), task_vars=task_vars)
                return result
            if result.get('failed') or result.get('unreachable'):
                return result
            progress = self._execute_module(module_name='alis_progress', module_args={
                'work_dir': work_dir, 'action': action, 'plan_sha': args['plan_sha'],
            }, task_vars=task_vars)
            summary = progress.get('summary', 'Progress report unavailable; runner still active')
            now = time.monotonic()
            if summary != last_summary or now - last_display >= 60:
                age = progress.get('report_age')
                suffix = ' | report age {}s'.format(age) if type(age) is int else ''
                self._display.display('[ALIS] {} | {} | {} | elapsed {}s{}'.format(
                    host, action, summary, int(now - started), suffix))
                last_summary, last_display = summary, now
            remaining = timeout - (now - started)
            if remaining <= 0:
                return {'failed': True, 'rc': 1, 'msg': 'Stopped waiting for the async runner. It may still be active; inspect its logs before resuming.'}
            time.sleep(min(interval, remaining))
