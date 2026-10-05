# ALIS + Ansible

Automates one existing Linux single-instance database with out-of-place patching. Run Ansible on your Mac/Linux controller; the Oracle server is reached over SSH.

## Install and test locally

Use Python 3.12+ on the controller:

```sh
python3 -m venv ~/.venvs/alis-ansible
source ~/.venvs/alis-ansible/bin/activate
python3 -m pip install 'ansible-core>=2.21,<2.22'
```

Extract the ZIP, enter `alis-ansible`, then run:

```sh
ansible-playbook test-local.yml --syntax-check
ansible-playbook test-local.yml
```

Expect `failed=0`, `unreachable=0`. This tests the real `patch.yml` with temporary fake tools, without contacting your server, Oracle or MOS. Results: `artifacts/localhost/`.

**macOS locale error:** run `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` in this Terminal session. If unavailable, choose a UTF-8 locale from `locale -a`.

## Prepare the Oracle server

- In ALIS, select **Patch existing databases**, **Linux / Oracle Linux 9**, **Single instance**. Review `inventory.yml`, `host_vars/oracle_db.yml` and `files/autoupgrade.cfg`.
- Prepare SSH access, Python 3.9+, supported Java and Oracle installation prerequisites. Test connectivity: `ansible oracle_patch -m ansible.builtin.ping`.
- Put the exact AutoUpgrade JAR at the `jar` path in `files/plan.json`. Prepare the media directory and, for online downloads, the auto-login wallet (`cwallet.sso`) using the runbook's interactive `-load_password` procedure. Keep secrets out of YAML/JSON.
- Use distinct source/target homes and dedicated working **and global log directories** for each cycle. To select RU 19.32, use `patch=RECOMMENDED:19.32`; the target directory name does not pin the RU.
- Review manual prerequisites, backups and the maintenance window. Arrange AutoUpgrade's supported sudo execution of required root scripts for unattended installation; otherwise creation stops for administrator action.

## Run everything

```sh
ansible-playbook patch.yml
```

Add `-K` if sudo requires a password. Runs **prepare → analyze → download → create_home → deploy → verify**, stopping on failure, without approval prompts between phases.

| Individual playbook | Purpose |
| --- | --- |
| `analyze.yml` | Native `-patch -mode analyze`; verify readiness reports. |
| `download.yml` | Native `-patch -mode download`; verify media checksums. With `download=NO`, validate staged media instead. |
| `create_home.yml` | Native `-patch -mode create_home`; install the new home and verify installation/root stages and inventory. Database remains on the source home. |
| `deploy.yml` | Native `-patch -mode deploy`; requires all previous phases and moves/patches the database. |

`prepare.yml` checks/stages prerequisites; `verify.yml` checks the active home and SQL patches in every container. You can run stages separately to prepare the home before the maintenance window. Use either Ansible or the manual runbook sequence for a cycle.

With `download=YES`, native analyze/deploy validation may also fetch media. Output Gold Image packaging uses `autoupgrade.home.cfg` during home preparation to avoid creating the output twice. Imported `create_oracle_home` is replaced by the explicit patch `create_home` phase; `drop_grp_after_upgrade` maps to `drop_grp_after_patching`. If converted, review `config-adjustments.md` and the preserved `original-autoupgrade.cfg` (never executed).

## Results and resume

Read `artifacts/oracle_db/` and the server-side AutoUpgrade logs (`global_log_dir/cfgtoollogs/patch/auto/status/`). Home-preparation jobs are named `create_home_1`; database jobs use the configured SID. The runner verifies each job's checklists: INFO, RECOMMEND and WARNING findings are retained for review; ERROR findings, execution errors or incomplete checks stop the run. A zero Java exit code alone is insufficient. Complete application/service checks separately.

After fixing a failure, preserve the **original bundle, JAR, configuration and recovery state**:

```sh
ansible-playbook patch.yml -e alis_resume=true
```

Completed stages are skipped; the failed stage resumes and remaining stages start. Download reruns without a job-resume flag. If deploy completed but final verification failed, fix the cause and run `verify.yml`; deployment is not repeated. Do not replace an active bundle or clear recovery data for routine failures.

`--check` is rejected; use the simulator. Test a failure with `ansible-playbook test-local.yml -e alis_test_failure=root` (expect `failed=1`, no deploy in that sandbox). RAC, SEHA and Data Guard require separate coordination. Validation used ansible-core 2.21.4 and fake tools; no live Oracle patching was performed. Detailed commands and sources: `alis-runbook.md`.
