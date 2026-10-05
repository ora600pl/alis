"""Exercise real Ansible approval prompts using only fake local Oracle tools."""
import json
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import time


def interactive(command, cwd, env, answer):
    pid, master = pty.fork()
    if pid == 0:
        os.chdir(cwd)
        os.execvpe(command[0], command, env)
    output, answered = b'', False
    deadline = time.monotonic() + 180
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], 0.2)[0]:
                try:
                    data = os.read(master, 65536)
                except OSError:
                    break
                if not data:
                    break
                output += data
                if not answered and b'Type YES to proceed' in output:
                    # Ansible switches terminal mode and flushes input after printing.
                    time.sleep(0.2)
                    os.write(master, (answer + '\n').encode())
                    answered = True
        else:
            os.kill(pid, signal.SIGTERM)
            raise RuntimeError('Approval test timed out: ' + output.decode(errors='replace'))
        _, status = os.waitpid(pid, 0)
        if not answered:
            raise RuntimeError('Ansible never requested approval: ' + output.decode(errors='replace'))
        return os.waitstatus_to_exitcode(status), output.decode(errors='replace')
    finally:
        os.close(master)


def check_approval(executable, bundle, env, temp):
    result = subprocess.run([executable, 'test-local.yml', '-e', 'alis_approve_deploy=false'], cwd=bundle, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True)
    if result.returncode != 2 or 'Deployment was not approved' not in result.stdout:
        raise RuntimeError('Headless run failed to stop for approval: ' + result.stdout + result.stderr)
    status = json.loads((bundle / 'artifacts/localhost/analyze-status.json').read_text())
    sandbox = Path(status['jobs'][0]['sourceHome']).parent
    variables = Path(temp) / 'approval-simulation.json'
    variables.write_text(json.dumps({'alis_hosts': 'localhost', 'ansible_connection': 'local', 'ansible_python_interpreter': os.sys.executable, 'alis_python': os.sys.executable, 'alis_simulation': True, 'alis_become': False, 'alis_oracle_user': 'simulation', 'alis_bundle_dir': str(sandbox), 'alis_work_dir': str(sandbox / 'run'), 'alis_timeout': 120, 'alis_poll_interval': 1}))
    command = [executable, 'deploy.yml', '-i', 'localhost,', '-e', '@' + str(variables)]
    def modes():
        return [args[args.index('-mode') + 1] for args in map(json.loads, (sandbox / 'commands.jsonl').read_text().splitlines())]
    prepared = ['analyze', 'download', 'create_home']
    if modes() != prepared:
        raise RuntimeError('Unapproved headless run deployed the database.')
    code, output = interactive(command, bundle, env, 'NO')
    if code != 2 or modes() != prepared or 'Deployment was not approved' not in output:
        raise RuntimeError('Refusal did not stop before deploy: ' + output)
    code, output = interactive(command, bundle, env, 'YES')
    if code != 0 or modes() != prepared + ['deploy']:
        raise RuntimeError('Approved deployment failed: ' + output)
    result = subprocess.run(command, cwd=bundle, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True)
    if result.returncode or modes() != prepared + ['deploy'] or 'Not waiting for response' in result.stderr:
        raise RuntimeError('Completed deployment requested approval or ran again: ' + result.stdout + result.stderr)
    print('Verified headless refusal, interactive NO/YES and completed deploy without approval', flush=True)
