#!/usr/bin/env python3
"""ALIS AutoUpgrade runner. Python standard library; no passwords or shell commands."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import zipfile

PHASES = ('analyze', 'download', 'create_home', 'deploy')


def digest(path):
    with open(path, 'rb') as stream:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
        return checksum.hexdigest()


def save(path, value):
    temp = path.with_suffix('.tmp')
    with open(temp, 'w', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=True)
        stream.write('\n')
    os.chmod(temp, 0o600)
    os.replace(temp, path)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def job_for(report, sid):
    require(isinstance(report, dict) and isinstance(report.get('jobs'), list), 'Unknown AutoUpgrade JSON schema.')
    require(all(isinstance(job, dict) for job in report['jobs']), 'Unknown AutoUpgrade job schema.')
    jobs = [job for job in report['jobs'] if str(job.get('sid', '')).upper() == sid.upper()]
    require(len(jobs) == 1 and len(report['jobs']) == 1, 'Expected exactly one AutoUpgrade job for SID ' + sid)
    return jobs[0]


def check_status(status, progress, plan, mode):
    job = job_for(status, plan['sid'])
    ongoing = job_for(progress, plan['sid'])
    require(str(job.get('deployMode', '')).lower() == mode, 'AutoUpgrade status belongs to another mode.')
    require(type(job.get('jobNo')) is int and job['jobNo'] > 0 and job['jobNo'] == ongoing.get('jobNo'), 'Status and progress refer to different jobs.')
    require(job.get('sourceHome') == plan['source_home'] and job.get('targetHome') == plan['target_home'], 'AutoUpgrade reported different Oracle homes.')
    stages = job.get('stages', [])
    require(isinstance(stages, list) and stages and all(isinstance(stage, dict) for stage in stages), 'AutoUpgrade did not report any completed stages.')
    require(all(type(stage.get('status')) is int and stage['status'] == 0 and stage.get('errors') == [] for stage in stages), 'AutoUpgrade reported an unsuccessful stage. Inspect status.json and the operation log.')
    names = {stage.get('stageName') for stage in stages}
    required = {'PRECHECKS'} if mode == 'analyze' else {'DB_PATCHING', 'POSTCHECKS'}
    if mode == 'create_home':
        required = {'INSTALL', 'OH_PATCHING', 'OPTIONS', 'ROOTSH'}
        if plan.get('create_home_prechecks'):
            required.add('PRECHECKS')
    require(required <= names, 'Missing required AutoUpgrade stages: ' + ', '.join(sorted(required - names)))
    require(ongoing.get('totalPercentCompleted') == 100, 'AutoUpgrade job has not reached 100%.')
    require(isinstance(ongoing.get('stages'), list) and ongoing['stages'] and all(isinstance(s, dict) and str(s.get('percentCompleted')) == '100' for s in ongoing['stages']), 'AutoUpgrade has unfinished stages.')
    for stage in ongoing['stages']:
        if stage.get('stage') not in ('PRECHECKS', 'POSTCHECKS'):
            continue
        containers = stage.get('containers')
        require(isinstance(containers, list) and containers, 'Missing per-container check results.')
        for container in containers:
            require(isinstance(container, dict), 'Unknown per-container check schema.')
            require(container.get('runningChecks') == [] and container.get('checksWithExecutionError') == [] and container.get('checksFailed') == [], 'AutoUpgrade has unfinished, failed or execution-error database checks. Review the per-container check report before deployment.')
            require(type(container.get('totalChecks')) is int and container['totalChecks'] == container.get('completedChecks'), 'Not all database checks completed.')
    return {'job': job.get('jobNo'), 'stages': sorted(names), 'mode': mode}


DATABASE_SQL = """whenever oserror exit failure
whenever sqlerror exit failure
set heading off feedback off pagesize 0 linesize 32767 trimspool on verify off echo off
select 'ALIS_DB|' || i.instance_name || '|' || i.status || '|' || d.database_role || '|' || d.open_mode from v$instance i cross join v$database d;
select 'ALIS_CLUSTER|' || value from v$parameter where name='cluster_database';
select 'ALIS_DG|' || count(*) from v$archive_dest where target='STANDBY' and status <> 'INACTIVE';
select 'ALIS_DG_CONFIG|' || nvl(value, 'NONE') from v$parameter where name='log_archive_config';
select 'ALIS_PMON|' || spid from v$process where pname='PMON';
select 'ALIS_CONTAINER|' || con_id || '|' || name || '|' || open_mode from v$containers;
exit
"""

PATCH_SQL = """whenever oserror exit failure
whenever sqlerror exit failure
set heading off feedback off pagesize 0 linesize 32767 trimspool on verify off echo off
select 'ALIS_PATCH|' || con_id || '|' || patch_id || '|' || action || '|' || status from (
  select con_id, patch_id, action, status, row_number() over (partition by con_id, patch_id order by action_time desc, install_id desc) rn
  from cdb_registry_sqlpatch
) where rn=1;
exit
"""


class Runner:
    def __init__(self, args):
        self.args = args
        self.root = Path(args.plan).resolve().parent
        self.results = self.root / 'results'
        self.results.mkdir(mode=0o700, exist_ok=True)
        self.plan = json.loads(Path(args.plan).read_text(encoding='utf-8'))
        require(self.plan.get('format') == 2, 'Export a new bundle for the explicit four-phase workflow. Keep an existing cycle with its original runner.')
        self.plan_hash = digest(args.plan)
        require(args.plan_sha == self.plan_hash, 'The staged plan differs from this bundle.')
        require(bool(self.plan.get('simulation')) == args.simulation, 'Simulation requires both a simulation plan and --simulation. Real plans never use the simulator.')
        self.simulation = args.simulation
        self.config = self.root / 'autoupgrade.cfg'
        require(not self.config.is_symlink() and digest(self.config) == self.plan['config_sha256'], 'Configuration changed. Use the original bundle to resume.')
        self.home_config = self.root / 'autoupgrade.home.cfg'
        require(not self.home_config.is_symlink() and digest(self.home_config) == self.plan['home_config_sha256'], 'Home-preparation configuration changed. Use the original bundle to resume.')
        self.state_path = self.root / 'state.json'
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {'plan_sha256': self.plan_hash, 'operations': {}}
        require(self.state.get('plan_sha256') == self.plan_hash, 'This directory belongs to another patch cycle.')
        self.child = None
        self.started_action = False
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, self.interrupted)

    def interrupted(self, signum, frame):
        if self.child is not None and self.child.poll() is None:
            self.child.terminate()
            try:
                self.child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait()
        raise RuntimeError('Execution interrupted. Keep the bundle and recovery state; use an explicit resume.')

    def command(self, argv, name, stdin=None, home=None):
        env = os.environ.copy()
        if home:
            env.update(ORACLE_HOME=home, ORACLE_SID=self.plan['sid'], LD_LIBRARY_PATH=home + '/lib', PATH=home + '/bin:' + env.get('PATH', ''))
        output = self.results / (name + '.log')
        with open(output, 'w', encoding='utf-8') as stream:
            self.child = subprocess.Popen(argv, stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT, text=True, env=env, cwd=self.root)
            try:
                self.child.communicate(input=stdin)
                rc = self.child.returncode
            finally:
                self.child = None
        text = output.read_text(encoding='utf-8', errors='replace')
        require(rc == 0, '{} failed (rc={}); inspect {}.'.format(name, rc, output))
        return text

    def validate_jar(self):
        require(digest(self.plan['jar']) == self.plan['jar_sha256'], 'JAR SHA-256 does not match the selected ALIS profile. Keep the same JAR for the whole patch cycle.')
        text = self.command([self.plan['java'], '-jar', self.plan['jar'], '-version'], 'jar-version')
        require(re.search(r'(?<![\d.])' + re.escape(self.plan['profile']) + r'(?![\d.])', text), 'JAR build does not match the selected profile.')

    def database(self, home, name):
        text = self.command([home + '/bin/sqlplus', '-L', '-S', '/ as sysdba'], name, DATABASE_SQL, home)
        rows = [line.strip().split('|') for line in text.splitlines() if line.strip().startswith('ALIS_')]
        groups = {}
        for row in rows:
            groups.setdefault(row[0], []).append(row[1:])
        require(len(groups.get('ALIS_DB', [])) == 1, 'SQLPlus did not return exactly one instance identity.')
        instance = groups['ALIS_DB'][0]
        require(len(instance) == 4 and instance[0].upper() == self.plan['sid'].upper(), 'Connected to another SID.')
        require(instance[1:] == ['OPEN', 'PRIMARY', 'READ WRITE'], 'Expected an open primary database in READ WRITE mode.')
        require(groups.get('ALIS_CLUSTER') == [['FALSE']], 'RAC, RAC One Node and SEHA need a separate coordinated workflow.')
        require(groups.get('ALIS_DG') == [['0']] and groups.get('ALIS_DG_CONFIG') == [['NONE']], 'Data Guard requires a separate coordinated workflow.')
        require(len(groups.get('ALIS_PMON', [])) == 1, 'Could not identify the PMON process.')
        pid = groups['ALIS_PMON'][0][0]
        require(pid.isdigit(), 'Invalid PMON process identifier.')
        if not self.simulation:
            require(sys.platform.startswith('linux'), 'The execution host must be Linux.')
            actual = Path('/proc') / pid / 'exe'
            require(actual.resolve() == (Path(home) / 'bin/oracle').resolve(), 'The running instance uses another Oracle home.')
        return groups

    def prepare(self):
        if self.state['operations'].get('deploy', {}).get('native_complete'):
            return self.verify()
        self.validate_jar()
        self.database(self.plan['source_home'], 'database-before')
        folder = self.plan.get('folder')
        require(folder and Path(folder).is_dir(), 'Prepare the patch media directory on the execution host first.')
        if self.plan.get('download'):
            wallet = Path(self.plan['keystore'])
            require((wallet / 'cwallet.sso').is_file(), 'Online patching needs a previously prepared AutoUpgrade auto-login wallet (cwallet.sso). Run -load_password interactively on the host first.')
        return {'changed': False, 'message': 'JAR, database identity, topology and media prerequisites checked.'}

    def status(self, mode, started):
        base = Path(self.plan['log_dir']) / 'status'
        reports = {}
        for name in ('status', 'progress'):
            path = base / (name + '.json')
            require(path.is_file() and path.stat().st_mtime >= started - 1, 'Missing or stale AutoUpgrade ' + str(path))
            reports[name] = json.loads(path.read_text(encoding='utf-8'))
            save(self.results / (mode + '-' + name + '.json'), reports[name])
        return check_status(reports['status'], reports['progress'], self.plan, mode)

    def media(self, started=None, previous=None):
        folder = Path(self.plan['folder'])
        manifest = folder / 'patches_info.json'
        files = {}
        if self.plan['download']:
            require(manifest.is_file() and not manifest.is_symlink(), 'Missing download metadata: ' + str(manifest))
            if started is not None:
                require(manifest.stat().st_mtime >= started, 'Stale download metadata; this download was not certified.')
            metadata = json.loads(manifest.read_text(encoding='utf-8'))
            save(self.results / 'download-patches_info.json', metadata)
            require(isinstance(metadata, dict) and metadata.get('patchFolder') == str(folder) and isinstance(metadata.get('patches'), list) and metadata['patches'] and all(isinstance(patch, dict) for patch in metadata['patches']), 'Unknown or mismatched download metadata.')
            ru = self.plan.get('pinned_ru')
            if ru:
                require(any(re.fullmatch(re.escape(ru) + r'(?:\.\d+)*', str(patch.get('releaseUpdate', ''))) for patch in metadata['patches']), 'Download metadata does not contain the pinned RU ' + ru)
            for patch in metadata['patches']:
                require(isinstance(patch.get('files'), list) and patch['files'], 'Download metadata has no files.')
                for entry in patch['files']:
                    require(isinstance(entry, dict), 'Unknown download file metadata.')
                    name = entry.get('name', '')
                    require(isinstance(name, str) and name and Path(name).name == name and name not in ('.', '..'), 'Invalid media filename in download metadata.')
                    path = folder / name
                    require(path.is_file() and not path.is_symlink() and path.stat().st_size > 0, 'Missing downloaded file: ' + name)
                    if 'size' in entry:
                        require(path.stat().st_size == entry['size'], 'Downloaded file size differs: ' + name)
                    checksum = digest(path)
                    expected = entry.get('checksum-256')
                    if expected:
                        require(isinstance(expected, str) and re.fullmatch(r'[a-fA-F0-9]{64}', expected), 'Unknown SHA-256 checksum for ' + name)
                        require(checksum.lower() == expected.lower(), 'Downloaded file checksum differs: ' + name)
                    else:
                        expected = entry.get('checksum')
                        require(isinstance(expected, str) and re.fullmatch(r'[a-fA-F0-9]{40}', expected), 'No published checksum for ' + name + '; review the native download before using these files.')
                        with open(path, 'rb') as stream:
                            sha1 = hashlib.sha1()
                            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                                sha1.update(chunk)
                        require(sha1.hexdigest().lower() == expected.lower(), 'Downloaded file checksum differs: ' + name)
                    files[name] = checksum
        else:
            # Offline inputs may be local Gold Images without Oracle download metadata.
            for path in sorted(folder.iterdir()):
                if path.is_file() and not path.is_symlink():
                    files[path.name] = digest(path)
                    if path.suffix.lower() == '.zip':
                        with zipfile.ZipFile(path) as archive:
                            require(archive.namelist() and archive.testzip() is None, 'Invalid staged ZIP: ' + path.name)
        require(any(name.lower().endswith('.zip') for name in files), 'No software ZIP exists in the media directory.')
        evidence = {'files_sha256': files, 'online': self.plan['download']}
        if previous is not None:
            require(evidence == previous, 'Patch media changed after download verification. Preserve the original cycle and inspect the files.')
        save(self.results / 'media-verification.json', evidence)
        return evidence

    def inventory(self):
        home = self.plan['target_home']
        require(all((Path(home) / name).is_file() for name in ('bin/oracle', 'bin/sqlplus', 'OPatch/opatch')), 'Target Oracle home is incomplete.')
        text = self.command([home + '/OPatch/opatch', 'lspatches'], 'inventory', home=home)
        patches = {match[1]: match[2] for match in re.finditer(r'^\s*(\d+);(.*)$', text, re.M)}
        sql_ids = {patch for patch, description in patches.items() if re.search(r'Database Release Update|OJVM RELEASE UPDATE', description, re.I)}
        require(sql_ids, 'Could not identify a Database RU or OJVM in target-home inventory.')
        pinned_ru = self.plan.get('pinned_ru')
        if pinned_ru:
            require(any('Database Release Update' in description and re.search(r'(?<![\d.])' + re.escape(pinned_ru) + r'(?:\.\d+)*(?![\d.])', description) for description in patches.values()), 'Target inventory does not contain the pinned RU ' + pinned_ru)
        return patches, sql_ids

    def home(self, previous=None):
        patches, _ = self.inventory()
        evidence = {'home': self.plan['target_home'], 'patches': patches}
        if previous is not None:
            require(evidence == previous, 'Target inventory changed after create_home verification.')
        save(self.results / 'home-verification.json', evidence)
        return evidence

    def execute(self, mode):
        operations = self.state['operations']
        previous = operations.get(mode)
        resume = self.args.resume and (bool(previous) or not self.args.cycle)
        if previous and previous.get('verified'):
            if mode == 'deploy':
                self.verify()
            elif mode == 'download' and not operations.get('deploy', {}).get('native_complete'):
                self.media(previous=previous['evidence'])
            elif mode == 'create_home' and not operations.get('deploy', {}).get('native_complete'):
                self.home(previous=previous['home'])
            return {'changed': False, 'message': mode + ' already succeeded in this patch cycle.'}
        if mode == 'deploy' and previous and previous.get('native_complete'):
            self.verify()
            return {'changed': False, 'message': 'AutoUpgrade had completed; final verification now passed without another deployment.'}
        require(not previous or resume, 'The previous operation was interrupted or failed. Inspect its logs and use -e alis_resume=true with the original bundle.')
        require(not resume or previous, 'There is no interrupted operation to resume.')
        for prerequisite in PHASES[:PHASES.index(mode)]:
            require(operations.get(prerequisite, {}).get('verified'), 'Run ' + prerequisite + '.yml successfully before ' + mode + '.yml.')
        self.validate_jar()
        if not resume:
            self.prepare()
        if mode in ('create_home', 'deploy'):
            self.media(previous=operations['download']['evidence'])
        if mode == 'deploy':
            self.home(previous=operations['create_home']['home'])
        if mode == 'create_home' and previous and previous.get('native_complete'):
            operations[mode].update(home=self.home(), verified=True, status='succeeded', ended=time.time())
            self.database(self.plan['source_home'], 'database-after-create_home')
            save(self.state_path, self.state)
            return {'changed': False, 'message': 'Home creation had completed; verification now passed without another installation.'}
        config = self.home_config if mode == 'create_home' and self.plan.get('home_config_separate') else self.config
        flags = [self.plan['java'], '-jar', self.plan['jar'], '-patch', '-config', str(config), '-mode', mode, '-noconsole']
        if self.plan.get('settings'):
            require(digest(self.plan['settings']) == self.plan.get('settings_sha256'), 'Expert settings require a pinned settings_sha256 in plan.json.')
            flags += ['-settings', self.plan['settings']]
        if self.plan.get('debug'):
            flags += ['-debug']
        if mode == 'deploy' and self.plan.get('restore_on_fail'):
            flags += ['-restore_on_fail']
        if resume and self.plan['resume_cli'] and mode != 'download':
            flags += ['-resume']
        started = time.time()
        operations[mode] = {'started': started, 'verified': False, 'status': 'running'}
        save(self.state_path, self.state)
        try:
            self.started_action = True
            if mode != 'download' or self.plan['download']:
                self.command(flags, mode)
            evidence = self.media(started=started) if mode == 'download' else self.status(mode, started)
            operations[mode].update(native_complete=True, evidence=evidence)
            save(self.state_path, self.state)
            if mode == 'deploy':
                self.verify(require_deploy=False)
            elif mode == 'create_home':
                operations[mode]['home'] = self.home()
                self.database(self.plan['source_home'], 'database-after-create_home')
            elif mode == 'download':
                self.database(self.plan['source_home'], 'database-after-download')
            operations[mode].update(verified=True, status='succeeded', evidence=evidence, ended=time.time())
            save(self.state_path, self.state)
            return {'changed': mode != 'download' or self.plan['download'], 'message': mode + ' completed and verified.', 'evidence': evidence}
        except BaseException as error:
            operations[mode].update(status='failed', error=str(error), ended=time.time())
            save(self.state_path, self.state)
            raise

    def verify(self, require_deploy=True):
        if require_deploy:
            require(self.state['operations'].get('deploy', {}).get('native_complete'), 'No successfully completed AutoUpgrade deployment exists for this patch cycle.')
        self.validate_jar()
        home = self.plan['target_home']
        database = self.database(home, 'database-after')
        _, sql_ids = self.inventory()
        registry = self.command([home + '/bin/sqlplus', '-L', '-S', '/ as sysdba'], 'sqlpatch', PATCH_SQL, home)
        rows = [line.strip().split('|')[1:] for line in registry.splitlines() if line.strip().startswith('ALIS_PATCH|')]
        require(rows and all(len(row) == 4 for row in rows), 'SQL patch registry was empty or malformed.')
        containers = database.get('ALIS_CONTAINER', [])
        require(containers and all(len(row) == 3 for row in containers), 'No container state was returned.')
        require(all(row[2] in ('READ WRITE', 'READ ONLY') for row in containers), 'Closed PDBs prevent complete SQL-patch verification. Open them and verify again.')
        applied = {(row[0], row[1]) for row in rows if row[2:] == ['APPLY', 'SUCCESS']}
        require(not any(row[3] != 'SUCCESS' for row in rows), 'The latest SQL patch registry contains an unsuccessful action.')
        required = {(container[0], patch) for container in containers for patch in sql_ids}
        require(required <= applied, 'Target-home SQL patches are missing or unsuccessful in one or more containers: ' + repr(sorted(required - applied)))
        evidence = {'changed': False, 'message': 'Active home, database state, binary inventory and SQL patch registry verified.', 'containers': containers, 'sql_patch_ids': sorted(sql_ids), 'simulation': self.simulation}
        save(self.results / 'verification.json', evidence)
        if require_deploy:
            self.state['operations']['deploy'].update(verified=True, status='succeeded', ended=time.time())
            save(self.state_path, self.state)
        return evidence

    def run(self):
        locks = []
        try:
            # Keep both the bundle and AutoUpgrade log directory exclusive across ALIS runs.
            log_dir = Path(self.plan['log_dir'])
            log_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            for path in sorted({self.root / '.alis.lock', log_dir / '.alis.lock'}):
                require(not path.is_symlink(), 'Lock path must not be a symbolic link.')
                stream = open(path, 'a')
                locks.append(stream)
                try:
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise RuntimeError('Another ALIS process is running. Do not start a second AutoUpgrade instance.')
            # Read state again under the lock, avoiding a stale concurrent snapshot.
            if self.state_path.exists():
                self.state = json.loads(self.state_path.read_text())
                require(self.state.get('plan_sha256') == self.plan_hash, 'Patch-cycle identity changed.')
            result = self.execute(self.args.action) if self.args.action in PHASES else getattr(self, self.args.action)()
            save(self.results / (self.args.action + '-result.json'), result)
            return result
        finally:
            for stream in locks:
                stream.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', *PHASES, 'verify'])
    parser.add_argument('--plan', required=True)
    parser.add_argument('--plan-sha', required=True)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--no-resume', action='store_false', dest='resume')
    parser.add_argument('--cycle', action='store_true')
    parser.add_argument('--single', action='store_false', dest='cycle')
    parser.add_argument('--simulation', action='store_true')
    parser.add_argument('--real', action='store_false', dest='simulation')
    args = parser.parse_args()
    runner = None
    try:
        runner = Runner(args)
        result = runner.run()
        print(json.dumps(result))
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, zipfile.BadZipFile) as error:
        result = {'changed': bool(runner and runner.started_action), 'error': str(error)}
        root = Path(args.plan).resolve().parent / 'results'
        if root.is_dir():
            save(root / (args.action + '-result.json'), result)
        print(json.dumps(result))
        return 1


if __name__ == '__main__':
    sys.exit(main())
