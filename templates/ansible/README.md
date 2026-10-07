# ALIS Ansible bundle

One Linux single-instance database: out-of-place patching or whole-database upgrade. Review `inventory.yml`, `host_vars/oracle_db.yml` and the configurations in `files/`. Migration, non-CDB-to-PDB conversion, selected PDBs, RAC and Data Guard require separate automation.

## Install and test without Oracle

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install 'ansible-core>=2.21,<2.22'
ansible-playbook test-local.yml --syntax-check
ansible-playbook test-local.yml
```

Expect `failed=0`, `unreachable=0`. Fake tools run locally; no SSH, Oracle or MOS connection is made. On macOS, a locale error is resolved for this terminal with `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.

## Run

Prepare SSH, server Python 3.9+, supported Java, installation prerequisites, backups and required root-script execution. Use separate source/target homes and dedicated JAR, wallet, media, work and log paths for this cycle. Keep the bundle's `ansible.cfg` enabled and run from its directory.

```sh
ansible-playbook __ALIS_OPERATION__.yml
```

Add `-K` if sudo requires a password. The remote sequence is **analyze → download / verify media → create_home → maintenance-window approval → deploy → verify**. Type **YES** only after reviewing analysis, the prepared target home and backups. Already installed target homes skip software preparation. Pin an RU in the patch expression, not the home directory name.

## Workstation downloads and VPN

In ALIS **Media**, choose **On this workstation (Ansible controller)** and explicitly select the **target architecture**. Install Java locally. The command above first downloads the pinned JAR, opens the native MOS wallet loader (save **YES**, auto-login **SHARED**) and downloads target-release media. It then pauses so you can connect VPN and approve transfer of the JAR, AutoUpgrade wallet and complete media/metadata. Server phases use `download=NO`. Database TDE wallets are separate.

To split the network stages:

```sh
ansible-playbook local.yml
# Connect VPN when ready.
ansible-playbook transfer.yml
ansible-playbook remote.yml
```

Files remain in `controller/`; a completed local stage can be verified offline. Transfer preserves existing files and refuses mismatches. For a different local Java use `-e alis_controller_java=/path/to/java`. If Oracle serves a different JAR than the selected profile, supply that exact build in `controller/autoupgrade.jar` or export with the matching reviewed profile. For **server downloads**, prepare the pinned JAR and auto-login wallet on the server yourself.

On macOS, the JAR downloader uses `/usr/bin/curl` with certificate verification and the system trust store. Other controllers use Python's CA trust. An explicit `SSL_CERT_FILE` or `SSL_CERT_DIR` selects Python's configured trust on any platform. For a private CA, set `SSL_CERT_FILE=/absolute/path/trusted-ca.pem` before running Ansible. Never disable TLS verification. The downloaded JAR must also match the profile's SHA-256.

## Results and resume

Read `artifacts/oracle_db/` and the native logs. `[ALIS]` updates report remote progress. Completion checks native reports, target inventory and SQL patch registries in every container, including `PDB$SEED`; upgrade also checks container/component preservation. Java exit code zero alone is insufficient. Complete application/service checks separately.

After resolving a native failure, keep the original bundle, JAR, configuration and recovery state, then run `ansible-playbook __ALIS_OPERATION__.yml -e alis_resume=true`. Completed phases are skipped. If native deploy completed and only verification failed, fix the cause and run `verify.yml`; deploy is not repeated. For a preapproved unattended run, `-e alis_approve_transfer=true` approves transfer and `ansible-playbook __ALIS_OPERATION__.yml -e alis_approve_deploy=true` separately approves database changes. Interactive approvals are not remembered. Wallet setup remains interactive.

Separate stage playbooks are included. `--check` cannot simulate Oracle; use `test-local.yml`. Detailed manual commands, configuration roles and sources: `alis-runbook.md`. Validated with ansible-core 2.21.4, isolated JAR probes and fake tools; no live Oracle deployment was performed.
