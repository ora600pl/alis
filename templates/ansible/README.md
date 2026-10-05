# ALIS + Ansible

This bundle automates one local Linux single-instance database. Run Ansible on your Mac/Linux controller; the Oracle server is reached over SSH. Review `inventory.yml`, `host_vars/oracle_db.yml`, `files/autoupgrade.cfg` and `alis-runbook.md`.

## Install and test

Use Python 3.12+ on the controller, extract the ZIP and enter `alis-ansible`:

```sh
python3 -m venv ~/.venvs/alis-ansible
source ~/.venvs/alis-ansible/bin/activate
python3 -m pip install 'ansible-core>=2.21,<2.22'
ansible-playbook test-local.yml --syntax-check
ansible-playbook test-local.yml
```

Expect `failed=0`, `unreachable=0`. The simulator uses fake tools in a temporary directory; it never contacts Oracle, MOS or your server. It explicitly approves its simulated deploy. Results: `artifacts/localhost/`. For a macOS locale error, run `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` in this Terminal session.

## Prepare and run

- In ALIS, select **Patch existing databases** or **Upgrade a database**, then **Linux / Oracle Linux 9** and **Single instance**. Other migration, conversion, selected-PDB, cluster and Data Guard workflows require separate automation.
- Prepare SSH, server Python 3.9+, supported Java, the exact profile JAR at the `jar` path in `files/plan.json`, installation prerequisites, backups and required root-script execution. Use distinct source/target homes and dedicated working/log directories for each cycle. Prepare an auto-login wallet interactively with the runbook if downloading media; keep secrets out of YAML/JSON.
- **Patch:** `ansible-playbook patch.yml` runs prepare → analyze → download → create_home → **approval** → deploy → verify. Pin a specific RU in the patch expression, not the directory name. Imported `create_oracle_home` becomes explicit patch home preparation; review `config-adjustments.md` when supplied.
- **Upgrade:** `ansible-playbook upgrade.yml` runs prepare → analyze → **approval** → deploy → verify, without `-patch`. Source release must be 12.2 or later, and target release must be higher. An existing target home is checked before analysis. With `create_oracle_home=YES`, native deploy downloads media when configured and creates the home after approval; source-home `jdk/bin/java`, media and root-script prerequisites must be ready. Non-CDB to PDB conversion is outside this exporter.

Add `-K` if sudo needs a password. Before an actual deploy or deploy resume, review the collected analyze reports and type **YES** at the maintenance-window prompt. Any other answer stops before database changes. Approval is not remembered for a later run. For a window already approved by your automation process:

```sh
ansible-playbook __ALIS_OPERATION__.yml -e alis_approve_deploy=true
```

You can run the included stage playbooks separately. `deploy.yml` requires successful earlier phases and the same approval. `verify.yml` only checks a completed deployment. `--check` is rejected; use the simulator. `[ALIS]` updates show native stages and progress; unchanged operations get a heartbeat.

## Results and resume

Read `artifacts/oracle_db/` and the native logs: reports are under `global_log_dir/cfgtoollogs/patch/auto/status/` for patching or `global_log_dir/cfgtoollogs/upgrade/auto/status/` for upgrades. Completion requires successful native reports/checklists, the active target home and successful local SQL patch registries in every container, including `PDB$SEED`. Upgrade also verifies container preservation and core component versions/statuses. Java exit code zero alone is insufficient. Complete application/service checks separately.

After resolving a failure, keep the **original bundle, JAR, configuration and recovery state** and run `ansible-playbook __ALIS_OPERATION__.yml -e alis_resume=true`. Completed stages are skipped. If native deploy completed but verification failed, fix the cause and run `verify.yml`; deployment is not repeated and no approval is needed. Do not replace an active bundle or clear recovery data for routine failures.

Validated with ansible-core 2.21.4 and fake tools; no live Oracle upgrade was performed. Detailed manual commands and sources: `alis-runbook.md`.
