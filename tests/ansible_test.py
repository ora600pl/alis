from pathlib import Path
import fcntl
import hashlib
import json
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
        self.root = Path(self.temp.name)
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

    def test_complete_cycle_and_completed_deploy_are_idempotent(self):
        self.success('prepare')
        self.assertTrue(self.success('analyze')['changed'])
        self.assertTrue(self.success('deploy')['changed'])
        self.assertFalse(self.success('verify')['changed'])
        self.assertFalse(self.success('deploy')['changed'])
        commands = [json.loads(line) for line in (self.root / 'commands.jsonl').read_text().splitlines()]
        self.assertEqual(len(commands), 2)
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
        self.success('analyze')
        self.fault('status')
        self.failure('deploy', 'unsuccessful stage')
        self.assertIn('return code is zero', (self.run / 'results/deploy.log').read_text())

    def test_sqlpatch_failure_with_java_rc_zero_is_rejected(self):
        self.success('analyze')
        self.fault('sqlpatch')
        self.failure('deploy', 'unsuccessful action')

    def test_missing_pdb_sqlpatch_is_rejected(self):
        self.success('analyze')
        self.fault('missing-pdb')
        self.failure('deploy', 'one or more containers')

    def test_closed_pdb_prevents_claiming_complete_verification(self):
        self.success('analyze')
        self.fault('closed-pdb')
        self.failure('deploy', 'Closed PDBs')
        commands = (self.root / 'commands.jsonl').read_text()
        self.fault('none')
        self.success('verify')
        self.success('deploy')
        self.assertEqual(commands, (self.root / 'commands.jsonl').read_text())

    def test_stale_status_cannot_certify_a_new_operation(self):
        self.success('analyze')
        self.fault('stale')
        self.failure('deploy', 'stale AutoUpgrade')

    def test_incomplete_progress_is_rejected(self):
        self.success('analyze')
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
        self.success('analyze')
        self.fault('interrupted')
        self.failure('deploy', 'rc=7')
        commands = (self.root / 'commands.jsonl').read_text()
        self.failure('deploy', 'previous operation was interrupted')
        self.assertEqual(commands, (self.root / 'commands.jsonl').read_text())
        self.success('deploy', '--resume')
        self.assertIn('-resume', json.loads((self.root / 'commands.jsonl').read_text().splitlines()[-1]))

    def test_old_profile_resumes_without_the_new_resume_cli(self):
        self.change_plan(profile='26.5.260807', resume_cli=False)
        (self.root / 'profile.txt').write_text('26.5.260807')
        self.success('analyze')
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
        self.change_plan(pinned_ru='19.29')
        self.success('analyze')
        self.failure('deploy', 'pinned RU 19.29')

    def test_online_patching_requires_a_prepared_autologin_wallet(self):
        wallet = self.root / 'wallet'
        self.change_plan(download=True, keystore=str(wallet))
        self.failure('prepare', 'cwallet.sso')
        wallet.mkdir()
        (wallet / 'cwallet.sso').write_text('fake auto-login wallet')
        self.success('prepare')

    def test_a_real_plan_cannot_accidentally_use_fake_tools(self):
        self.change_plan(simulation=False)
        self.failure('prepare', 'Simulation requires both')


if __name__ == '__main__':
    unittest.main()
