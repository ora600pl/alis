#!/usr/bin/env python3
"""Run actual Ansible against an exported simulator bundle, never a database."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    executable = shutil.which('ansible-playbook')
    if not executable:
        sibling = Path(sys.executable).with_name('ansible-playbook')
        if sibling.is_file():
            executable = str(sibling)
    if not executable:
        raise SystemExit('Install ansible-core 2.21 in a temporary venv and put its bin directory on PATH.')
    with tempfile.TemporaryDirectory(prefix='alis-ansible-integration-') as temp:
        bundle = Path(temp) / 'bundle'
        subprocess.run(['node', str(ROOT / 'tools/export_ansible_fixture.cjs'), str(bundle)], check=True, capture_output=True)
        env = dict(os.environ, ANSIBLE_HOME=str(Path(temp) / 'ansible-home'), ANSIBLE_LOCAL_TEMP=str(Path(temp) / 'local'), ANSIBLE_REMOTE_TEMP=str(Path(temp) / 'remote'), PYTHONDONTWRITEBYTECODE='1')
        outputs = []
        for name in ['patch', 'prepare', 'analyze', 'download', 'create_home', 'deploy', 'verify', 'test-local']:
            result = subprocess.run([executable, name + '.yml', '--syntax-check'], cwd=bundle, env=env, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stdout + result.stderr)
        faults = [('none', 'deploy', 0), ('checks', 'analyze', 2), ('download', 'download', 2), ('checksum', 'download', 2), ('root', 'create_home', 2), ('status', 'deploy', 2), ('sqlpatch', 'deploy', 2), ('interrupted', 'deploy', 2)]
        phases = ['analyze', 'download', 'create_home', 'deploy']
        for fault, action, expected in faults:
            if (bundle / 'artifacts').exists():
                shutil.rmtree(bundle / 'artifacts')
            result = subprocess.run([executable, 'test-local.yml', '-e', 'alis_test_failure=' + fault], cwd=bundle, env=env, capture_output=True, text=True)
            if result.returncode != expected:
                raise RuntimeError(result.stdout + result.stderr)
            recap = re.search(r'localhost\s+:.*failed=(\d+).*', result.stdout)
            if not recap or int(recap[1]) != (0 if fault == 'none' else 1):
                raise RuntimeError('Unexpected recap: ' + result.stdout)
            evidence = list((bundle / 'artifacts/localhost').glob('*'))
            if not evidence:
                raise RuntimeError('Ansible did not fetch result files.')
            result_file = bundle / ('artifacts/localhost/' + action + '-result.json')
            saved = json.loads(result_file.read_text())
            if (fault == 'none') == ('error' in saved):
                raise RuntimeError('Fetched results do not match this run: ' + repr(saved))
            status = json.loads((bundle / 'artifacts/localhost/analyze-status.json').read_text())
            commands = (Path(status['jobs'][0]['sourceHome']).parent / 'commands.jsonl').read_text()
            modes = [command[command.index('-mode') + 1] for command in map(json.loads, commands.splitlines())]
            if modes != phases[:phases.index(action) + 1]:
                raise RuntimeError('Unexpected operation sequence: ' + repr(modes))
            if fault != 'none':
                for following in phases[phases.index(action) + 1:]:
                    if (bundle / ('artifacts/localhost/' + following + '-result.json')).exists():
                        raise RuntimeError('A later stage ran after unsuccessful ' + action)
            outputs.append({'fault': fault, 'returncode': result.returncode, 'recap': recap[0], 'evidence_files': len(evidence)})
            print('Verified simulator scenario: ' + fault, flush=True)
            if fault == 'interrupted':
                sandbox = Path(status['jobs'][0]['sourceHome']).parent
                variables = Path(temp) / 'resume-simulation.json'
                variables.write_text(json.dumps({'alis_hosts': 'localhost', 'ansible_connection': 'local', 'ansible_python_interpreter': sys.executable, 'alis_python': sys.executable, 'alis_simulation': True, 'alis_become': False, 'alis_oracle_user': 'simulation', 'alis_bundle_dir': str(sandbox), 'alis_work_dir': str(sandbox / 'run'), 'alis_timeout': 120, 'alis_poll_interval': 1}))
                for resume in (True, False):
                    command = [executable, 'patch.yml', '-i', 'localhost,', '-e', '@' + str(variables)]
                    if resume:
                        command += ['-e', 'alis_resume=true']
                    result = subprocess.run(command, cwd=bundle, env=env, capture_output=True, text=True)
                    if result.returncode:
                        raise RuntimeError(result.stdout + result.stderr)
                    commands = [json.loads(line) for line in (sandbox / 'commands.jsonl').read_text().splitlines()]
                    modes = [command[command.index('-mode') + 1] for command in commands]
                    if modes != phases + ['deploy'] or '-resume' not in commands[-1]:
                        raise RuntimeError('Global resume/repeat reran completed phases: ' + repr(modes))
                outputs[-1].update(global_resume=True, repeated_cycle_skipped=True)
                print('Verified global resume and repeated complete cycle', flush=True)
        print(json.dumps({'syntax_checks': 8, 'ansible_runs': outputs}, indent=2))


if __name__ == '__main__':
    main()
