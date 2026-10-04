#!/usr/bin/env python3
"""Compare generated examples with the supplied JAR's isolated file parser.

No Oracle server or launcher is invoked. Requires local node, javac and java.
The proprietary binary is provided separately by the maintainer.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
from inspect_jar import inspect

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = r"""
const C=require('./site/assets/core.js'), W=require('./site/assets/workflows.js');
const profile=require('./profiles/'+process.env.ALIS_PROFILE+'.json'), cases=[];
for(const scenario of Object.keys(C.SCENARIOS)) {
  const p=W.exampleProject(profile.id,scenario), source=W.sourceProject(p,profile);
  for(const item of [p,source].filter(Boolean)) {
    if(C.validate(item,profile).some(i=>i.level==='error'))throw new Error('Invalid example '+item.fileName);
    cases.push({name:item.fileName,text:C.renderConfig(item),expected:Object.fromEntries(C.entries(item))});
  }
}
if(profile.behavior?.strictPatchSyntax){
  for(const patch of ['CPAT','DBSAT','EXAPATCHMGR','EXAQFSDP:26','OEM:24.1','GI:19.32,MRP,OPATCH','RU:21.20,CSPU']){
    const p=W.exampleProject(profile.id,'download');p.jobs[0].values.patch=patch;
    if(patch.startsWith('RU:21'))p.jobs[0].values.target_version='21';
    if(C.validate(p,profile).some(i=>i.level==='error'))throw new Error('Invalid download '+patch);
    cases.push({name:'download-'+cases.length+'.cfg',text:C.renderConfig(p),expected:Object.fromEntries(C.entries(p))});
  }
  const p=W.exampleProject(profile.id,'upgrade');p.globals.rac_start_time_sleep_in_seconds='120';
  cases.push({name:'rac-delay.cfg',text:C.renderConfig(p),expected:Object.fromEntries(C.entries(p))});
}
{
  const p=W.exampleProject(profile.id,'upgrade');
  Object.assign(p.jobs[0].values,{create_oracle_home:'YES',folder:'/media',gold_image:'YES','gold_image.security_patch_level':'HIGH'});
  if(C.validate(p,profile).some(i=>i.level==='error'))throw new Error('Invalid integrated home image');
  cases.push({name:'upgrade-home-image.cfg',text:C.renderConfig(p),expected:Object.fromEntries(C.entries(p))});
}
process.stdout.write(JSON.stringify(cases));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jar', type=Path)
    args = parser.parse_args()
    jar = args.jar.resolve(strict=True)
    identity = inspect(jar)
    profile_path = ROOT / 'profiles' / (identity['version'] + '.json')
    if not profile_path.exists():
        raise SystemExit('No reviewed profile for ' + str(identity['version']))
    profile = json.loads(profile_path.read_text())
    if identity['sha256'] != profile['jarSha256']:
        raise SystemExit('JAR checksum does not match the reviewed profile')
    env = dict(os.environ, ALIS_PROFILE=profile['id'])
    cases = json.loads(subprocess.check_output(['node', '-e', GENERATOR], cwd=ROOT, text=True, env=env))
    with tempfile.TemporaryDirectory(prefix='alis-parser-') as temp:
        work = Path(temp)
        subprocess.run(['javac', '-cp', str(jar), '-d', temp, str(ROOT / 'tools/ParserProbe.java')], check=True)
        for case in cases:
            (work / case['name']).write_text(case['text'], encoding='ascii')
        result = subprocess.run(['java', '-cp', os.pathsep.join([temp, str(jar)]), 'ParserProbe',
                                 *[case['name'] for case in cases]], cwd=work, text=True,
                                capture_output=True, check=True)
        actual = {}
        for line in result.stdout.splitlines():
            parts = line.split('\t')
            if len(parts) == 3 and parts[0] == 'RESULT' and parts[2] == 'OK':
                actual[parts[1]] = {}
            if len(parts) == 4 and parts[0] == 'VALUE':
                key, value = [base64.b64decode(v).decode() for v in parts[2:]]
                actual[parts[1]][key] = value
        for case in cases:
            if actual.get(case['name']) != case['expected']:
                raise SystemExit('Parser mismatch: ' + case['name'])
            print('PASS', case['name'], len(case['expected']), 'assignments')
    print(f'{len(cases)} parser comparisons passed. No semantic pipeline or database execution was tested.')


if __name__ == '__main__':
    main()
