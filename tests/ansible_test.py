from pathlib import Path
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / 'templates/ansible'


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="alis Oracle's lab ")
        self.root = Path(self.temp.name).resolve()
        subprocess.run([sys.executable, '-S', str(TEMPLATES / 'tests/simulator.py'), 'setup', str(self.root)], check=True, capture_output=True)
        self.run = self.root / 'run'
        shutil.copytree(self.root / 'files', self.run)
        self.plan = self.run / 'plan.json'

    def tearDown(self):
        self.temp.cleanup()

    def invoke(self, action, *extra):
        checksum = hashlib.sha256(self.plan.read_bytes()).hexdigest()
        result = subprocess.run([sys.executable, '-S', str(self.run / 'runner.py'), action, '--plan', str(self.plan), '--plan-sha', checksum, '--simulation', *extra], capture_output=True, text=True)
        self.assertTrue(result.stdout, result.stderr)
        return result.returncode, json.loads(result.stdout)

    def success(self, action, *extra):
        code, result = self.invoke(action, *extra)
        self.assertEqual(code, 0, result)
        return result

    def failure(self, action, text, *extra):
        code, result = self.invoke(action, *extra)
        self.assertNotEqual(code, 0, result)
        self.assertIn(text, result['error'])
        return result

    def fault(self, name):
        (self.root / 'fault.txt').write_text(name)

    def change_plan(self, **changes):
        plan = json.loads(self.plan.read_text())
        plan.update(changes)
        self.plan.write_text(json.dumps(plan))

    def software(self):
        for action in ('analyze', 'download', 'create_home'):
            self.success(action)

    def modes(self):
        path = self.root / 'commands.jsonl'
        commands = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
        return [command[command.index('-mode') + 1] for command in commands]

    def test_complete_cycle_and_completed_deploy_are_idempotent(self):
        self.success('prepare')
        self.assertTrue(self.success('analyze')['changed'])
        self.assertTrue(self.success('download')['changed'])
        self.assertTrue(self.success('create_home')['changed'])
        self.assertTrue(self.success('deploy')['changed'])
        self.assertFalse(self.success('verify')['changed'])
        self.assertFalse(self.success('deploy')['changed'])
        commands = [json.loads(line) for line in (self.root / 'commands.jsonl').read_text().splitlines()]
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home', 'deploy'])
        self.assertTrue(all('-noconsole' in command for command in commands))
        verification = json.loads((self.run / 'results/verification.json').read_text())
        self.assertEqual(verification['sql_patch_ids'], ['37960098'])
        self.assertEqual(len(verification['containers']), 3)

    def test_deploy_requires_successful_analysis(self):
        self.failure('deploy', 'Run analyze.yml successfully')
        self.assertFalse((self.root / 'commands.jsonl').exists())

    def test_verify_requires_a_deployment(self):
        self.failure('verify', 'No successfully completed AutoUpgrade deployment')

    def test_failed_checks_cannot_certify_readiness_even_with_successful_stage(self):
        self.fault('checks')
        self.failure('analyze', 'failed or execution-error database checks')

    def test_native_report_path_and_non_error_findings_for_both_profiles(self):
        for profile in ('26.5.260807', '26.6.260925'):
            with self.subTest(profile=profile):
                self.change_plan(profile=profile, resume_cli=profile == '26.6.260925', create_home_prechecks=profile == '26.6.260925')
                (self.root / 'profile.txt').write_text(profile)
                self.fault('warnings')
                evidence = self.success('analyze')['evidence']
                self.assertEqual({finding['severity'] for finding in evidence['findings']['PRECHECKS']}, {'INFO', 'RECOMMEND', 'WARNING'})
                self.assertTrue((self.root / 'logs/cfgtoollogs/patch/auto/status/status.json').is_file())
                self.assertFalse((self.root / 'logs/status').exists())
                self.success('download')
                home = self.success('create_home')
                self.assertEqual(home['evidence']['sid'], 'create_home_1')
                checklist = json.loads((self.run / 'results/create_home-prechecks-checklist.json').read_text()) if profile == '26.6.260925' else None
                if checklist:
                    self.assertEqual(checklist['SID'], 'create_home_1')
                self.success('deploy')
                (self.run / 'state.json').unlink()
                (self.root / 'active-home').write_text('source')

    def test_checklist_errors_and_execution_errors_block_even_when_fixable(self):
        for fault in ('fixable-error', 'check-execution'):
            with self.subTest(fault=fault):
                self.fault(fault)
                self.failure('analyze', 'failed or execution-error database checks')
                self.failure('deploy', 'Run analyze.yml successfully')
                (self.run / 'state.json').unlink()

    def test_missing_or_stale_checklists_cannot_certify_readiness(self):
        for fault in ('missing-checklist', 'stale-checklist'):
            with self.subTest(fault=fault):
                self.fault(fault)
                self.failure('analyze', 'Missing or stale AutoUpgrade')
                self.failure('deploy', 'Run analyze.yml successfully')
                (self.run / 'state.json').unlink()

    def failed_report_verification(self, legacy=False):
        self.fault('warnings')
        self.success('analyze')
        state = json.loads((self.run / 'state.json').read_text())
        previous = state['operations']['analyze']
        previous.update(verified=False, status='failed', error='Missing or stale AutoUpgrade ' + str(self.root / 'logs/status/status.json'))
        previous.pop('native_complete')
        if legacy:
            previous.pop('command_complete')
        (self.run / 'state.json').write_text(json.dumps(state))
        return state

    def test_recheck_existing_analyze_without_another_native_command(self):
        self.failed_report_verification(legacy=True)
        commands = self.modes()
        result = self.success('recheck-analyze')
        self.assertIn('not rerun', result['message'])
        self.assertEqual(self.modes(), commands)
        state = json.loads((self.run / 'state.json').read_text())
        self.assertTrue(state['operations']['analyze']['verified'])
        self.success('analyze', '--cycle')
        self.success('download', '--cycle')
        self.assertEqual(self.modes(), ['analyze', 'download'])

    def test_recheck_rejects_reports_from_before_or_after_the_failed_run(self):
        state = self.failed_report_verification()
        paths = [self.root / 'logs/cfgtoollogs/patch/auto/status/status.json', self.root / 'logs/SIMDB/100/prechecks/simdb_checklist.json']
        for path in paths:
            original = path.stat().st_mtime
            for timestamp, message in ((1, 'Missing or stale'), (state['operations']['analyze']['ended'] + 10, 'replaced after')):
                with self.subTest(path=path, timestamp=timestamp):
                    os.utime(path, (timestamp, timestamp))
                    self.failure('recheck-analyze', message)
                    self.assertFalse(json.loads((self.run / 'state.json').read_text())['operations']['analyze']['verified'])
            os.utime(path, (original, original))
        self.assertEqual(self.modes(), ['analyze'])

    def test_recheck_cannot_accept_unexplained_findings_or_unknown_severity(self):
        self.failed_report_verification()
        path = self.root / 'logs/SIMDB/100/prechecks/simdb_checklist.json'
        report = json.loads(path.read_text())
        original = path.stat().st_mtime
        for replacement, message in (([], 'does not explain'), ([{'checkname': 'WARNING_CHECK', 'severity': 'OTHER'}], 'Unknown AutoUpgrade')):
            report['containers'][0]['checks'] = replacement
            path.write_text(json.dumps(report))
            os.utime(path, (original, original))
            self.failure('recheck-analyze', message)
        self.assertEqual(self.modes(), ['analyze'])

    def test_recheck_requires_successful_command_and_no_later_operation(self):
        state = self.failed_report_verification(legacy=True)
        state['operations']['analyze']['error'] = 'analyze failed (rc=7)'
        (self.run / 'state.json').write_text(json.dumps(state))
        self.failure('recheck-analyze', 'did not finish its command successfully')
        state['operations']['analyze']['command_complete'] = True
        state['operations']['download'] = {'verified': False}
        (self.run / 'state.json').write_text(json.dumps(state))
        self.failure('recheck-analyze', 'A later phase exists')
        self.assertEqual(self.modes(), ['analyze'])

    def test_recheck_preserves_blocking_check_errors(self):
        self.fault('checks')
        self.failure('analyze', 'failed or execution-error database checks')
        self.failure('recheck-analyze', 'failed or execution-error database checks')
        self.failure('deploy', 'Run analyze.yml successfully')
        self.assertEqual(self.modes(), ['analyze'])

    def failed_home_verification(self):
        self.software()
        state = json.loads((self.run / 'state.json').read_text())
        previous = state['operations']['create_home']
        previous.update(verified=False, status='failed', error='Expected exactly one AutoUpgrade job for SID SIMDB')
        previous.pop('native_complete')
        (self.run / 'state.json').write_text(json.dumps(state))
        return state

    def test_recheck_created_home_does_not_repeat_installation(self):
        self.failed_home_verification()
        commands = self.modes()
        result = self.success('recheck-create-home')
        self.assertIn('not rerun', result['message'])
        self.assertEqual(result['evidence']['sid'], 'create_home_1')
        self.assertEqual(commands, self.modes())
        state = json.loads((self.run / 'state.json').read_text())
        self.assertTrue(state['operations']['create_home']['verified'])
        self.assertIn('previous_verification_error', state['operations']['create_home'])
        for phase in ('analyze', 'download', 'create_home', 'deploy'):
            self.success(phase, '--cycle')
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home', 'deploy'])

    def test_recheck_home_keeps_identity_mode_homes_job_and_root_gates(self):
        self.failed_home_verification()
        path = self.root / 'logs/cfgtoollogs/patch/auto/status/status.json'
        original = json.loads(path.read_text())
        timestamp = path.stat().st_mtime
        import copy
        for field, value, message in (('sid', 'SIMDB', 'exactly one'), ('sid', 'create_home_2', 'exactly one'), ('deployMode', 'DEPLOY', 'another mode'), ('sourceHome', '/wrong/source', 'different Oracle homes'), ('targetHome', '/wrong/target', 'different Oracle homes')):
            with self.subTest(field=field, value=value):
                report = copy.deepcopy(original)
                report['jobs'][0][field] = value
                path.write_text(json.dumps(report)); os.utime(path, (timestamp, timestamp))
                self.failure('recheck-create-home', message)
        report = copy.deepcopy(original)
        report['jobs'].append(copy.deepcopy(report['jobs'][0]))
        path.write_text(json.dumps(report)); os.utime(path, (timestamp, timestamp))
        self.failure('recheck-create-home', 'exactly one')
        report = copy.deepcopy(original)
        next(stage for stage in report['jobs'][0]['stages'] if stage['stageName'] == 'ROOTSH')['status'] = 1
        path.write_text(json.dumps(report)); os.utime(path, (timestamp, timestamp))
        self.failure('recheck-create-home', 'unsuccessful stage')
        self.assertFalse(json.loads((self.run / 'state.json').read_text())['operations']['create_home']['verified'])
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home'])

    def test_recheck_home_requires_matching_progress_and_checklist(self):
        self.failed_home_verification()
        progress = self.root / 'logs/cfgtoollogs/patch/auto/status/progress.json'
        original = progress.read_text(); timestamp = progress.stat().st_mtime
        report = json.loads(original); report['jobs'][0]['jobNo'] += 1
        progress.write_text(json.dumps(report)); os.utime(progress, (timestamp, timestamp))
        self.failure('recheck-create-home', 'different jobs')
        progress.write_text(original); os.utime(progress, (timestamp, timestamp))
        checklist = self.root / 'logs/create_home_1/100/prechecks/create_home_1_checklist.json'
        report = json.loads(checklist.read_text()); timestamp = checklist.stat().st_mtime
        report['SID'] = 'SIMDB'
        checklist.write_text(json.dumps(report)); os.utime(checklist, (timestamp, timestamp))
        self.failure('recheck-create-home', 'mismatched AutoUpgrade checklist')
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home'])

    def test_recheck_home_preserves_native_completion_when_inventory_fails(self):
        self.failed_home_verification()
        binary = self.root / 'target/bin/oracle'
        binary.unlink()
        self.failure('recheck-create-home', 'home is incomplete')
        state = json.loads((self.run / 'state.json').read_text())['operations']['create_home']
        self.assertTrue(state['native_complete'])
        self.assertFalse(state['verified'])
        binary.write_text('SIMULATION ONLY')
        self.success('create_home', '--resume')
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home'])

    def test_recheck_home_requires_original_prerequisites_and_active_source(self):
        state = self.failed_home_verification()
        state['operations']['download']['verified'] = False
        (self.run / 'state.json').write_text(json.dumps(state))
        self.failure('recheck-create-home', 'analyze.yml and download.yml')
        state['operations']['download']['verified'] = True
        state['operations']['deploy'] = {'status': 'failed'}
        (self.run / 'state.json').write_text(json.dumps(state))
        self.failure('recheck-create-home', 'A deployment exists')
        del state['operations']['deploy']
        (self.run / 'state.json').write_text(json.dumps(state))
        (self.root / 'active-home').write_text('target')
        self.failure('recheck-create-home', 'database-after-create_home failed')
        self.assertFalse(json.loads((self.run / 'state.json').read_text())['operations']['create_home']['verified'])
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home'])

    def test_failed_analysis_blocks_deploy_and_resume_for_both_profiles(self):
        for profile in ('26.5.260807', '26.6.260925'):
            with self.subTest(profile=profile):
                self.change_plan(profile=profile, resume_cli=profile=='26.6.260925')
                (self.root / 'profile.txt').write_text(profile)
                self.fault('checks')
                self.failure('analyze', 'failed or execution-error database checks')
                commands = (self.root / 'commands.jsonl').read_text()
                for extra, reason in (((), 'Run analyze.yml successfully'), (('--resume',), 'no interrupted operation')):
                    self.failure('deploy', reason, *extra)
                    self.assertEqual(commands, (self.root / 'commands.jsonl').read_text())
                for path in (self.run / 'state.json', self.root / 'commands.jsonl'):
                    path.unlink(missing_ok=True)

    def test_stage_failure_with_java_rc_zero_is_rejected(self):
        self.software()
        self.fault('status')
        self.failure('deploy', 'unsuccessful stage')
        self.assertIn('return code is zero', (self.run / 'results/deploy.log').read_text())

    def test_sqlpatch_failure_with_java_rc_zero_is_rejected(self):
        self.software()
        self.fault('sqlpatch')
        self.failure('deploy', 'unsuccessful action')

    def test_missing_pdb_sqlpatch_is_rejected(self):
        self.software()
        self.fault('missing-pdb')
        self.failure('deploy', 'one or more containers')

    def test_closed_pdb_prevents_claiming_complete_verification(self):
        self.software()
        self.fault('closed-pdb')
        self.failure('deploy', 'Closed PDBs')
        commands = (self.root / 'commands.jsonl').read_text()
        self.fault('none')
        self.success('verify')
        self.success('deploy')
        self.assertEqual(commands, (self.root / 'commands.jsonl').read_text())

    def test_stale_status_cannot_certify_a_new_operation(self):
        self.software()
        self.fault('stale')
        self.failure('deploy', 'stale AutoUpgrade')

    def test_incomplete_progress_is_rejected(self):
        self.software()
        self.fault('incomplete')
        self.failure('deploy', '100%')

    def test_wrong_sid_in_status_is_rejected(self):
        self.fault('wrong-job')
        self.failure('analyze', 'exactly one AutoUpgrade job')

    def test_jar_checksum_and_build_are_checked(self):
        self.fault('version')
        self.failure('prepare', 'JAR build')
        self.fault('none')
        (self.root / 'simulated.jar').write_text('another build')
        self.failure('prepare', 'JAR SHA-256')

    def test_runtime_rejects_rac_and_dataguard(self):
        for fault, reason in [('rac', 'RAC'), ('dataguard', 'Data Guard')]:
            self.fault(fault)
            self.failure('prepare', reason)

    def test_config_is_immutable(self):
        (self.run / 'autoupgrade.cfg').write_text('changed configuration\n')
        self.failure('analyze', 'Configuration changed')

    def test_state_is_bound_to_the_plan(self):
        self.success('analyze')
        self.change_plan(java='/another/java')
        self.failure('deploy', 'another patch cycle')

    def test_no_automatic_retry_after_an_interruption(self):
        self.software()
        self.fault('interrupted')
        self.failure('deploy', 'rc=7')
        commands = (self.root / 'commands.jsonl').read_text()
        self.failure('deploy', 'previous operation was interrupted')
        self.assertEqual(commands, (self.root / 'commands.jsonl').read_text())
        self.success('deploy', '--resume')
        self.assertIn('-resume', json.loads((self.root / 'commands.jsonl').read_text().splitlines()[-1]))

    def test_old_profile_resumes_without_the_new_resume_cli(self):
        self.change_plan(profile='26.5.260807', resume_cli=False, create_home_prechecks=False)
        (self.root / 'profile.txt').write_text('26.5.260807')
        self.software()
        self.fault('interrupted')
        self.failure('deploy', 'rc=7')
        self.success('deploy', '--resume')
        self.assertNotIn('-resume', json.loads((self.root / 'commands.jsonl').read_text().splitlines()[-1]))

    def test_resume_without_a_prior_failure_is_rejected(self):
        self.failure('analyze', 'no interrupted operation', '--resume')

    def test_concurrent_runner_is_rejected(self):
        with open(self.run / '.alis.lock', 'w') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.failure('analyze', 'Another ALIS process')

    def test_pinned_ru_must_match_inventory(self):
        self.change_plan(pinned_ru='19.28')
        self.success('analyze')
        self.success('download')
        self.fault('home-inventory')
        self.failure('create_home', 'pinned RU 19.28')

    def test_correct_pinned_ru_accepts_full_inventory_version_with_date(self):
        self.change_plan(pinned_ru='19.28')
        self.software()
        self.success('deploy')

    def test_online_patching_requires_a_prepared_autologin_wallet(self):
        wallet = self.root / 'missing-wallet'
        self.change_plan(download=True, keystore=str(wallet))
        self.failure('prepare', 'cwallet.sso')
        wallet.mkdir()
        (wallet / 'cwallet.sso').write_text('fake auto-login wallet')
        self.success('prepare')

    def test_a_real_plan_cannot_accidentally_use_fake_tools(self):
        self.change_plan(simulation=False)
        self.failure('prepare', 'Simulation requires both')

    def test_each_phase_requires_all_previous_phases_even_with_resume(self):
        self.failure('download', 'Run analyze.yml successfully')
        self.failure('create_home', 'Run analyze.yml successfully')
        self.success('analyze')
        self.failure('create_home', 'Run download.yml successfully')
        self.failure('deploy', 'Run download.yml successfully')
        self.success('download')
        self.failure('deploy', 'Run create_home.yml successfully')
        self.failure('deploy', 'Run create_home.yml successfully', '--resume', '--cycle')
        self.assertEqual(self.modes(), ['analyze', 'download'])

    def test_download_is_checked_without_reusing_analyze_status(self):
        self.success('analyze')
        self.fault('download')
        self.failure('download', 'Missing download metadata')
        self.failure('create_home', 'Run download.yml successfully')
        self.assertEqual(self.modes(), ['analyze', 'download'])

    def test_wrong_download_checksum_blocks_home_and_deploy(self):
        self.success('analyze')
        self.fault('checksum')
        self.failure('download', 'checksum differs')
        self.failure('deploy', 'Run download.yml successfully')
        self.assertEqual(self.modes(), ['analyze', 'download'])

    def test_changed_media_blocks_a_verified_home_from_deploying(self):
        self.software()
        (self.root / 'media/simulated-home.zip').write_text('replaced')
        self.failure('deploy', 'file size differs')
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home'])

    def test_unfinished_or_missing_root_stage_blocks_deploy(self):
        self.success('analyze')
        self.success('download')
        self.fault('root')
        self.failure('create_home', 'unsuccessful stage')
        self.failure('deploy', 'Run create_home.yml successfully')
        self.fault('missing-root')
        self.failure('create_home', 'ROOTSH', '--resume')
        self.failure('deploy', 'Run create_home.yml successfully')

    def test_home_creation_must_leave_the_database_on_the_source_home(self):
        self.success('analyze')
        self.success('download')
        self.fault('switched-home')
        self.failure('create_home', 'database-after-create_home failed')
        self.failure('deploy', 'Run create_home.yml successfully')

    def test_missing_target_binaries_cannot_certify_home_creation(self):
        self.success('analyze')
        self.success('download')
        self.fault('missing-home')
        self.failure('create_home', 'home is incomplete')
        commands = self.modes()
        (self.root / 'target/bin/oracle').write_text('SIMULATION ONLY')
        self.success('create_home', '--resume')
        self.assertEqual(commands, self.modes())

    def test_home_configuration_is_immutable(self):
        (self.run / 'autoupgrade.home.cfg').write_text('changed')
        self.failure('analyze', 'Home-preparation configuration changed')

    def test_offline_download_validates_local_media_without_network_command(self):
        self.change_plan(download=False)
        import zipfile
        with zipfile.ZipFile(self.root / 'media/local-home.zip', 'w') as archive:
            archive.writestr('simulation', 'ALIS SIMULATION ONLY')
        self.success('analyze')
        self.assertFalse(self.success('download')['changed'])
        self.success('create_home')
        self.success('deploy')
        self.assertEqual(self.modes(), ['analyze', 'create_home', 'deploy'])

    def test_global_resume_skips_successes_and_starts_remaining_phases(self):
        self.success('analyze')
        self.fault('download')
        self.failure('download', 'Missing download metadata')
        self.fault('none')
        for action in ('analyze', 'download', 'create_home', 'deploy'):
            self.success(action, '--resume', '--cycle')
        self.assertEqual(self.modes(), ['analyze', 'download', 'download', 'create_home', 'deploy'])
        commands = [json.loads(line) for line in (self.root / 'commands.jsonl').read_text().splitlines()]
        self.assertNotIn('-resume', commands[2])
        for action in ('analyze', 'download', 'create_home', 'deploy'):
            self.success(action, '--cycle')
        self.assertEqual(len(self.modes()), 5)

    def test_completed_cycle_verifies_the_database_without_requiring_media_again(self):
        self.software()
        self.success('deploy')
        (self.root / 'media/simulated-home.zip').unlink()
        for action in ('prepare', 'analyze', 'download', 'create_home', 'deploy', 'verify'):
            self.assertFalse(self.success(action, '--cycle')['changed'])
        self.assertEqual(self.modes(), ['analyze', 'download', 'create_home', 'deploy'])


if __name__ == '__main__':
    unittest.main()
