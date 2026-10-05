#!/usr/bin/python
"""Read-only, advisory progress. Never starts or certifies an Oracle operation."""
import hashlib
import json
from pathlib import Path
import re
import time

DOCUMENTATION = r'''
module: alis_progress
short_description: Read progress for this ALIS patch cycle
description: Reads current native reports without acquiring the runner locks or changing files.
options:
  work_dir:
    type: path
    required: true
  action:
    type: str
    required: true
  plan_sha:
    type: str
    required: true
author: ALIS
'''

PHASES = ('analyze', 'download', 'create_home', 'deploy')
VERIFYING = {
    'analyze': 'Verifying readiness reports and checklists',
    'download': 'Verifying media checksums and source database',
    'create_home': 'Verifying target inventory and source database',
    'deploy': 'Verifying active home, inventory and SQL patch registry',
}


def read_json(path, started=None):
    stat = path.stat()
    if path.is_symlink() or stat.st_size > 8 * 1024 * 1024:
        raise ValueError('Unsafe or oversized report')
    if started is not None and (stat.st_mtime < started - 1 or stat.st_mtime > time.time() + 1):
        raise ValueError('Report belongs to another execution')
    return json.loads(path.read_text(encoding='utf-8')), stat.st_mtime


def token(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_$#.-]{1,128}', value):
        raise ValueError('Invalid progress identifier')
    return value


def percent(value):
    if isinstance(value, bool) or not re.fullmatch(r'\d{1,3}', str(value)) or not 0 <= int(value) <= 100:
        raise ValueError('Invalid progress percentage')
    return int(value)


def only_job(report, sid):
    jobs = report['jobs']
    if not isinstance(jobs, list) or len(jobs) != 1 or str(jobs[0]['sid']).upper() != sid.upper():
        raise ValueError('Report belongs to another job')
    return jobs[0]


def snapshot(work_dir, action, plan_sha):
    fallback = {'summary': 'Waiting for current AutoUpgrade progress', 'available': False}
    try:
        root = Path(work_dir)
        plan_path = root / 'plan.json'
        plan, _ = read_json(plan_path)
        if hashlib.sha256(plan_path.read_bytes()).hexdigest() != plan_sha:
            return fallback
        if action == 'prepare':
            return {'summary': 'Checking JAR, database and media prerequisites', 'available': True}
        if action == 'verify':
            return {'summary': VERIFYING['deploy'], 'available': True}
        if action not in PHASES:
            return fallback
        state, _ = read_json(root / 'state.json')
        if state['plan_sha256'] != plan_sha:
            return fallback
        operation = state['operations'].get(action, {})
        if operation.get('verified'):
            return {'summary': 'Rechecking previously completed phase', 'available': True}
        if operation.get('status') != 'running':
            return fallback
        if operation.get('command_complete'):
            return {'summary': VERIFYING[action], 'available': True}
        if action == 'download':
            sizes = [p.stat().st_size for p in Path(plan['folder']).glob('*.zip') if p.is_file() and not p.is_symlink()]
            label = 'Downloading software' if plan['download'] else 'Checking staged software'
            return {'summary': '{} | staged ZIPs: {}, {} MiB'.format(label, len(sizes), sum(sizes) // (1024 * 1024)), 'available': True}
        started = operation['started']
        if type(started) not in (int, float) or started <= 0 or started > time.time() + 1:
            return fallback
        base = Path(plan['log_dir']) / ('status' if plan.get('operation') == 'upgrade' else 'cfgtoollogs/patch/auto/status')
        status, status_time = read_json(base / 'status.json', started)
        progress, progress_time = read_json(base / 'progress.json', started)
        sid = 'create_home_1' if action == 'create_home' else plan['sid']
        job, ongoing = only_job(status, sid), only_job(progress, sid)
        if (str(job['deployMode']).lower() != action or type(job['jobNo']) is not int or
                job['jobNo'] <= 0 or job['jobNo'] != ongoing['jobNo'] or
                job['sourceHome'] != plan['source_home'] or job['targetHome'] != plan['target_home']):
            return fallback
        directory = Path(job['logDirectory'])
        if (directory.parent.parent.resolve() != Path(plan['log_dir']).resolve() or
                directory.parent.name.upper() != sid.upper() or directory.name != str(job['jobNo'])):
            return fallback
        stages = ongoing['stages']
        if not isinstance(stages, list) or not stages:
            return fallback
        unfinished = [s for s in stages if percent(s['percentCompleted']) < 100]
        parts = ['job ' + str(job['jobNo'])]
        if unfinished:
            stage = unfinished[0]  # Native reports prepopulate future stages in execution order.
            name = token(stage['stage'])
            active = bool(stage.get('lastUpdateTime') or stage.get('events') or percent(stage['percentCompleted']) or
                          any(c.get('runningChecks') or c.get('completedChecks') for c in stage.get('containers', [])))
            parts.append('{}{} {}%'.format('' if active else 'waiting for ', name, percent(stage['percentCompleted'])))
            for container in stage.get('containers', [])[:3]:
                if name == 'DBUPGRADE':
                    parts.append('{} {}%'.format(token(container['container']), percent(container['percentCompleted'])))
                    continue
                completed, total = container['completedChecks'], container['totalChecks']
                if type(completed) is not int or type(total) is not int or not 0 <= completed <= total:
                    raise ValueError('Invalid check counts')
                part = '{} checks {}/{}'.format(token(container['container']), completed, total)
                running = [token(check) for check in container.get('runningChecks', [])[:2]]
                parts.append(part + ('; running ' + ', '.join(running) if running else ''))
        else:
            parts.append('native stages complete; awaiting result verification')
        parts.append('total {}%'.format(percent(ongoing['totalPercentCompleted'])))
        # Never display additionalInfo, raw log lines, command arguments or credentials.
        return {'summary': ' | '.join(parts), 'available': True,
                'report_age': max(0, int(time.time() - min(status_time, progress_time)))}
    except (OSError, ValueError, KeyError, TypeError, AttributeError, IndexError):
        # Reports can be missing or rewritten while AutoUpgrade is running.
        return fallback


def main():
    from ansible.module_utils.basic import AnsibleModule
    module = AnsibleModule(argument_spec={
        'work_dir': {'type': 'path', 'required': True},
        'action': {'type': 'str', 'required': True},
        'plan_sha': {'type': 'str', 'required': True},
    }, supports_check_mode=True)
    module.exit_json(changed=False, **snapshot(**module.params))


if __name__ == '__main__':
    main()
