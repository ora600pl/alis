#!/usr/bin/env python3
"""Original fake Oracle tools for local Ansible tests. No Oracle or network access."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import time
import zipfile


def setup(root, failure='none', operation='patch'):
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
    plan['operation'] = operation
    if operation == 'upgrade':
        plan.update(target_version='23', create_oracle_home=failure != 'existing-home', download=failure != 'existing-home')
        config = config.replace('patch1.', 'upg1.') + 'upg1.target_version=26\nupg1.create_oracle_home=' + ('YES' if plan['create_oracle_home'] else 'NO') + '\n'
        plan.update(config_sha256=hashlib.sha256(config.encode()).hexdigest(), home_config_sha256=hashlib.sha256(config.encode()).hexdigest())
        (source / 'jdk/bin').mkdir(parents=True)
        (source / 'jdk/bin/java').write_text(script)
        if failure == 'existing-home':
            (target / 'bin/oracle').write_text('SIMULATION ONLY')
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
    if ('-patch' in sys.argv) != (plan.get('operation', 'patch') == 'patch'):
        print('Wrong AutoUpgrade operation flag')
        return 9
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
    upgrade = plan.get('operation') == 'upgrade'
    if upgrade and mode == 'deploy':
        stages = ['GRP', 'PREUPGRADE', 'PRECHECKS', 'PREFIXUPS', 'DRAIN', 'DBUPGRADE', 'POSTCHECKS', 'POSTFIXUPS', 'POSTUPGRADE']
        if plan.get('create_oracle_home'):
            stages.insert(0, 'CREATEORACLEHOME')
            (root / 'target/bin/oracle').write_text('SIMULATION ONLY')
        if fault == 'missing-upgrade':
            stages.remove('DBUPGRADE')
    if mode == 'create_home':
        stages = ['PREACTIONS', 'EXTRACT', 'DBTOOLS', 'INSTALL', 'OH_PATCHING', 'OPTIONS', 'ROOTSH', 'POSTACTIONS']
        if plan.get('create_home_prechecks'):
            stages.insert(1, 'PRECHECKS')
        if fault != 'missing-home':
            (root / 'target/bin/oracle').write_text('SIMULATION ONLY')
        if fault == 'switched-home':
            (root / 'active-home').write_text('target')
    sid = 'create_home_1' if mode == 'create_home' else plan['sid']
    log_directory = root / 'logs' / sid / '100'
    job = {'sid': sid, 'dbName': sid, 'logDirectory': str(log_directory), 'jobNo': 100, 'deployMode': mode.upper(), 'sourceHome': plan['source_home'], 'targetHome': plan['target_home'], 'stages': [{'stageName': stage, 'status': 1 if fault == 'status' and mode == 'deploy' else 0, 'errors': [{'reason': 'simulated error'}] if fault == 'status' and mode == 'deploy' else []} for stage in stages]}
    if fault == 'wrong-job':
        job['sid'] = 'OTHERDB'
    if mode == 'create_home' and fault == 'root':
        job['stages'][stages.index('ROOTSH')].update(status=1, errors=[{'reason': 'root scripts unfinished'}])
    if mode == 'create_home' and fault == 'missing-root':
        job['stages'] = [stage for stage in job['stages'] if stage['stageName'] != 'ROOTSH']
    progress = {'sid': sid, 'jobNo': 100, 'totalPercentCompleted': 80 if fault == 'incomplete' and mode == 'deploy' else 100, 'stages': [{'stage': stage, 'percentCompleted': '100'} for stage in stages]}
    if upgrade:
        job['modules'] = [dict(moduleName=stage.pop('stageName'), **stage) for stage in job.pop('stages')]
    for stage in progress['stages']:
        if stage['stage'] in ('PRECHECKS', 'POSTCHECKS'):
            checks = [{'checkname': 'SIMULATED_CHECK', 'severity': 'ERROR', 'fixup_available': 'YES' if fault == 'fixable-error' else 'NO'}] if fault in ('checks', 'fixable-error') else []
            if fault == 'warnings':
                checks = [{'checkname': severity + '_CHECK', 'severity': severity, 'fixup_available': 'NO'} for severity in ('INFO', 'RECOMMEND', 'WARNING')]
            container = sid if mode == 'create_home' else 'CDB$ROOT'
            stage['containers'] = [{'container': container, 'totalChecks': max(1, len(checks)), 'completedChecks': max(1, len(checks)), 'runningChecks': [], 'checksWithExecutionError': ['SIMULATED_CHECK'] if fault == 'check-execution' else [], 'checksFailed': [check['checkname'] for check in checks]}]
            report_directory = log_directory / stage['stage'].lower()
            report_directory.mkdir(parents=True, exist_ok=True)
            report_path = report_directory / (sid.lower() + '_checklist.json')
            if fault != 'missing-checklist':
                report_path.write_text(json.dumps({'SID': sid, 'containers': [{'containername': container, 'checks': checks}]}))
                if fault == 'stale-checklist':
                    import os
                    os.utime(report_path, (1, 1))
    directory = root / ('logs/status' if upgrade else 'logs/cfgtoollogs/patch/auto/status')
    directory.mkdir(parents=True, exist_ok=True)
    for name, value in [('status', job), ('progress', progress)]:
        path = directory / (name + '.json')
        path.write_text(json.dumps({'totalJobs': 1, 'jobs': [value]}))
        if fault == 'stale' and mode == 'deploy':
            import os
            os.utime(path, (1, 1))
    if fault == 'progress' and mode == 'deploy':
        # Native reports include future stages at 0%, in execution order.
        for percentage in (20, 60):
            progress['totalPercentCompleted'] = percentage
            for stage in progress['stages']:
                changing = 'DBUPGRADE' if upgrade else 'DB_PATCHING'
                stage['percentCompleted'] = str(percentage) if stage['stage'] == changing else '100' if stages.index(stage['stage']) < stages.index(changing) else '0'
                stage['lastUpdateTime'] = '2026-10-05 12:00:00' if stage['stage'] in ('PRECHECKS', 'DB_PATCHING') else ''
            (directory / 'progress.json').write_text(json.dumps({'totalJobs': 1, 'jobs': [progress]}))
            time.sleep(4)
        progress['totalPercentCompleted'] = 100
        for stage in progress['stages']:
            stage['percentCompleted'] = '100'
        (directory / 'progress.json').write_text(json.dumps({'totalJobs': 1, 'jobs': [progress]}))
    print('Simulated ' + mode + ' finished. Java return code is zero.')
    if mode == 'deploy':
        (root / 'active-home').write_text('target')
    return 0


def fake_sqlplus(root, fault):
    upgrade = json.loads((root / 'files/plan.json').read_text()).get('operation') == 'upgrade'
    if '-V' in sys.argv:
        print('SQL*Plus: Release ' + ('19' if fault == 'target-version' else '23' if upgrade else '19') + '.0.0.0.0')
        return 0
    if Path(__file__).resolve().parents[1].name != (root / 'active-home').read_text():
        print('The running instance uses another Oracle home.')
        return 4
    sql = sys.stdin.read()
    with (root / 'sql.jsonl').open('a') as stream:
        stream.write(json.dumps(sql) + '\n')
    if 'ALIS_VERSION' in sql:
        print('ALIS_VERSION|' + ('23.0.0.0.0' if fault == 'same-release' else '19.0.0.0.0'))
    elif 'ALIS_PATCH' in sql or 'ALIS_COMPONENT' in sql:
        # Real CDB views can omit PDB$SEED. Local queries must switch sessions.
        names = {'CDB$ROOT': 1, 'PDB$SEED': 2, 'LABPDB': 3}
        containers = [names[name.replace('""', '"')] for name in re.findall(r'alter session set container = "((?:[^"]|"")*)";', sql)]
        if fault == 'noncdb':
            containers = [0]
        if 'from cdb_registry_sqlpatch' in sql:
            containers = [1, 3]
        for container in containers:
            context = 99 if fault == 'patch-context' and container == 2 else container
            if 'ALIS_PATCH_CONTEXT' in sql:
                print('ALIS_PATCH_CONTEXT|' + str(context))
            if fault == 'missing-pdb' and container == 3:
                continue
            if fault == 'missing-seed' and container == 2:
                continue
            if 'ALIS_COMPONENT' in sql:
                print('ALIS_COMPONENT_CONTEXT|' + str(context))
                for component in ('CATALOG', 'CATPROC', 'JAVAVM'):
                    print('ALIS_COMPONENT|{}|{}|{}.0.0.0.0|{}'.format(container, component, '19' if fault == 'component-version' and container == 2 else '23', 'INVALID' if fault == 'components' else 'VALID'))
                continue
            print('ALIS_PATCH|{}|37960098|APPLY|{}'.format(container, 'WITH ERRORS' if fault == 'sqlpatch' else 'SUCCESS'))
    else:
        print('ALIS_DB|SIMDB|OPEN|PRIMARY|READ WRITE')
        print('ALIS_CLUSTER|' + ('TRUE' if fault == 'rac' else 'FALSE'))
        print('ALIS_DG|' + ('1' if fault == 'dataguard' else '0'))
        print('ALIS_DG_CONFIG|NONE')
        print('ALIS_PMON|123')
        if fault == 'noncdb':
            print('ALIS_CONTAINER|0|SIMDB|READ WRITE')
        else:
            print('ALIS_CONTAINER|1|CDB$ROOT|READ WRITE')
            print('ALIS_CONTAINER|2|PDB$SEED|READ ONLY')
            print('ALIS_CONTAINER|3|LABPDB|' + ('MOUNTED' if fault == 'closed-pdb' else 'READ WRITE'))
    return 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'setup':
        setup(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'none', sys.argv[4] if len(sys.argv) > 4 else 'patch')
        return 0
    root = tool_root()
    fault = (root / 'fault.txt').read_text().strip()
    name = Path(__file__).name
    if name == 'java':
        return fake_java(root, fault)
    if name == 'sqlplus':
        return fake_sqlplus(root, fault)
    if name == 'opatch':
        upgrade = json.loads((root / 'files/plan.json').read_text()).get('operation') == 'upgrade'
        print('37960098;Database Release Update : ' + ('23.26.3' if upgrade else '19.29' if fault == 'home-inventory' else '19.28') + '.0.0.250715 (37960098)')
        return 0
    raise RuntimeError('Simulator must run through setup or a fake tool.')


if __name__ == '__main__':
    sys.exit(main())
