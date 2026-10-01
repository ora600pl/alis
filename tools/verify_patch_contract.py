#!/usr/bin/env python3
"""Compare the reviewed 26.6 profile/grammar with isolated APIs from the real JAR. Stdlib only."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from inspect_jar import inspect

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jar', type=Path)
    args = parser.parse_args()
    jar = args.jar.resolve(strict=True)
    identity = inspect(jar)
    if identity['version'] != '26.6.260925':
        raise SystemExit('This isolated contract probe targets 26.6.260925')
    profile = json.loads((ROOT / 'profiles' / (identity['version'] + '.json')).read_text())
    if identity['sha256'] != profile['jarSha256']:
        raise SystemExit('JAR checksum mismatch')
    expressions = profile['behavior']['patchTokens'] + ['TOOLS', 'RECOMMENDED', '12345678', 'GOLDIMAGE', 'GOLDIMAGE:home.zip', 'GOLDIMAGE:bad.name.zip', 'TZ', 'OGGRU', 'BASE_IMAGE', 'CPAT:1', 'DBSAT:4']
    for alias in ['RU', 'RECOMMENDED', 'OCW', 'OJVM', 'GI', 'OEM', 'EXAQFSDP']:
        expressions += [alias + ':' + version for version in ['19', '19.32', '19.32.0', '21.20', '23.9', '23.26.0', '23.26.4', '23.26.5', '26', '26.4', '13.5', '24.1', '24.2']]
    with tempfile.TemporaryDirectory(prefix='alis-contract-') as temp:
        subprocess.run(['javac', '-cp', str(jar), '-d', temp, str(ROOT / 'tools/PatchContractProbe.java')], check=True)
        output = subprocess.check_output(['java', '-cp', os.pathsep.join([temp, str(jar)]), 'PatchContractProbe', *expressions], text=True)
    generator = "const C=require('./site/assets/core.js'),p=require('./profiles/26.6.260925.json');process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]).map(x=>!C.patchParts(x,p).some(t=>t.error))));"
    javascript = json.loads(subprocess.check_output(['node', '-e', generator, json.dumps(expressions)], cwd=ROOT, text=True))
    observed = {}; params = {'upgrade': set(), 'patch': set()}; checks = 0
    for line in output.splitlines():
        pieces = line.split('\t')
        if pieces[0] == 'PARAM':
            params[pieces[1]].add(pieces[2])
        elif pieces[0] == 'EXPRESSION':
            observed[pieces[1]] = pieces[2] == 'true'
        elif pieces[0] == 'DOWNLOAD':
            assert (pieces[1] in profile['behavior']['downloadOnlyTools']) == (pieces[2] == 'true'), pieces
            checks += 1
        elif pieces[0] == 'COMBINE':
            permitted = pieces[1] == 'GI' and pieces[2] in ['MRP', 'OPATCH', 'PATCH_NUMBER']
            assert permitted == (pieces[3] == 'true'), pieces
            checks += 1
        elif pieces[0] == 'NORMALIZE':
            assert pieces[2] == '19', pieces
            checks += 1
        elif pieces[0] == 'DELAY':
            assert (int(pieces[1]) >= 60) == (pieces[2] == 'true'), pieces
            checks += 1
    for expression, accepted in zip(expressions, javascript):
        assert observed[expression] == accepted, (expression, observed[expression], accepted)
        checks += 1
    for operation, names in params.items():
        assert names == {p['name'] for p in profile['operations'][operation]}, operation
        checks += 1
    print(f'{checks} real-JAR contract comparisons passed ({len(expressions)} patch expressions). No launcher, Oracle or ARU service was invoked.')


if __name__ == '__main__':
    main()
