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

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = r"""
const C=require('./site/assets/core.js'), W=require('./site/assets/workflows.js');
const profile=require('./profiles/26.5.260807.json'), cases=[];
for(const scenario of Object.keys(C.SCENARIOS)) {
  const p=W.exampleProject(profile.id,scenario), source=W.sourceProject(p,profile);
  for(const item of [p,source].filter(Boolean)) {
    if(C.validate(item,profile).some(i=>i.level==='error'))throw new Error('Invalid example '+item.fileName);
    cases.push({name:item.fileName,text:C.renderConfig(item),expected:Object.fromEntries(C.entries(item))});
  }
}
process.stdout.write(JSON.stringify(cases));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jar', type=Path)
    args = parser.parse_args()
    jar = args.jar.resolve(strict=True)
    cases = json.loads(subprocess.check_output(['node', '-e', GENERATOR], cwd=ROOT, text=True))
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
