"""Remember the invoking terminal before Ansible isolates worker sessions."""
import os
import sys
from ansible.plugins.callback import CallbackBase


class CallbackModule(CallbackBase):
    CALLBACK_VERSION = 2.0
    CALLBACK_TYPE = 'aggregate'
    CALLBACK_NAME = 'alis_terminal'
    CALLBACK_NEEDS_ENABLED = True

    def v2_playbook_on_start(self, playbook):
        # No secret or file content travels through this variable; only the terminal
        # device already owned by the invoking user is passed to local staging.
        os.environ.pop('ALIS_LOCAL_TTY', None)
        try:
            if sys.stdin.isatty():
                os.environ['ALIS_LOCAL_TTY'] = os.ttyname(sys.stdin.fileno())
        except (OSError, ValueError):
            pass
