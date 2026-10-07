"""Controller downloads and transfers are software-only and bound to target media."""
from pathlib import Path
import importlib.util
import io
import json
import os
import ssl
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

FILES = Path(__file__).resolve().parents[1] / 'templates/ansible/files'
sys.path.insert(0, str(FILES))
import controller
from runner import digest, save, verify_download


class ControllerTests(unittest.TestCase):
    def setUp(self):
        transport = patch('controller.sys.platform', 'linux')
        transport.start();self.addCleanup(transport.stop)
        self.temp = tempfile.TemporaryDirectory(prefix="alis controller's ")
        self.root = Path(self.temp.name)
        for area in ('media', 'wallet', 'logs'):
            (self.root / area).mkdir()
        (self.root / 'media/db.zip').write_bytes(b'FAKE DATABASE MEDIA')
        (self.root / 'media/aru-bug-map.json').write_text('{}')
        (self.root / 'wallet/cwallet.sso').write_bytes(b'FAKE SHARED WALLET')
        (self.root / 'wallet/ewallet.p12').write_bytes(b'FAKE PASSWORD WALLET')
        (self.root / 'autoupgrade.jar').write_bytes(b'FAKE JAR')
        self.plan = {'controller_download': True, 'target_version': '23', 'media_platform': 'LINUX.X64', 'jar_sha256': digest(self.root / 'autoupgrade.jar'), 'folder': '/server/media', 'jar': '/server/autoupgrade.jar', 'keystore': '/server/wallet', 'download_parameters': {'target_version': '26', 'platform': 'LINUX.X64', 'patch': 'RECOMMENDED', 'source_home': '/server/19c', 'sid': 'MUST_NOT_RUN'}}
        self.metadata = {'patchFolder': str(self.root / 'media'), 'patches': [{'description': 'DB Gold Image - 23.26.3.0.0', 'platform': 'Linux x86-64', 'releaseUpdate': '23.26.3.0.0', 'files': [{'name': 'db.zip', 'size': 19, 'checksum-256': digest(self.root / 'media/db.zip')}]}]}
        self.write_metadata()

    def tearDown(self):
        self.temp.cleanup()

    def write_metadata(self):
        save(self.root / 'media/patches_info.json', self.metadata)

    def certify(self):
        save(self.root / 'manifest.json', {'plan_sha256': 'plan', 'shared_wallet': True, 'files_sha256': controller.collect(self.root)})

    def test_target_only_parameters_are_materialized_for_this_machine(self):
        result = controller.parameters(self.plan, self.root)
        self.assertNotIn('source_home', result); self.assertNotIn('.sid=', result)
        self.assertIn('media.target_version=26', result)
        self.assertIn('media.platform=LINUX.X64', result)
        self.assertIn('media.folder=' + str(self.root / 'media'), result)
        self.assertNotIn('/server/', result)

    def test_transfer_includes_jar_all_wallet_and_companion_files_and_rebases_metadata(self):
        self.certify()
        result = controller.transfer_manifest(self.root, self.plan, 'plan')
        files = {entry['dest']: entry for entry in result['files']}
        for name in ['/server/autoupgrade.jar', '/server/media/db.zip', '/server/media/aru-bug-map.json', '/server/media/patches_info.json', '/server/wallet/cwallet.sso', '/server/wallet/ewallet.p12']:
            self.assertIn(name, files)
            self.assertEqual(digest(files[name]['src']), files[name]['sha256'])
        self.assertEqual(json.loads(Path(files['/server/media/patches_info.json']['src']).read_text())['patchFolder'], '/server/media')
        self.assertEqual(json.loads((self.root / 'media/patches_info.json').read_text())['patchFolder'], str(self.root / 'media'))

    def test_reject_source_19c_image_for_26ai_before_hashing_gigabytes(self):
        self.metadata['patches'][0]['releaseUpdate'] = '19.32.0.0.0';self.write_metadata()
        with self.assertRaisesRegex(RuntimeError, 'expected target 23'):
            verify_download(self.root / 'media', '23')

    def test_ru_gold_image_description_from_aru_does_not_need_releaseupdate_key(self):
        del self.metadata['patches'][0]['releaseUpdate']
        self.metadata['patches'][0]['description'] = 'DATABASE RELEASE UPDATE 23.26.3.0.0 (GOLD IMAGE)';self.write_metadata()
        self.assertIn('db.zip', verify_download(self.root / 'media', '23'))

    def test_tools_alone_do_not_prove_database_media(self):
        del self.metadata['patches'][0]['releaseUpdate'];self.metadata['patches'][0]['description'] = 'OPatch 12.2.0.1.53 for DB 23.0.0.0.0';self.write_metadata()
        with self.assertRaisesRegex(RuntimeError, 'Tool downloads alone'):
            verify_download(self.root / 'media', '23')

    def test_platform_mismatch_and_target_ru_pin_fail(self):
        with self.assertRaisesRegex(RuntimeError, 'another platform'):
            verify_download(self.root / 'media', '23', platform='ARM.X64')
        with self.assertRaisesRegex(RuntimeError, 'pinned target RU'):
            verify_download(self.root / 'media', '23', pinned_ru='23.26.2')

    def test_changed_wallet_companion_or_jar_blocks_transfer(self):
        for name in ['wallet/cwallet.sso', 'media/aru-bug-map.json', 'autoupgrade.jar']:
            with self.subTest(name=name):
                self.certify();path=self.root / name;original=path.read_bytes();path.write_bytes(b'CHANGED')
                with self.assertRaisesRegex(RuntimeError, 'files changed'):
                    controller.transfer_manifest(self.root, self.plan, 'plan')
                path.write_bytes(original)

    def test_other_cycle_and_unconfirmed_wallet_block_transfer(self):
        self.certify()
        with self.assertRaisesRegex(RuntimeError, 'different plan'):
            controller.validate_stage(self.root, self.plan, 'other')
        manifest=json.loads((self.root / 'manifest.json').read_text());manifest['shared_wallet']=False;save(self.root / 'manifest.json', manifest)
        with self.assertRaisesRegex(RuntimeError, 'SHARED'):
            controller.validate_stage(self.root, self.plan, 'plan')

    def test_symlinks_cannot_be_packaged(self):
        (self.root / 'media/link').symlink_to(self.root / 'wallet/ewallet.p12')
        with self.assertRaisesRegex(RuntimeError, 'Unsupported staging entry'):
            controller.collect(self.root)

    def test_local_resume_is_offline_and_does_not_open_the_wallet_again(self):
        self.certify();(self.root / 'plan.sha256').write_text('plan')
        with patch('controller.subprocess.run', side_effect=AssertionError('No Java on completed local stage')), patch('controller.urllib.request.urlopen', side_effect=AssertionError('No network on resume')):
            self.assertFalse(controller.prepare(self.root, self.plan, 'plan', 'java'))

    def test_unrelated_directory_is_rejected_without_permission_changes(self):
        unrelated = self.root / 'unrelated';unrelated.mkdir(mode=0o755)
        file = unrelated / 'keep.txt';file.write_text('KEEP');file.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, 'dedicated empty'):
            controller.prepare(unrelated, self.plan, 'plan', 'java')
        self.assertEqual(unrelated.stat().st_mode & 0o777, 0o755)
        self.assertEqual(file.stat().st_mode & 0o777, 0o644)
        self.assertEqual(list(unrelated.iterdir()), [file])

    def test_other_plan_is_rejected_before_changing_permissions(self):
        (self.root / 'plan.sha256').write_text('another plan')
        jar = self.root / 'autoupgrade.jar';jar.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, 'different plan'):
            controller.prepare(self.root, self.plan, 'plan', 'java')
        self.assertEqual(jar.stat().st_mode & 0o777, 0o644)

    def test_downloaded_jar_must_match_profile_before_wallet_or_media_commands(self):
        import io
        (self.root / 'autoupgrade.jar').unlink()
        for path in (self.root / 'media').iterdir():path.unlink()
        for path in (self.root / 'wallet').iterdir():path.unlink()
        self.plan['profile'] = '26.6.260925'
        with patch('controller.sys.stdin.isatty', return_value=True), patch('builtins.input', return_value='YES'), patch('controller.urllib.request.urlopen', return_value=io.BytesIO(b'WRONG JAR')), patch('controller.subprocess.run', side_effect=AssertionError('No native execution before checksum')):
            with self.assertRaisesRegex(RuntimeError, 'different JAR'):
                controller.prepare(self.root, self.plan, 'plan', 'java')
        self.assertFalse((self.root / 'autoupgrade.jar').exists())
        self.assertFalse((self.root / 'autoupgrade.jar.part').exists())

    def test_downloads_pinned_jar_then_requires_interactive_shared_wallet(self):
        import io
        from types import SimpleNamespace
        jar_bytes=(self.root/'autoupgrade.jar').read_bytes();(self.root/'autoupgrade.jar').unlink()
        for path in (self.root/'media').iterdir():path.unlink()
        for path in (self.root/'wallet').iterdir():path.unlink()
        self.plan['profile']='26.6.260925'
        commands=[]
        def native(argv, **kwargs):
            commands.append(argv)
            if '-version' in argv:return SimpleNamespace(stdout='AutoUpgrade 26.6.260925')
            self.assertNotIn('stdout', kwargs);self.assertNotIn('input', kwargs)
            if '-load_password' in argv:
                (self.root/'wallet/ewallet.p12').write_bytes(b'FAKE WALLET')
                (self.root/'wallet/cwallet.sso').write_bytes(b'FAKE SHARED')
            else:
                (self.root/'media/db.zip').write_bytes(b'FAKE DATABASE MEDIA');self.write_metadata()
            return SimpleNamespace(returncode=0)
        with patch('controller.sys.stdin.isatty',return_value=True), patch('builtins.input',side_effect=['YES','SHARED']), patch('controller.urllib.request.urlopen',return_value=io.BytesIO(jar_bytes)), patch('controller.subprocess.run',side_effect=native):
            self.assertTrue(controller.prepare(self.root,self.plan,'plan','java'))
        self.assertIn('-load_password',commands[1]);self.assertIn('download',commands[2]);self.assertEqual(len(commands),3)
        self.assertTrue((self.root/'manifest.json').is_file())

    def test_failed_macos_transfer_removes_partial_jar_before_native_execution(self):
        (self.root/'autoupgrade.jar').unlink()
        for area in ('media','wallet'):
            for path in (self.root/area).iterdir():path.unlink()
        self.plan['profile']='26.6.260925'
        def curl(argv, **kwargs):
            self.assertEqual(argv[0], '/usr/bin/curl')
            Path(argv[argv.index('--output')+1]).write_bytes(b'PARTIAL JAR')
            raise subprocess.CalledProcessError(18,argv)
        with patch('controller.sys.platform','darwin'), patch.dict(os.environ,{},clear=True), patch('controller.sys.stdin.isatty',return_value=True), patch('builtins.input',return_value='YES'), patch('controller.subprocess.run',side_effect=curl) as run:
            with self.assertRaises(subprocess.CalledProcessError):controller.prepare(self.root,self.plan,'plan','java')
        self.assertEqual(run.call_count,1)
        self.assertFalse((self.root/'autoupgrade.jar').exists())
        self.assertFalse((self.root/'autoupgrade.jar.part').exists())

    def test_macos_download_is_hash_checked_before_any_java_execution(self):
        (self.root/'autoupgrade.jar').unlink()
        for area in ('media','wallet'):
            for path in (self.root/area).iterdir():path.unlink()
        self.plan['profile']='26.6.260925'
        def curl(argv, **kwargs):
            self.assertEqual(argv[0], '/usr/bin/curl')
            Path(argv[argv.index('--output')+1]).write_bytes(b'WRONG BUILD')
        with patch('controller.sys.platform','darwin'), patch.dict(os.environ,{},clear=True), patch('controller.sys.stdin.isatty',return_value=True), patch('builtins.input',return_value='YES'), patch('controller.subprocess.run',side_effect=curl) as run:
            with self.assertRaisesRegex(RuntimeError,'different JAR'):controller.prepare(self.root,self.plan,'plan','java')
        self.assertEqual(run.call_count,1)
        self.assertFalse((self.root/'autoupgrade.jar').exists())


class DownloadTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='alis-tls-');self.addCleanup(self.temp.cleanup)
        self.dest=Path(self.temp.name)/'download.part'

    def test_macos_uses_system_trust_and_restricts_redirect_protocol(self):
        def curl(argv,**kwargs):
            self.assertEqual(argv[:2],['/usr/bin/curl','--disable'])
            self.assertNotIn('--insecure',argv);self.assertNotIn('-k',argv)
            self.assertEqual(argv[argv.index('--proto')+1],'=https')
            self.assertEqual(argv[argv.index('--proto-redir')+1],'=https')
            self.assertTrue(kwargs['check'])
            Path(argv[argv.index('--output')+1]).write_bytes(b'JAR')
        with patch('controller.sys.platform','darwin'), patch.dict(os.environ,{},clear=True), patch('controller.subprocess.run',side_effect=curl), patch('controller.urllib.request.urlopen',side_effect=AssertionError('Do not depend on an empty Python CA store')):
            controller.download_file(controller.JAR_URL,self.dest)
        self.assertEqual(self.dest.read_bytes(),b'JAR')

    def test_explicit_python_ca_configuration_is_preserved_on_macos(self):
        for name in ('SSL_CERT_FILE','SSL_CERT_DIR'):
            with self.subTest(name=name), patch('controller.sys.platform','darwin'), patch.dict(os.environ,{name:'/explicit/trust'},clear=True), patch('controller.urllib.request.urlopen',return_value=io.BytesIO(b'JAR')) as request, patch('controller.subprocess.run',side_effect=AssertionError('Do not replace explicitly selected trust')):
                controller.download_file(controller.JAR_URL,self.dest)
                request.assert_called_once_with(controller.JAR_URL,timeout=120)
                self.assertEqual(os.environ[name],'/explicit/trust')

    def test_curl_certificate_failure_stops_without_another_transport(self):
        with patch('controller.sys.platform','darwin'), patch.dict(os.environ,{},clear=True), patch('controller.subprocess.run',side_effect=subprocess.CalledProcessError(60,['/usr/bin/curl'])), patch('controller.urllib.request.urlopen',side_effect=AssertionError('No certificate-failure fallback')):
            with self.assertRaisesRegex(RuntimeError,'SSL_CERT_FILE'):controller.download_file(controller.JAR_URL,self.dest)

    def test_python_certificate_failure_has_actionable_error(self):
        error=urllib.error.URLError(ssl.SSLCertVerificationError(1,'unable to get local issuer certificate'))
        with patch('controller.sys.platform','linux'), patch('controller.urllib.request.urlopen',side_effect=error), patch('controller.subprocess.run',side_effect=AssertionError('No certificate-failure fallback')):
            with self.assertRaisesRegex(RuntimeError,'TLS verification remains enabled'):controller.download_file(controller.JAR_URL,self.dest)

    def test_http_input_is_rejected_before_any_connection(self):
        with patch('controller.urllib.request.urlopen',side_effect=AssertionError('No HTTP')), patch('controller.subprocess.run',side_effect=AssertionError('No HTTP')):
            with self.assertRaisesRegex(RuntimeError,'require HTTPS'):controller.download_file('http://example.invalid/file',self.dest)
