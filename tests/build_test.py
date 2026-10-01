from pathlib import Path
import base64
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class StaticBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, "-S", str(ROOT / "tools/build.py")], check=True, capture_output=True)
        cls.offline = (ROOT / "site/offline.html").read_text()

    def test_offline_scripts_have_matching_csp_hashes(self):
        scripts = re.findall(r"<script>(.*?)</script>", self.offline, re.S)
        self.assertEqual(len(scripts), 4)
        for script in scripts:
            digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
            self.assertTrue("'sha256-" + digest + "'" in self.offline, "CSP script hash mismatch: " + digest)

    def test_offline_assets_are_embedded(self):
        self.assertNotRegex(self.offline, r'<script[^>]+src=')
        self.assertNotIn('rel="stylesheet"', self.offline)
        self.assertIn('href="data:image/svg+xml;base64,', self.offline)
        self.assertLess(len(self.offline.encode()), 1000000)

    def test_offline_runs_after_document(self):
        self.assertLess(self.offline.index('id="step-content"'), self.offline.index('<script>'))

    def test_no_network_apis_or_browser_persistence(self):
        sources = '\n'.join((ROOT / "site/assets" / name).read_text() for name in ("app.js", "core.js", "workflows.js"))
        self.assertNotRegex(sources, r'\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage)\s*[.(]')
        self.assertIn("connect-src 'none'", (ROOT / "site/index.html").read_text())

    def test_html_local_assets_exist(self):
        source = (ROOT / "site/index.html").read_text()
        for link in re.findall(r'(?:src|href)="([^"]+)"', source):
            if not link.startswith(('https:', '#', 'data:')):
                self.assertTrue((ROOT / 'site' / link.split('?')[0]).exists(), link)

    def test_online_assets_use_content_versions(self):
        source = (ROOT / 'site/index.html').read_text()
        links = re.findall(r'(?:src|href)="((?:assets/[^"?]+|offline\.html))([^\"]*)"', source)
        self.assertEqual(len(links), 7)
        for path, version in links:
            digest = hashlib.sha256((ROOT / 'site' / path).read_bytes()).hexdigest()[:16]
            self.assertEqual(version, '?v=' + digest, path)

    def test_changed_script_gets_new_url(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            shutil.copytree(ROOT / 'site', root / 'site')
            shutil.copytree(ROOT / 'profiles', root / 'profiles')
            (root / 'tools').mkdir()
            shutil.copy2(ROOT / 'tools/build.py', root / 'tools/build.py')
            before = (root / 'site/index.html').read_text()
            app = root / 'site/assets/app.js'
            app.write_text(app.read_text() + '\n// Cache regression check\n')
            subprocess.run([sys.executable, '-S', str(root / 'tools/build.py')], check=True, capture_output=True)
            after = (root / 'site/index.html').read_text()
            url = lambda html, name: re.search(r'src="assets/' + name + r'\?v=[a-f0-9]+"', html)[0]
            self.assertNotEqual(url(before, 'app.js'), url(after, 'app.js'))
            self.assertEqual(url(before, 'profiles.js'), url(after, 'profiles.js'))
            self.assertNotRegex((root / 'site/offline.html').read_text(), r'<script[^>]+src=')

    def test_profiles_do_not_expose_local_paths(self):
        for path in (ROOT / "profiles").glob("*.json"):
            self.assertNotIn('/Users/', path.read_text())
            self.assertRegex(json.loads(path.read_text())['jarSha256'], r'^[a-f0-9]{64}$')

    def test_build_is_deterministic(self):
        first = (ROOT / 'site/offline.html').read_bytes()
        online = (ROOT / 'site/index.html').read_bytes()
        subprocess.run([sys.executable, '-S', str(ROOT / 'tools/build.py')], check=True, capture_output=True)
        self.assertEqual(first, (ROOT / 'site/offline.html').read_bytes())
        self.assertEqual(online, (ROOT / 'site/index.html').read_bytes())


if __name__ == '__main__':
    unittest.main()
