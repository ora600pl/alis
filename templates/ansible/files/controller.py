#!/usr/bin/env python3
"""Local online staging. Secrets stay in the native wallet loader's terminal."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import urllib.request

from runner import digest, require, save, verify_download

JAR_URL = 'https://download.oracle.com/otn-pub/otn_software/autoupgrade.jar'


def private_tree(root):
    require(not root.is_symlink(), 'Staging directories must not be symlinks.')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(root, 0o700)
    for path in root.rglob('*'):
        require(not path.is_symlink() and (path.is_file() or path.is_dir()), 'Unsupported staging entry: ' + str(path))
        os.chmod(path, 0o700 if path.is_dir() or root.name == 'wallet' else 0o600)


def check_directory(root, plan_sha):
    """Reject an unrelated directory before changing permissions or writing files."""
    require(not root.is_symlink() and root.is_dir(), 'Use a dedicated staging directory.')
    binding = root / 'plan.sha256'
    if binding.exists() or binding.is_symlink():
        require(not binding.is_symlink() and binding.is_file() and binding.read_text().strip() == plan_sha, 'Use a new local staging directory for a different plan.')
        return
    for path in root.iterdir():
        require(not path.is_symlink(), 'Staging entries must not be symlinks.')
        if path.name in ('media', 'wallet', 'logs'):
            require(path.is_dir() and not any(path.iterdir()), 'Use a dedicated empty staging directory for this cycle.')
        else:
            require(path.name in ('.lock', 'autoupgrade.jar') and path.is_file(), 'Use a dedicated empty staging directory for this cycle.')


def collect(root):
    entries = {}
    for area in ('media', 'wallet'):
        for path in sorted((root / area).rglob('*')):
            require(not path.is_symlink() and (path.is_file() or path.is_dir()), 'Unsupported staging entry: ' + str(path))
            if path.is_file():
                entries[str(path.relative_to(root))] = digest(path)
    entries['autoupgrade.jar'] = digest(root / 'autoupgrade.jar')
    return entries


def parameters(plan, root):
    # Strict allowlist prevents a database command or a server path on the controller.
    allowed = ('target_version', 'patch', 'gold_image', 'gold_image.security_patch_level', 'platform')
    values = {key: value for key, value in plan['download_parameters'].items() if key in allowed}
    require(values.get('platform') and values.get('target_version'), 'Select an explicit target release and platform in ALIS.')
    values.update(folder=str(root / 'media'), download='YES')
    lines = ['global.global_log_dir=' + str(root / 'logs'), 'global.keystore=' + str(root / 'wallet')]
    lines += ['media.' + key + '=' + str(value) for key, value in values.items()]
    require(all('\n' not in line and '\r' not in line and '\0' not in line for line in lines), 'Invalid download configuration.')
    return '\n'.join(lines) + '\n'


def validate_stage(root, plan, plan_sha):
    path = root / 'manifest.json'
    require(path.is_file() and not path.is_symlink(), 'Run local.yml successfully before transfer.yml.')
    manifest = json.loads(path.read_text())
    require(manifest.get('plan_sha256') == plan_sha, 'This local staging directory belongs to a different plan.')
    require(manifest.get('shared_wallet') is True, 'Confirm a SHARED auto-login wallet before transfer.')
    require(manifest['files_sha256'] == collect(root), 'Local staged files changed after verification. Preserve the cycle and investigate before transfer.')
    require(digest(root / 'autoupgrade.jar') == plan['jar_sha256'], 'Staged JAR differs from the selected profile.')
    verify_download(root / 'media', plan['target_version'], plan.get('pinned_ru', ''), plan['media_platform'])
    return manifest


def transfer_manifest(root, plan, plan_sha):
    manifest = validate_stage(root, plan, plan_sha)
    output = []
    # AutoUpgrade records an absolute download directory; rebase metadata only.
    metadata = json.loads((root / 'media/patches_info.json').read_text())
    metadata['patchFolder'] = plan['folder']
    save(root / 'transfer-patches_info.json', metadata)
    for name, checksum in manifest['files_sha256'].items():
        source = root / name
        if name == 'autoupgrade.jar':
            dest = plan['jar']
        else:
            area, relative = name.split('/', 1)
            dest = str(Path(plan['folder'] if area == 'media' else plan['keystore']) / relative)
        if name == 'media/patches_info.json':
            source = root / 'transfer-patches_info.json'
            checksum = digest(source)
        output.append({'src': str(source), 'dest': dest, 'sha256': checksum, 'mode': '0700' if name.startswith('wallet/') else '0600'})
    result = {'plan_sha256': plan_sha, 'files': output}
    save(root / 'transfer.json', result)
    return result


def prepare(root, plan, plan_sha, java, jar_url=JAR_URL):
    require(plan.get('controller_download'), 'This bundle uses server downloads. Select workstation downloads in ALIS and export a new bundle.')
    check_directory(root, plan_sha)
    os.chmod(root, 0o700)
    for area in ('media', 'wallet', 'logs'):
        private_tree(root / area)
    binding = root / 'plan.sha256'
    if not binding.exists():
        binding.write_text(plan_sha + '\n'); os.chmod(binding, 0o600)
    if (root / 'manifest.json').exists():
        validate_stage(root, plan, plan_sha)
        print('Local download already verified. No internet or server connection needed.')
        return False
    require(sys.stdin.isatty(), 'Local wallet setup requires an interactive terminal. Run ansible-playbook local.yml in a Terminal.')
    require(input('Download AutoUpgrade and prepare the local MOS wallet/media now? Type YES: ').strip() == 'YES', 'Local preparation was not approved.')
    jar = root / 'autoupgrade.jar'
    if not jar.exists():
        print('Downloading AutoUpgrade from Oracle ...', flush=True)
        temporary = root / 'autoupgrade.jar.part'
        try:
            with urllib.request.urlopen(jar_url, timeout=120) as source, temporary.open('wb') as dest:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    dest.write(chunk)
            require(digest(temporary) == plan['jar_sha256'], 'Oracle currently serves a different JAR than profile ' + plan['profile'] + '. Select the matching reviewed ALIS profile, or place the exact profile JAR in ' + str(jar) + '. No wallet or database action was started.')
            os.chmod(temporary, 0o600); os.replace(temporary, jar)
        finally:
            if temporary.exists():
                temporary.unlink()
    require(not jar.is_symlink() and digest(jar) == plan['jar_sha256'], 'Local JAR does not match the selected profile.')
    version = subprocess.run([java, '-jar', str(jar), '-version'], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout
    require(re.search(r'(?<![\d.])' + re.escape(plan['profile']) + r'(?![\d.])', version), 'Unexpected AutoUpgrade build.')
    config = root / 'autoupgrade.download.cfg'
    config.write_text(parameters(plan, root)); os.chmod(config, 0o600)
    print('\nMOS wallet setup: add -user YOUR_MOS_USER, list, exit. Save YES and select auto-login SHARED.\nPasswords go only to the native hidden prompts; they are not recorded by Ansible.\n', flush=True)
    # Inherit the real terminal. Do not capture wallet dialogue or pass credentials.
    subprocess.run([java, '-jar', str(jar), '-patch', '-config', str(config), '-load_password'], check=True)
    private_tree(root / 'wallet')
    require((root / 'wallet/cwallet.sso').is_file() and (root / 'wallet/ewallet.p12').is_file(), 'The loader did not save both AutoUpgrade wallet files.')
    require(input('Confirm that auto-login was saved as SHARED for transfer to another host. Type SHARED: ').strip() == 'SHARED', 'Portable-wallet confirmation is required; rerun local.yml to configure it.')
    print('Downloading target release ' + plan['target_version'] + ' for ' + plan['media_platform'] + ' ...', flush=True)
    subprocess.run([java, '-jar', str(jar), '-patch', '-config', str(config), '-mode', 'download', '-noconsole'], check=True)
    private_tree(root / 'media')
    verify_download(root / 'media', plan['target_version'], plan.get('pinned_ru', ''), plan['media_platform'])
    save(root / 'manifest.json', {'plan_sha256': plan_sha, 'shared_wallet': True, 'files_sha256': collect(root)})
    print('Local software and wallet verified. You can now connect VPN and run transfer.yml.', flush=True)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('prepare', 'verify'))
    parser.add_argument('--plan', required=True)
    parser.add_argument('--root', required=True)
    parser.add_argument('--java', default='java')
    args = parser.parse_args()
    root = Path(args.root).absolute()
    require(not root.is_symlink() and root != Path('/'), 'Use a dedicated staging directory.')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root = root.resolve()
    plan = json.loads(Path(args.plan).read_text())
    require(plan.get('controller_download') and not plan.get('simulation'), 'A real workstation-download plan is required.')
    checksum = digest(args.plan)
    check_directory(root, checksum)
    with os.fdopen(os.open(root / '.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'a') as lock:
        require(stat.S_ISREG(os.fstat(lock.fileno()).st_mode), 'Invalid staging lock file.')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == 'prepare':
            prepare(root, plan, checksum, args.java)
        else:
            transfer_manifest(root, plan, checksum)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print('Local staging failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
