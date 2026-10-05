"""Progress is advisory, cycle-specific and independent of success validation."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('alis_progress', ROOT / 'templates/ansible/library/alis_progress.py')
progress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(progress)


class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='alis-progress-')
        self.root = Path(self.temp.name)
        self.plan = {'sid': 'SIMDB', 'source_home': '/source', 'target_home': '/target', 'log_dir': str(self.root / 'logs'), 'folder': str(self.root / 'media'), 'download': True}
        self.plan_path = self.root / 'plan.json'
        self.plan_path.write_text(json.dumps(self.plan))
        self.sha = hashlib.sha256(self.plan_path.read_bytes()).hexdigest()
        self.started = time.time() - 10
        self.state = {'plan_sha256': self.sha, 'operations': {'deploy': {'status': 'running', 'started': self.started}}}
        self.state_path = self.root / 'state.json'
        self.state_path.write_text(json.dumps(self.state))
        self.base = self.root / 'logs/cfgtoollogs/patch/auto/status'
        self.base.mkdir(parents=True)
        job = dict(self.plan, jobNo=101, deployMode='DEPLOY', sourceHome='/source', targetHome='/target', logDirectory=str(self.root / 'logs/SIMDB/101'))
        self.status = {'jobs': [job]}
        self.report = {'jobs': [{'sid': 'SIMDB', 'jobNo': 101, 'totalPercentCompleted': 35, 'additionalInfo': 'SECRET', 'stages': [
            {'stage': 'PRECHECKS', 'percentCompleted': '100'},
            {'stage': 'DB_PATCHING', 'percentCompleted': '42', 'lastUpdateTime': '2026-10-05 12:00:00', 'events': [{'Name': 'SECRET', 'additionalInfo': 'SECRET'}]},
            {'stage': 'POSTCHECKS', 'percentCompleted': '0'},
        ]}]}
        self.write_reports()

    def tearDown(self):
        self.temp.cleanup()

    def write_reports(self):
        for name, report in (('status', self.status), ('progress', self.report)):
            (self.base / (name + '.json')).write_text(json.dumps(report))

    def snapshot(self, action='deploy', sha=None):
        return progress.snapshot(str(self.root), action, self.sha if sha is None else sha)

    def test_upgrade_progress_uses_native_path_and_container_percentages(self):
        self.plan['operation'] = 'upgrade'
        self.plan_path.write_text(json.dumps(self.plan))
        self.sha = hashlib.sha256(self.plan_path.read_bytes()).hexdigest()
        self.state['plan_sha256'] = self.sha
        self.state_path.write_text(json.dumps(self.state))
        self.base = self.root / 'logs/cfgtoollogs/upgrade/auto/status'
        self.base.mkdir(parents=True)
        stage = self.report['jobs'][0]['stages'][1]
        stage.update(stage='DBUPGRADE', containers=[{'container': 'PDB$SEED', 'percentCompleted': 30}])
        self.write_reports()
        legacy = self.root / 'logs/status'
        legacy.mkdir(parents=True)
        for name in ('status', 'progress'):
            shutil.copy2(self.base / (name + '.json'), legacy / (name + '.json'))
        (self.base / 'progress.json').unlink()
        self.assertFalse(self.snapshot()['available'])
        shutil.copy2(legacy / 'progress.json', self.base / 'progress.json')
        summary = self.snapshot()['summary']
        self.assertIn('DBUPGRADE 42%', summary)
        self.assertIn('PDB$SEED 30%', summary)

    def test_current_stage_precedes_future_stages_and_details_are_not_disclosed(self):
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        result = self.snapshot()
        self.assertTrue(result['available'])
        self.assertIn('job 101 | DB_PATCHING 42% | total 35%', result['summary'])
        self.assertNotIn('SECRET', json.dumps(result))
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_running_checks_and_unknown_stage_start(self):
        stage = self.report['jobs'][0]['stages'][1]
        stage.update(stage='PRECHECKS', percentCompleted='0', lastUpdateTime='', events=[], containers=[{'container': 'PDB$SEED', 'completedChecks': 12, 'totalChecks': 20, 'runningChecks': ['DICTIONARY_STATS']}])
        self.write_reports()
        summary = self.snapshot()['summary']
        self.assertIn('PRECHECKS 0%', summary)
        self.assertNotIn('waiting for', summary)
        self.assertIn('PDB$SEED checks 12/20; running DICTIONARY_STATS', summary)
        stage['containers'] = []
        self.write_reports()
        self.assertIn('waiting for PRECHECKS 0%', self.snapshot()['summary'])

    def test_partial_missing_stale_future_and_mismatched_reports_are_advisory(self):
        path = self.base / 'progress.json'
        for value in ('{', 'null', '{}'):
            path.write_text(value)
            self.assertFalse(self.snapshot()['available'])
        self.write_reports()
        for timestamp in (self.started - 3, time.time() + 10):
            os.utime(path, (timestamp, timestamp))
            self.assertFalse(self.snapshot()['available'])
        for key, value in (('sid', 'OTHER'), ('jobNo', 102)):
            original = copy.deepcopy(self.report)
            self.report['jobs'][0][key] = value
            self.write_reports()
            self.assertFalse(self.snapshot()['available'])
            self.report = original
        for key, value in (('deployMode', 'CREATE_HOME'), ('sourceHome', '/other'), ('targetHome', '/other'), ('logDirectory', '/other/SIMDB/101')):
            original = copy.deepcopy(self.status)
            self.status['jobs'][0][key] = value
            self.write_reports()
            self.assertFalse(self.snapshot()['available'])
            self.status = original
        self.write_reports()
        path.unlink()
        self.assertFalse(self.snapshot()['available'])

    def test_cycle_hash_multiple_jobs_and_control_characters_are_rejected(self):
        self.assertFalse(self.snapshot(sha='0' * 64)['available'])
        self.state['plan_sha256'] = '0' * 64
        self.state_path.write_text(json.dumps(self.state))
        self.assertFalse(self.snapshot()['available'])
        self.state['plan_sha256'] = self.sha
        self.state_path.write_text(json.dumps(self.state))
        self.report['jobs'].append(copy.deepcopy(self.report['jobs'][0]))
        self.write_reports()
        self.assertFalse(self.snapshot()['available'])
        self.report['jobs'].pop()
        self.report['jobs'][0]['stages'][1]['stage'] = 'DB_PATCHING\x1b[2J'
        self.write_reports()
        self.assertFalse(self.snapshot()['available'])

    def test_create_home_uses_native_synthetic_identity(self):
        self.state['operations']['create_home'] = self.state['operations'].pop('deploy')
        self.state_path.write_text(json.dumps(self.state))
        self.status['jobs'][0].update(sid='create_home_1', deployMode='CREATE_HOME', logDirectory=str(self.root / 'logs/create_home_1/101'))
        self.report['jobs'][0]['sid'] = 'create_home_1'
        self.write_reports()
        self.assertTrue(self.snapshot('create_home')['available'])
        self.report['jobs'][0]['sid'] = 'SIMDB'
        self.write_reports()
        self.assertFalse(self.snapshot('create_home')['available'])

    def test_upgrade_home_progress_uses_its_separate_patch_log_directory(self):
        self.plan.update(operation='upgrade', home_log_dir=str(self.root / 'logs/software'))
        self.plan_path.write_text(json.dumps(self.plan))
        self.sha = hashlib.sha256(self.plan_path.read_bytes()).hexdigest()
        self.state['plan_sha256'] = self.sha
        self.state['operations']['create_home'] = self.state['operations'].pop('deploy')
        self.state_path.write_text(json.dumps(self.state))
        self.status['jobs'][0].update(sid='create_home_1', deployMode='CREATE_HOME', logDirectory=str(self.root / 'logs/software/create_home_1/101'))
        self.report['jobs'][0]['sid'] = 'create_home_1'
        self.report['jobs'][0]['stages'][1]['stage'] = 'INSTALL'
        self.write_reports()
        self.assertFalse(self.snapshot('create_home')['available'])
        self.base = self.root / 'logs/software/cfgtoollogs/patch/auto/status'
        self.base.mkdir(parents=True)
        self.write_reports()
        self.assertIn('INSTALL 42%', self.snapshot('create_home')['summary'])

    def test_native_100_percent_does_not_claim_success_and_verification_is_visible(self):
        for stage in self.report['jobs'][0]['stages']:
            stage['percentCompleted'] = '100'
        self.report['jobs'][0]['totalPercentCompleted'] = 100
        self.write_reports()
        self.assertIn('awaiting result verification', self.snapshot()['summary'])
        self.state['operations']['deploy']['command_complete'] = True
        self.state_path.write_text(json.dumps(self.state))
        self.assertIn('SQL patch registry', self.snapshot()['summary'])
        self.assertIn('SQL patch registry', self.snapshot('verify')['summary'])

    def test_download_reports_staged_sizes_without_an_old_native_job_percentage(self):
        media = self.root / 'media'
        media.mkdir()
        (media / 'software.zip').write_bytes(b'x' * 1024 * 1024)
        self.state['operations']['download'] = self.state['operations'].pop('deploy')
        self.state_path.write_text(json.dumps(self.state))
        result = self.snapshot('download')
        self.assertEqual(result['summary'], 'Downloading software | staged ZIPs: 1, 1 MiB')


if __name__ == '__main__':
    unittest.main()
