# ALIS Ansible bundle

Run Ansible on a macOS/Linux control machine with Python 3.12–3.14. The Linux Oracle execution host needs Python 3.9–3.14, SSH and the Oracle software owner. This bundle uses only ansible-core built-in modules.

```sh
python3 -m venv ~/.venvs/alis-ansible
source ~/.venvs/alis-ansible/bin/activate
python3 -m pip install 'ansible-core>=2.21,<2.22'
ansible-playbook --version
```

Validated with ansible-core 2.21.4 and 2.19.13. Older Python 3.8 execution hosts need the older Ansible line; check its current maintenance status before choosing it. After extracting the ZIP, enter `alis-ansible/`.

## Learn locally first

```sh
ansible-playbook test-local.yml --syntax-check
ansible-playbook test-local.yml
```

The simulator uses localhost, independent temporary files and original fake Java/SQLPlus/OPatch tools. It runs the same tasks and runner as the real playbooks, without contacting inventory hosts, Oracle or MOS. It runs prepare, analyze, deploy, verify and a second deploy, which is skipped for the completed patch cycle. Expect `failed=0` and `unreachable=0` in PLAY RECAP. Results are in the printed temporary directory and `artifacts/localhost/`.

```sh
ansible-playbook test-local.yml -e alis_test_failure=status
ansible-playbook test-local.yml -e alis_test_failure=sqlpatch
```

These intentional failure tests must end with `failed=1`, even though fake Java returns zero. They demonstrate stage-status and SQL-patch verification. Each run creates a new sandbox; delete only the exact local simulation directory when finished.

## Check the real bundle

```sh
ansible-inventory --graph
ansible-playbook prepare.yml --syntax-check
ansible-playbook analyze.yml --syntax-check
ansible-playbook deploy.yml --syntax-check
ansible-playbook verify.yml --syntax-check
```

Syntax checks do not contact the database. Review `inventory.yml`, `host_vars/oracle_db.yml`, `files/plan.json`, `files/autoupgrade.cfg` and `alis-runbook.md`. The plan pins the selected JAR build/SHA-256 and configuration checksum. YAML variable values are treated as literal data; the runner invokes argument lists without a shell.

Verify the host's SSH key through your normal SSH connection, then test SSH/Python with:

```sh
ansible oracle_patch -m ansible.builtin.ping
```

This is an SSH/Python test, not ICMP ping. When the SSH account differs from the software owner, Ansible uses sudo. Add `-K` to playbook commands if sudo requires a password; use an existing SSH key or `--ask-pass` for SSH authentication.

## Execute on a laboratory database

Prepare OS/installer prerequisites, the Oracle owner/groups and supported Java. Place your separately obtained JAR at the `jar` path in `files/plan.json`. A basename entered in ALIS resolves inside the Ansible working directory. For online media, prepare the AutoUpgrade auto-login keystore interactively with `-load_password`; the runner requires `cwallet.sso`. Offline media must include companion metadata. Prepare TDE separately and keep passwords out of this bundle.

Use dedicated working and global log directories for every patch cycle. Root-script execution remains an operational step from the runbook and AutoUpgrade messages; the bundle does not invent root privileges. Plan the maintenance window, backup and application checks.

```sh
ansible-playbook prepare.yml
ansible-playbook analyze.yml
```

Read the fetched results under `artifacts/oracle_db/` and AutoUpgrade's server-side reports before deployment.

```sh
ansible-playbook deploy.yml
ansible-playbook verify.yml
```

Deploy requires a successful analysis from this exact bundle. Success requires fresh AutoUpgrade status/progress, successful required stages, the active target home via Linux `/proc`, target inventory and successful latest SQL-patch APPLY rows in all containers. Closed PDBs prevent complete verification. If AutoUpgrade completed but final verification failed, fix the cause and run verify.yml; patching is not repeated. Unfinished or failed database checks block readiness; inspect the per-container report. Review application/service checks separately.

Scope: one existing Linux single-instance database, no Data Guard, OUTOFPLACE patching. Both export validation and runtime database checks reject incompatible topologies. RAC, SEHA, RAC One Node and Data Guard require separate coordination. No real Oracle patch deployment was performed when validating this exporter.

## Resume and repeat

Each task has the configured async timeout; expiry interrupts the operation. Choose a sufficient runtime. If the controller disconnects, check whether the server process is still running before resubmitting. The runner locks both the bundle and log directory against concurrent ALIS processes.

After inspecting/fixing a failed operation, preserve the original bundle, JAR, configuration and recovery/log state:

```sh
ansible-playbook deploy.yml -e alis_resume=true
```

26.6 receives `-resume`; 26.5 reuses the same command and native recovery state. Immutable staged-file checks reject changed bundles. A completed deploy is verified and skipped instead of patched again. Use a new bundle and new directories for the next patch cycle. Do not clear recovery data to handle routine failures.

`--check` cannot simulate Oracle and is rejected. Use `test-local.yml` for simulation and `analyze.yml` for actual readiness checks. For a complete Polish walkthrough see [README.pl.md](README.pl.md).

Sources: [Ansible installation](https://docs.ansible.com/projects/ansible/latest/installation_guide/intro_installation.html), [async tasks](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_async.html), [AutoUpgrade CLI](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-command-line-parameters.html).
