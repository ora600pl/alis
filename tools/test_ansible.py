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
        for name in ['prepare', 'analyze', 'deploy', 'verify', 'test-local']:
            result = subprocess.run([executable, name + '.yml', '--syntax-check'], cwd=bundle, env=env, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stdout + result.stderr)
        for fault, expected in [('none', 0), ('checks', 2), ('status', 2), ('sqlpatch', 2)]:
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
            result_file = bundle / ('artifacts/localhost/analyze-result.json' if fault == 'checks' else 'artifacts/localhost/deploy-result.json')
            saved = json.loads(result_file.read_text())
            if (fault == 'none') == ('error' in saved):
                raise RuntimeError('Fetched results do not match this run: ' + repr(saved))
            if fault == 'checks':
                if (bundle / 'artifacts/localhost/deploy-result.json').exists():
                    raise RuntimeError('Deployment ran after unsuccessful analysis.')
                # prepare logs no native database operation; failed analyze must be the only mode.
                status = json.loads((bundle / 'artifacts/localhost/analyze-status.json').read_text())
                commands = (Path(status['jobs'][0]['sourceHome']).parent / 'commands.jsonl').read_text()
                modes = [command[command.index('-mode') + 1] for command in map(json.loads, commands.splitlines())]
                if modes != ['analyze']:
                    raise RuntimeError('Unexpected operations after failed analysis: ' + repr(modes))
            outputs.append({'fault': fault, 'returncode': result.returncode, 'recap': recap[0], 'evidence_files': len(evidence)})
        print(json.dumps({'syntax_checks': 5, 'ansible_runs': outputs}, indent=2))


if __name__ == '__main__':
    main()
