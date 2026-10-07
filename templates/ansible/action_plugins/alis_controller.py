"""Run the native wallet loader on the controller's terminal, never through task output."""
from pathlib import Path
import os
import subprocess
import sys
from ansible.plugins.action import ActionBase


class ActionModule(ActionBase):
    TRANSFERS_FILES = False

    def run(self, tmp=None, task_vars=None):
        result = super().run(tmp, task_vars)
        if self._task.check_mode:
            return dict(result, failed=True, msg='Use test-local.yml; --check cannot configure a wallet or download software.')
        args = self._task.args
        try:
            script = Path(args['bundle']) / 'files/controller.py'
            action = args.get('action', 'prepare')
            if action == 'prepare' and (Path(args['root']) / 'manifest.json').is_file():
                action = 'verify'
            command = [sys.executable, str(script), action, '--plan', str(script.parent / 'plan.json'), '--root', args['root'], '--java', args.get('java', 'java')]
            if action == 'prepare':
                # A terminal is deliberately required. Neither passwords nor loader output
                # enter Ansible result data, callbacks, fact caches, or controller log files.
                with open(os.environ.get('ALIS_LOCAL_TTY', '/dev/tty'), 'r+b', buffering=0) as terminal:
                    rc = subprocess.call(command, stdin=terminal, stdout=terminal, stderr=terminal)
                result.update(changed=rc == 0, failed=rc != 0, msg='Local staging completed.' if rc == 0 else 'Local staging stopped. See the terminal above; no server was contacted.')
            else:
                process = subprocess.run(command, capture_output=True, text=True)
                result.update(changed=False, failed=process.returncode != 0, msg=process.stderr.strip() if process.returncode else 'Local manifest verified.')
        except (OSError, ValueError) as error:
            result.update(failed=True, msg='Local staging requires a Terminal with Java installed: ' + str(error))
        return result
