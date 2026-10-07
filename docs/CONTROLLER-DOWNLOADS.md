# Workstation downloads for isolated database servers

Choose **On this workstation (Ansible controller)** in Media when the Oracle server cannot reach Oracle download services. Select the server's target architecture explicitly; the controller can use a different platform. The Ansible export supports one Linux single-instance patch or whole-database upgrade. Installation prerequisites, supported Java, Python, SSH and any required root scripts remain server prerequisites.

Run `ansible-playbook patch.yml` or `ansible-playbook upgrade.yml`. The sequence is:

1. `local.yml`: confirm local preparation, fetch the reviewed profile JAR, open its interactive MOS wallet loader, save the wallet with auto-login **SHARED**, then download and verify target media.
2. `transfer.yml`: connect VPN, approve transfer, copy the JAR, all files in the AutoUpgrade keystore, all downloaded media and companion metadata. Verify every destination checksum. Existing different files are preserved and stop the run.
3. `remote.yml`: prepare → analyze → verify transferred media → create_home → maintenance-window approval → deploy → verify. Server configurations disable downloads. Target-home creation finishes before deployment approval.

The three playbooks can also be run separately. Local files remain in `controller/`; a completed local stage can be checked without Java or internet. Use dedicated media, keystore, JAR, log and Ansible work paths for each cycle. A changed local plan or files require investigation, not deleting state to force a resume. Use `alis_resume=true` for a failed native remote phase with its original bundle. Database TDE wallets are separate from the transferred AutoUpgrade/MOS keystore.

`alis_approve_transfer=true` preapproves the file transfer only. `alis_approve_deploy=true` separately preapproves database changes. Neither interactive approval persists into a later invocation. Local wallet setup remains interactive; passwords are never task arguments, facts or structured output. The bundled callback passes the invoking terminal device to the local action because ansible-core 2.21 isolates worker sessions. Keep the bundle's `ansible.cfg` enabled and run from a Terminal. Controller Java can be set with `alis_controller_java`.

The Oracle download URL serves the current JAR. ALIS verifies its SHA-256 against the selected reviewed profile before running it. If they differ, supply that exact JAR in `controller/autoupgrade.jar` or export with the matching reviewed profile. Media can contain a newer downloaded AutoUpgrade tool; it does not replace the pinned executable.

`patches_info.json` contains an absolute media path. Transfer creates a copy with the server's `patchFolder`; the original local metadata remains unchanged. Other companion files, including `aru-bug-map.json`, and nested files are retained. The transfer receipt is bound to the exact plan; the remote runner rechecks the transferred files before software use.

## Target release regression

The failing 19c → 26ai example downloaded an OUA Gold Image for 19.32 while selecting OPatch for release 23. The earlier home-preparation file retained `source_home` and was also used for download. In the reviewed JARs, `UpdateRequestBuilder.fromConfigBuilder()` builds the OUA request using the derived source version. `DeriveConfigValues.deriveSourceVersion()` retains an existing source version; with no source home it derives the version from the requested RU or target release. The separate download configuration now contains media parameters and the target release/platform only, without source SID or Oracle homes. Home creation retains source settings for installer inheritance.

An isolated probe against both pinned JARs (26.5.260807 and 26.6.260925) confirmed: target 26 plus source 19 requests OUA version 19; target 26 with source omitted requests version 23, the internal release for 26ai. Run the probe without an Oracle connection:

```sh
mkdir -p /tmp/alis-download-probe
javac -cp /path/to/autoupgrade.jar -d /tmp/alis-download-probe tools/DownloadTargetProbe.java
java -cp /tmp/alis-download-probe:/path/to/autoupgrade.jar oracle.patch.updater.DownloadTargetProbe
```

Download validation now rejects an image/RU for another major release, missing database media, a mismatched explicit platform, or an unmatched RU pin, in addition to checking published hashes and file sizes. Oracle ARU metadata may identify its 26ai Gold Image as `DATABASE RELEASE UPDATE`; this description is handled without relying on the filename.

Validation uses pinned-JAR parser/request probes, JavaScript/Python regression tests and real Ansible with fake Java/media and local copies. It does not prove a live MOS download, wallet portability under a customer's setup, installer operation or Oracle upgrade.

Sources: [Oracle platform parameter](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/patch-parameters-autoupgrade-config-file.html), [Mike Dietrich's workstation download examples](https://mikedietrichde.com/2026/07/09/autoupgrade-patching-from-zero-to-hero-part-4-download-examples/), [MOS wallet and SHARED auto-login](https://mikedietrichde.com/2026/07/07/autoupgrade-patching-from-zero-to-hero-part-2-mos-credentials/). Build-specific request behavior above comes from the local JAR probe, not the documentation.
