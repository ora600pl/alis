#!/usr/bin/env python3
"""Real Ansible local/transfer prompts, fake Java/media; no SSH, MOS or database."""
import hashlib
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]


def interactive(command, cwd, env, answers):
    pid, fd = pty.fork()
    if pid == 0:
        os.chdir(cwd); os.execvpe(command[0], command, env)
    output, index = b'', 0
    deadline = time.monotonic() + 180
    try:
        while time.monotonic() < deadline:
            if select.select([fd], [], [], 0.2)[0]:
                try:
                    data = os.read(fd, 65536)
                except OSError:
                    break
                if not data:
                    break
                output += data
                if index < len(answers) and answers[index][0].encode() in output:
                    time.sleep(0.3)
                    os.write(fd, (answers[index][1] + '\n').encode()); index += 1
        else:
            os.kill(pid, signal.SIGTERM); raise RuntimeError('Interactive controller test timed out')
        _, status = os.waitpid(pid, 0)
        if index != len(answers):
            raise RuntimeError('A required prompt was not reached:\n' + output.decode(errors='replace'))
        return os.waitstatus_to_exitcode(status), output.decode(errors='replace')
    finally:
        os.close(fd)


def check(executable):
    with tempfile.TemporaryDirectory(prefix='alis-local-transfer-') as temp:
        root = Path(temp);bundle = root / 'bundle';bundle.mkdir()
        script = """
const fs=require('node:fs'),path=require('node:path'),W=require('./site/assets/workflows.js'),A=require('./site/assets/ansible.js'),profile=require('./profiles/26.6.260925.json');
(async()=>{const p=W.exampleProject(profile.id,'upgrade');p.mode='deploy';p.execution={downloadHost:'controller'};p.automation={host:'never-contact-this-host.invalid'};p.jobs[0].context={os:'linux',topology:'single',mediaPlatform:'LINUX.X64'};Object.assign(p.jobs[0].values,{download:'YES',create_oracle_home:'YES',folder:'/media',target_version:'26'});for(const f of await A.bundle(p,profile)){const dest=path.join(process.argv[1],f.name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,f.content);}})().catch(e=>{console.error(e);process.exit(1)});
"""
        subprocess.run(['node', '-e', script, str(bundle)], cwd=ROOT, check=True)
        server = root / 'server';local = bundle / 'controller';local.mkdir()
        jar = local / 'autoupgrade.jar';jar.write_bytes(b'FAKE JAR FOR LOCAL TESTS')
        plan_path=bundle / 'files/plan.json';plan=json.loads(plan_path.read_text())
        plan.update(jar=str(server / 'autoupgrade.jar'), jar_sha256=hashlib.sha256(jar.read_bytes()).hexdigest(), folder=str(server / 'media'),keystore=str(server / 'wallet'))
        plan_path.write_text(json.dumps(plan))
        fake = root / 'fake-java'
        fake.write_text('#!' + sys.executable + '\n' + r'''
import sys,json,hashlib,zipfile
from pathlib import Path
if '-version' in sys.argv:
    print('AutoUpgrade 26.6.260925');sys.exit(0)
config=Path(sys.argv[sys.argv.index('-config')+1])
values=dict(line.split('=',1) for line in config.read_text().splitlines())
assert not any('source_home' in key or key.endswith('.sid') for key in values)
assert values['media.target_version']=='26' and values['media.platform']=='LINUX.X64'
if '-load_password' in sys.argv:
    assert sys.stdin.isatty() and sys.stdout.isatty(), 'Native loader needs a real terminal'
    assert input('SIMULATED wallet mode: ')=='SHARED'
    wallet=Path(values['global.keystore'])
    (wallet/'cwallet.sso').write_bytes(b'FAKE SHARED WALLET')
    (wallet/'ewallet.p12').write_bytes(b'FAKE PASSWORD WALLET')
else:
    assert sys.argv[sys.argv.index('-mode')+1]=='download'
    folder=Path(values['media.folder']);media=folder/'db.zip'
    with zipfile.ZipFile(media,'w') as archive:archive.writestr('SIMULATED.txt','No Oracle binaries')
    (folder/'aru-bug-map.json').write_text('{}')
    metadata={'patchFolder':str(folder),'patches':[{'description':'DB Gold Image - 23.26.3.0.0','releaseUpdate':'23.26.3.0.0','platform':'Linux x86-64','files':[{'name':media.name,'size':media.stat().st_size,'checksum-256':hashlib.sha256(media.read_bytes()).hexdigest()}]}]}
    (folder/'patches_info.json').write_text(json.dumps(metadata))
''');fake.chmod(0o700)
        # This is a local-only copy test, not an Oracle target.
        (bundle / 'inventory.yml').write_text('all:\n  children:\n    oracle_upgrade:\n      hosts:\n        oracle_db:\n          ansible_connection: local\n')
        (bundle / 'host_vars/oracle_db.yml').write_text('alis_become: false\nalis_oracle_user: unused\nalis_work_dir: '+json.dumps(str(server / 'work'))+'\nansible_python_interpreter: '+json.dumps(sys.executable)+'\n')
        env=dict(os.environ,ANSIBLE_HOME=str(root/'ansible'),ANSIBLE_LOCAL_TEMP=str(root/'tmp'),ANSIBLE_REMOTE_TEMP=str(root/'remote-tmp'),LC_ALL='en_US.UTF-8' if sys.platform=='darwin' else 'C.UTF-8',LANG='en_US.UTF-8' if sys.platform=='darwin' else 'C.UTF-8')
        for name in ('local','transfer','remote','upgrade'):
            result=subprocess.run([executable,name+'.yml','--syntax-check'],cwd=bundle,env=env,capture_output=True,text=True)
            if result.returncode:raise RuntimeError(result.stdout+result.stderr)
        command=[executable,'local.yml','-e',json.dumps({'alis_controller_java':str(fake)})]
        code,output=interactive(command,bundle,env,[('Type YES:', 'NO')])
        assert code!=0 and not server.exists(), output
        code,output=interactive(command,bundle,env,[('Type YES:', 'YES'),('SIMULATED wallet mode:', 'SHARED'),('Type SHARED:', 'SHARED')])
        assert code==0 and not server.exists(), output
        # Completed staging works without Java or the internet.
        result=subprocess.run([executable,'local.yml','-e','alis_controller_java=/does/not/exist'],cwd=bundle,env=env,capture_output=True,text=True,stdin=subprocess.DEVNULL)
        assert result.returncode==0,result.stdout+result.stderr
        code,output=interactive([executable,'transfer.yml'],bundle,env,[('Type YES to transfer','NO')])
        assert code!=0 and not server.exists(),output
        code,output=interactive([executable,'transfer.yml'],bundle,env,[('Type YES to transfer','YES')])
        assert code==0,output
        assert (server/'wallet/ewallet.p12').read_bytes()==b'FAKE PASSWORD WALLET'
        assert (server/'media/aru-bug-map.json').is_file()
        assert json.loads((server/'media/patches_info.json').read_text())['patchFolder']==str(server/'media')
        assert json.loads((server/'work/transferred.json').read_text())['plan_sha256']==hashlib.sha256(plan_path.read_bytes()).hexdigest()
        assert (server/'wallet/cwallet.sso').stat().st_mode & 0o777 == 0o700
        (server/'autoupgrade.jar').write_bytes(b'KEEP EXISTING CYCLE')
        result=subprocess.run([executable,'transfer.yml','-e','alis_approve_transfer=true'],cwd=bundle,env=env,capture_output=True,text=True)
        assert result.returncode!=0 and (server/'autoupgrade.jar').read_bytes()==b'KEEP EXISTING CYCLE',result.stdout+result.stderr
        print('PASS real Ansible: local approval, native terminal, offline local resume, transfer NO/YES, complete copy, metadata rebasing and conflict preservation.',flush=True)


if __name__ == '__main__':
    check(shutil.which('ansible-playbook') or '/private/tmp/alis-ansible-venv/bin/ansible-playbook')
