#!/usr/bin/env python3
"""Original fake Oracle tools for local Ansible tests. No Oracle or network access."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import time
import zipfile


def setup(root, failure='none'):
    root = Path(root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    source, target = root / 'source', root / 'target'
    for directory in (source / 'bin', target / 'bin', target / 'OPatch', root / 'media', root / 'files', root / 'logs', root / 'wallet'):
        directory.mkdir(parents=True, exist_ok=True)
    script = '#!' + sys.executable + '\n' + Path(__file__).read_text().split('\n', 1)[1]
    for executable in (root / 'java', source / 'bin/sqlplus', target / 'bin/sqlplus', target / 'OPatch/opatch'):
        executable.write_text(script)
        executable.chmod(0o700)
    jar = root / 'simulated.jar'
    jar.write_text('ALIS SIMULATION ONLY\n')
    (root / 'fault.txt').write_text(failure)
    (root / 'profile.txt').write_text('26.6.260925')
    (root / 'active-home').write_text('source')
    (root / 'wallet/cwallet.sso').write_text('SIMULATION ONLY')
    config = 'global.global_log_dir=' + str(root / 'logs') + '\npatch1.sid=SIMDB\npatch1.source_home=' + str(source) + '\npatch1.target_home=' + str(target) + '\n'
    plan = {'format': 2, 'simulation': True, 'profile': '26.6.260925', 'java': str(root / 'java'), 'jar': str(jar), 'jar_sha256': hashlib.sha256(jar.read_bytes()).hexdigest(), 'config_sha256': hashlib.sha256(config.encode()).hexdigest(), 'home_config_sha256': hashlib.sha256(config.encode()).hexdigest(), 'create_home_prechecks': True, 'sid': 'SIMDB', 'source_home': str(source), 'target_home': str(target), 'log_dir': str(root / 'logs'), 'folder': str(root / 'media'), 'download': True, 'keystore': str(root / 'wallet'), 'resume_cli': True}
    (root / 'files/autoupgrade.cfg').write_text(config)
    (root / 'files/autoupgrade.home.cfg').write_text(config)
    (root / 'files/plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    shutil.copyfile(Path(__file__).resolve().parents[1] / 'files/runner.py', root / 'files/runner.py')
    print(json.dumps({'sandbox': str(root), 'simulation': True}))


def tool_root():
    path = Path(__file__).resolve()
    return path.parent if path.name == 'java' else path.parents[2]


def fake_java(root, fault):
    if '-version' in sys.argv:
        print('AutoUpgrade ' + ('00.0.000000' if fault == 'version' else (root / 'profile.txt').read_text()))
        return 0
    config = Path(sys.argv[sys.argv.index('-config') + 1])
    plan = json.loads((config.parent / 'plan.json').read_text())
    mode = sys.argv[sys.argv.index('-mode') + 1]
    with open(root / 'commands.jsonl', 'a') as stream:
        stream.write(json.dumps(sys.argv[1:]) + '\n')
    if fault == 'interrupted' and mode == 'deploy' and not (root / 'interrupted-once').exists():
        (root / 'interrupted-once').touch()
        print('Simulated interrupted deploy')
        return 7
    if fault == 'slow':
        time.sleep(8)
    if mode == 'download':
        if fault == 'download':
            print('Simulated download produced no media, despite Java returning zero.')
            return 0
        media = root / 'media/simulated-home.zip'
        with zipfile.ZipFile(media, 'w') as archive:
            archive.writestr('SIMULATION.txt', 'ALIS SIMULATION ONLY')
        checksum = hashlib.sha256(media.read_bytes()).hexdigest()
        metadata = {'patchFolder': str(root / 'media'), 'patches': [{'description': 'Gold Image', 'releaseUpdate': '19.28.0.0.0', 'files': [{'name': media.name, 'size': media.stat().st_size, 'checksum-256': '0' * 64 if fault == 'checksum' else checksum}]}]}
        (root / 'media/patches_info.json').write_text(json.dumps(metadata))
        print('Simulated download completed. No job status/progress is written by download mode.')
        return 0
    stages = ['PRECHECKS'] if mode == 'analyze' else ['PRECHECKS', 'DB_PATCHING', 'POSTCHECKS', 'COMPLETED']
    if mode == 'create_home':
        stages = ['PREACTIONS', 'EXTRACT', 'DBTOOLS', 'INSTALL', 'OH_PATCHING', 'OPTIONS', 'ROOTSH', 'POSTACTIONS']
        if plan.get('create_home_prechecks'):
            stages.insert(1, 'PRECHECKS')
        if fault != 'missing-home':
            (root / 'target/bin/oracle').write_text('SIMULATION ONLY')
        if fault == 'switched-home':
            (root / 'active-home').write_text('target')
    log_directory = root / 'logs' / plan['sid'] / '100'
    job = {'sid': plan['sid'], 'dbName': plan['sid'], 'logDirectory': str(log_directory), 'jobNo': 100, 'deployMode': mode.upper(), 'sourceHome': plan['source_home'], 'targetHome': plan['target_home'], 'stages': [{'stageName': stage, 'status': 1 if fault == 'status' and mode == 'deploy' else 0, 'errors': [{'reason': 'simulated error'}] if fault == 'status' and mode == 'deploy' else []} for stage in stages]}
    if fault == 'wrong-job':
        job['sid'] = 'OTHERDB'
    if mode == 'create_home' and fault == 'root':
        job['stages'][stages.index('ROOTSH')].update(status=1, errors=[{'reason': 'root scripts unfinished'}])
    if mode == 'create_home' and fault == 'missing-root':
        job['stages'] = [stage for stage in job['stages'] if stage['stageName'] != 'ROOTSH']
    progress = {'sid': plan['sid'], 'jobNo': 100, 'totalPercentCompleted': 80 if fault == 'incomplete' and mode == 'deploy' else 100, 'stages': [{'stage': stage, 'percentCompleted': '100'} for stage in stages]}
    for stage in progress['stages']:
        if stage['stage'] in ('PRECHECKS', 'POSTCHECKS'):
            checks = [{'checkname': 'SIMULATED_CHECK', 'severity': 'ERROR', 'fixup_available': 'YES' if fault == 'fixable-error' else 'NO'}] if fault in ('checks', 'fixable-error') else []
            if fault == 'warnings':
                checks = [{'checkname': severity + '_CHECK', 'severity': severity, 'fixup_available': 'NO'} for severity in ('INFO', 'RECOMMEND', 'WARNING')]
            stage['containers'] = [{'container': 'CDB$ROOT', 'totalChecks': max(1, len(checks)), 'completedChecks': max(1, len(checks)), 'runningChecks': [], 'checksWithExecutionError': ['SIMULATED_CHECK'] if fault == 'check-execution' else [], 'checksFailed': [check['checkname'] for check in checks]}]
            report_directory = log_directory / stage['stage'].lower()
            report_directory.mkdir(parents=True, exist_ok=True)
            report_path = report_directory / (plan['sid'].lower() + '_checklist.json')
            if fault != 'missing-checklist':
                report_path.write_text(json.dumps({'SID': plan['sid'], 'containers': [{'containername': 'CDB$ROOT', 'checks': checks}]}))
                if fault == 'stale-checklist':
                    import os
                    os.utime(report_path, (1, 1))
    directory = root / 'logs/cfgtoollogs/patch/auto/status'
    directory.mkdir(parents=True, exist_ok=True)
    for name, value in [('status', job), ('progress', progress)]:
        path = directory / (name + '.json')
        path.write_text(json.dumps({'totalJobs': 1, 'jobs': [value]}))
        if fault == 'stale' and mode == 'deploy':
            import os
            os.utime(path, (1, 1))
    print('Simulated ' + mode + ' finished. Java return code is zero.')
    if mode == 'deploy':
        (root / 'active-home').write_text('target')
    return 0


def fake_sqlplus(root, fault):
    if Path(__file__).resolve().parents[1].name != (root / 'active-home').read_text():
        print('The running instance uses another Oracle home.')
        return 4
    sql = sys.stdin.read()
    if 'ALIS_PATCH' in sql:
        for container in (1, 2, 3):
            if fault == 'missing-pdb' and container == 3:
                continue
            print('ALIS_PATCH|{}|37960098|APPLY|{}'.format(container, 'WITH ERRORS' if fault == 'sqlpatch' else 'SUCCESS'))
    else:
        print('ALIS_DB|SIMDB|OPEN|PRIMARY|READ WRITE')
        print('ALIS_CLUSTER|' + ('TRUE' if fault == 'rac' else 'FALSE'))
        print('ALIS_DG|' + ('1' if fault == 'dataguard' else '0'))
        print('ALIS_DG_CONFIG|NONE')
        print('ALIS_PMON|123')
        print('ALIS_CONTAINER|1|CDB$ROOT|READ WRITE')
        print('ALIS_CONTAINER|2|PDB$SEED|READ ONLY')
        print('ALIS_CONTAINER|3|LABPDB|' + ('MOUNTED' if fault == 'closed-pdb' else 'READ WRITE'))
    return 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'setup':
        setup(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'none')
        return 0
    root = tool_root()
    fault = (root / 'fault.txt').read_text().strip()
    name = Path(__file__).name
    if name == 'java':
        return fake_java(root, fault)
    if name == 'sqlplus':
        return fake_sqlplus(root, fault)
    if name == 'opatch':
        print('37960098;Database Release Update : ' + ('19.29' if fault == 'home-inventory' else '19.28') + '.0.0.250715 (37960098)')
        return 0
    raise RuntimeError('Simulator must run through setup or a fake tool.')


if __name__ == '__main__':
    sys.exit(main())
