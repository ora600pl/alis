# ALIS + Ansible: your first run

Ansible runs on your Mac or Linux computer, called the **controller**. It sends files and commands to the Oracle server over SSH. Install Ansible only on the controller; the Linux Oracle server needs Python and an SSH account. A **playbook** is a YAML file containing an ordered set of tasks. The **inventory** lists the servers to manage. This bundle uses only modules included in `ansible-core`.

## 1. Install Ansible on the controller

Use Python 3.12–3.14 on the controller. The Oracle execution host needs Python 3.9–3.14. In Terminal:

```sh
python3 -m venv ~/.venvs/alis-ansible
source ~/.venvs/alis-ansible/bin/activate
python3 -m pip install 'ansible-core>=2.21,<2.22'
ansible-playbook --version
```

When you open a new Terminal session, activate the environment again with `source ~/.venvs/alis-ansible/bin/activate`. The bundle was validated with ansible-core 2.21.4 and 2.19.13. Older Python 3.8 execution hosts need the older Ansible line; check its current maintenance status before choosing it.

## 2. Export a bundle and learn locally

In ALIS, select **Patch existing databases**. Under **Environment**, select **Linux** or **Oracle Linux 9** and **Single instance**. Complete your patch configuration. In **Runbook → Automate with Ansible**, enter the execution host, SSH user, Oracle software owner and a dedicated working directory, then select **Download Ansible bundle .zip**. Each patch cycle needs its own working directory and global log directory.

Extract the ZIP and use Terminal to enter the `alis-ansible` folder. Then run:

```sh
ansible-playbook test-local.yml --syntax-check
ansible-playbook test-local.yml
```

The simulator uses localhost, independent temporary files and fake Java/SQLPlus/OPatch tools. It runs the same tasks and runner as the real playbooks, with its own simulation configuration. It does not contact the server in `inventory.yml`, Oracle or MOS. It runs prepare → analyze → deploy → verify → a second deploy. The last deploy is skipped because the patch cycle has already succeeded.

Expect `failed=0` and `unreachable=0` in `PLAY RECAP`. A positive `changed` count is normal: it reports tasks that performed work. Results are in the printed temporary directory, with copies in `artifacts/localhost/` inside the extracted bundle.

To see how a failure is reported:

```sh
ansible-playbook test-local.yml -e alis_test_failure=status
ansible-playbook test-local.yml -e alis_test_failure=sqlpatch
ansible-playbook test-local.yml -e alis_test_failure=checks
```

These intentional failure tests must end with `failed=1`, even though fake Java returns zero. They demonstrate stage-status, SQL-patch and analysis-check verification. With `checks`, analysis fails and the playbook stops before deploy; inspect `artifacts/localhost/analyze-result.json`. There must be no deploy result for that run. Use a fresh extracted bundle or remove the previous local simulation artifacts first, so older deploy results are not confused with this run. Each run creates a new sandbox; delete only the exact local simulation directory when finished.

## 3. Check the bundle for your server

```sh
ansible-inventory --graph
ansible-playbook prepare.yml --syntax-check
ansible-playbook analyze.yml --syntax-check
ansible-playbook deploy.yml --syntax-check
ansible-playbook verify.yml --syntax-check
```

These commands check the file structure without executing Oracle. `inventory.yml` contains the host and SSH account; `host_vars/oracle_db.yml` contains the Oracle owner, working directory and timeout. `files/plan.json` records the selected JAR build/SHA-256, SID, paths and configuration checksum. The original wizard configuration is in `files/autoupgrade.cfg`; the operational instructions are in `alis-runbook.md`. YAML variable values are treated as literal data; the runner invokes argument lists without a shell.

Verify the host's SSH key through your normal SSH connection, then test SSH/Python with:

```sh
ansible oracle_patch -m ansible.builtin.ping
```

This is an SSH/Python test, not ICMP ping. When the SSH account differs from the software owner, Ansible uses sudo. Add `-K` to playbook commands if sudo requires a password; use an existing SSH key or `--ask-pass` for SSH authentication.

## 4. Prepare a laboratory database host

Prepare OS/installer prerequisites, the Oracle owner/groups, supported Java and the media directory. The JAR is not included in the ZIP: place your separately obtained JAR at the `jar` path in `files/plan.json`. If you entered only `autoupgrade.jar` in ALIS, place it in the selected Ansible working directory. The runner checks its build and SHA-256.

For `download=YES`, prepare the AutoUpgrade auto-login keystore interactively on the server as the Oracle owner, using the runbook's `-load_password` command. The runner requires `cwallet.sso`. For `download=NO`, prepare the complete media directory with companion metadata. TDE wallets have separate requirements. Keep passwords out of YAML and JSON.

Use dedicated working and global log directories for every patch cycle; these retain the state needed to resume. ALIS does not execute root scripts. Arrange any required scripts or execution mechanism using the runbook and actual AutoUpgrade messages. Plan the maintenance window, backup and application checks.

## 5. Run each stage on the laboratory server

```sh
ansible-playbook prepare.yml
ansible-playbook analyze.yml
```

`prepare` stages the files and checks the JAR, database identity, topology, media directory and online-download auto-login wallet. It does not deploy patches. **Analyze is the first database phase.** Wait for successful analysis, read the fetched results under `artifacts/oracle_db/` and AutoUpgrade's server-side reports, and resolve errors/manual prerequisites. A zero Java exit code alone does not certify readiness. Only after this review and confirmation of the backup/maintenance plan, run:

```sh
ansible-playbook deploy.yml
ansible-playbook verify.yml
```

Deploy requires a successful analysis from this exact bundle. Missing or failed analysis blocks deploy, including attempts to bypass it with resume. The playbooks invoke native AutoUpgrade deploy after analysis; do not additionally run the manual download/create_home/deploy commands in `alis-runbook.md` as another cycle. Success requires fresh AutoUpgrade status/progress, successful required stages, the active target home via Linux `/proc`, target inventory and successful latest SQL-patch APPLY rows in all containers. Closed PDBs prevent complete verification. If AutoUpgrade completed but final verification failed, fix the cause and run verify.yml; patching is not repeated. Unfinished or failed database checks block readiness; inspect the per-container report. Review application/service checks separately.

Scope: one existing Linux single-instance database, no Data Guard, OUTOFPLACE patching. Both export validation and runtime database checks reject incompatible topologies. RAC, SEHA, RAC One Node and Data Guard require separate coordination. No real Oracle patch deployment was performed when validating this exporter.

## Resume and repeat

Each task has the configured async timeout; expiry interrupts the operation. Choose a sufficient runtime. If the controller disconnects, check whether the server process is still running before resubmitting. The runner locks both the bundle and log directory against concurrent ALIS processes.

After inspecting/fixing a failed operation, preserve the original bundle, JAR, configuration and recovery/log state:

```sh
ansible-playbook deploy.yml -e alis_resume=true
```

26.6 receives `-resume`; 26.5 reuses the same command and native recovery state. Immutable staged-file checks reject changed bundles. A completed deploy is verified and skipped instead of patched again. Use a new bundle and new directories for the next patch cycle. Do not clear recovery data to handle routine failures.

`--check` cannot simulate Oracle and is rejected. Use `test-local.yml` for simulation and `analyze.yml` for actual readiness checks.

Sources: [Ansible installation](https://docs.ansible.com/projects/ansible/latest/installation_guide/intro_installation.html), [async tasks](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_async.html), [AutoUpgrade CLI](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-command-line-parameters.html).
