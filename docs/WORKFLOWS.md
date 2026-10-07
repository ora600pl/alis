# Workflow map and operating guide

Profile: **26.5.260807**. The table covers the user-facing workflow families identified in the inspected registries and dispatch paths. OS, release, media, topology and recovery choices are additional dimensions; this is not a claim that every cross-product is supported by Oracle or tested in a lab.

## Software preparation

| Wizard workflow | Execution | Inputs that distinguish it | Output and operational gate |
|---|---|---|---|
| Fresh Oracle Home | `-patch -mode create_home` | No SID/source home; target home, media folder, edition and Oracle base; inventory on a new POSIX server | Patched software installation; requested root scripts; no database creation |
| Home from existing settings | `-patch -mode create_home` | Source home supplies installation identity/groups/options; explicit overrides remain available | New home; source installation is consulted |
| Download patches/tools | `-patch -mode download` | Patch expression, release and platform; no database required | Staged media and generated metadata; no conflict/applicability proof |
| Build own Gold Image | `-patch -mode create_home` | `create_gold_image=YES` or a ZIP basename with supported placeholders | New home plus a reusable archive |
| Use own Gold Image | `-patch -mode create_home` | `patch=GOLDIMAGE:filename.zip`, local folder; no additional patch tokens | New home from an existing archive |

Online projects first load MOS credentials and download media. Offline projects use `download=NO` and the complete staged repository. A download-only project can fetch platform-specific files on a different host; installation still runs on the intended installation platform. A fresh server needs Java, the software owner, OS groups and prerequisites prepared before AutoUpgrade starts. These are OS-administration tasks; the wizard does not invent distribution-specific package commands. [Empty-server installation example](https://dohdatabase.com/2025/06/17/autoupgrade-new-features-install-oracle-home-on-brand-new-empty-server/).

On POSIX, an existing inventory pointer takes precedence over the supplied inventory location. Without it, configure the inventory directory/group and verify group membership. A source home can supply edition, groups and binary options. `home_settings.*` exposes the installer settings, including OSDBA-family groups, cluster nodes, binary features, read-only home and conflict policies. Installer/patch prerequisite bypasses receive an explicit review warning.

`create_listener` accepts `DEFAULT`, comma-separated `NAME:PORT` entries or a readable NetCA response-file path. It does not create a database. Run only the root scripts requested by AutoUpgrade, in its reported node/order sequence; use resolved paths from its root-script output when home placeholders are present.

## Image and patch selection

| Setting | Meaning in this build |
|---|---|
| `gold_image=AUTO/YES/ALL/NO` | Oracle-supplied image selection. AUTO can fall back; explicit service requests depend on supported platform/release, credentials and available image versions. |
| `gold_image.security_patch_level` | Security selection for Oracle Update Advisor images: CRITICAL, HIGH, MEDIUM or LOW. |
| `create_gold_image` | Package the home created by this operation. Filename placeholders: `%RELEASE%`, `%UPDATE%`, `%DATE%`, `%TIMESTAMP%`. |
| `patch=GOLDIMAGE:name.zip` | Consume a user's local archive. Exclusive: cannot also specify patches or create another Gold Image in the same job. |
| `target_home` placeholders | `%RELEASE%`, `%UPDATE%`, `%V1D%` through `%V5D%`; inspect the resolved path before using it elsewhere. |

The download path resolves Oracle image choices; `create_home` consumes the staged media. The generated online runbook makes that separation explicit. February 2026 image examples describe older requirements: the inspected 26.5 updater authenticates without requiring an explicit CSI. Image availability remains a service-side decision. [Original Gold Image example](https://www.dbarj.com.br/en/2026/02/downloading-and-using-gold-image-with-autoupgrade/), [26.4/26.5 changes](https://mikedietrichde.com/2026/08/13/new-autoupgrade-version-26-5-is-available-plus-26-4/), [custom image workflow](https://dohdatabase.com/2026/09/08/autoupgrade-new-features-create-and-use-your-own-gold-images/).

Registered patch tokens: `RECOMMENDED`, `TOOLS`, `RU`, `OJVM`, `OCW`, `OPATCH`, `DPBP`, `CSPU`, `JDK`, `MRP`, `AU`, `SQLCL`, `AHF`, `CVU`, `SDOBP`, `TEXT`, numeric patch IDs and the named `GOLDIMAGE` form. The reviewed grammar allows version suffixes for RECOMMENDED/RU/OJVM/OCW. A GI or combo patch is selected by numeric ID; GI installation/upgrading is not a wizard workflow. [Download use cases](https://mikedietrichde.com/2026/07/09/autoupgrade-patching-from-zero-to-hero-part-4-download-examples/).

The JAR expands TOOLS to AU, OPATCH, SQLCL, CVU and AHF. RECOMMENDED expands to a release/platform-dependent patch set. Pinning RU/OJVM does not pin every tool or one-off patch. Preserve the actual download inventory for reproducibility. The validator checks, among other things:

- Home creation and out-of-place patching need RU/RECOMMENDED or a user Gold Image.
- `target_version=26` maps to internal major 23; patch versions use service syntax such as `RU:23.26.3`.
- Separate OJVM is rejected for 21 and later. DPBP/MRP/CSPU are rejected for 21 in this build.
- MRP requires Linux x86-64; pinned RU must exceed 19.16 or be at least 23.26.
- A pinned OJVM cannot precede the RU or use a different major release.
- Oracle Linux 9 requires at least RU 19.22 for a pinned 19c request.
- `folder` and `download_folder` cannot point at different locations.

## Database operations

| Wizard workflow | Main stages | Additional configuration and gates |
|---|---|---|
| Database upgrade | analyze → review → deploy; optional separate fixups | Source SID/home and target release/home; optional `create_oracle_home=YES` with version and media directory |
| Selected resident PDB upgrade | successful source preparation → upgrade; postfixups continues an upgrade | PDBs already plugged into a target-version CDB and open in UPGRADE mode; retain source analysis/fixups reports |
| Non-CDB to PDB | source checks → deploy/conversion | Target CDB, target PDB name, copy decision; same-release conversion and release upgrade have different runtime paths |
| Unplug/plug | source checks → deploy | Selected PDBs, per-PDB target names and file-copy clauses; source preservation requires COPY |
| PDB clone/refresh | separate source checks → target clone → optional refresh/cutover | Per-PDB database links and optional intervals; source config artifact uses the actual source home |
| Non-CDB clone/refresh | separate source checks → target clone/conversion → optional cutover | Scalar source link, target CDB/name and copy option |
| Existing database patching | analyze → review → media/home preparation → deploy | Same major release, source SID/home, target home and patch repository; topology constraints |

### Analyze is the first database phase

For a fresh operation, ALIS generates a separate `analyze` command first, including when the selected mode is `upgrade`. The next step requires successful completion for every job and review of the native status and check reports. Resolve errors/manual prerequisites and rerun analysis before continuing. A Java exit code of zero is insufficient. Software-only download/create_home projects have no database analysis. `postfixups` is a continuation: confirm the earlier preparation and completed upgrade reports instead of analyzing an already upgraded source.

For an ordinary upgrade, use **analyze → review → deploy**. Deploy includes checks, pending fixups, the upgrade and applicable post-upgrade work. Separate fixups are optional; they change the source database, so verify a backup first. [Mike Dietrich's recommended order](https://mikedietrichde.com/2019/07/12/autoupgrade-analyze-fixups-upgrade-and-deploy-modes/).

`upgrade` is an advanced split path. Run source analysis and fixups before transport or manual plugging, review both results, then prepare the execution environment and run upgrade. Current Oracle documentation allows the database to run in the source or target home; source-home execution can select a deploy path. Target-side resident PDBs must already be plugged in and open in UPGRADE mode. That target-side path lacks the complete deploy backup/post-upgrade workflow. Use original source configurations and retained reports after a move; do not reapply source changes to an already transported database. [Oracle processing modes](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/about-autoupgrade-processing-modes.html). Mike's 2019 article explains the original target-only upgrade mode; the current Oracle reference and the selected JAR govern present behavior.

For an RU within the same major release, choose **Patch existing databases**, using `-patch`, rather than a database release upgrade. A home directory named `19.32` does not pin the requested RU: `RECOMMENDED` is resolved by the patch service. Verify the actual source release and pin the patch expression when a particular RU is required.

The mode is a command-line choice, separate from `.cfg` content. ALIS preserves imported configuration text and the selected mode; it adds preparation and review gates rather than silently selecting a different operation.

For staged remote upgrade, `target_is_remote=YES` does not move data. The deploy runbook separates source analyze/fixups, the administrator's backup/restore or transport procedure, and target upgrade. Recheck paths, environment and database startup on each host. [Oracle parameter reference](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/upgrade-parameters-autoupgrade-config-file.html).

The Ansible bundle uses **prepare → analyze → download → create_home → maintenance-window approval → deploy → verify**. Prepare stages files and checks prerequisites; analyze is the first database phase. The runner rejects deploy without verified analysis and a prepared target home for the exact immutable bundle. Workstation downloads add local staging and a separate VPN/transfer approval before the remote cycle; remote download then verifies the delivered media. See [controller downloads](CONTROLLER-DOWNLOADS.md). Use the playbooks for automation; the native commands in the bundled runbook describe the manual path and should not also be executed as a second patch cycle. [Ansible instructions](../templates/ansible/README.md).

## Clone timing and source preparation

`source_dblink=LINK` requests a one-time clone. `source_dblink=LINK 600` requests periodic refresh. The wizard generates a separate source `.cfg` for analyze/fixups. For a remote source, enter **Actual Oracle Home on the source host** in Environment; the target-side placeholder must not become the source execution path.

One-time clones receive source fixups before starting the clone. Periodic clones receive source checks, target deployment, source fixups at the maintenance window and an interactive `proceed -job JOB_ID` step. Set `start_time` deliberately: NOW can reach cutover immediately. Use actual IDs from `lsj`; for several jobs, switch only those ready for cutover. Mixed one-time/periodic jobs need coordinated write quiescence; separate projects often make that plan easier to manage.

Link users and links are provisioned on the databases using the documented privilege set and the operator's secret process. No SQL password is collected or placed in a browser artifact. Remote source closure, application service movement and standby verification are explicit manual gates. [Source preparation and cutover example](https://dohdatabase.com/2026/02/24/upgrade-oracle-database-19c-pdb-to-26ai-using-refreshable-clone-pdb/).

## Topology, credentials and recovery

RAC, Data Guard, TDE, execution OS and source location are independent planning dimensions. They affect runbook instructions; the planning fields are not invented AutoUpgrade parameters. Real parameters remain available in the form and searchable catalog.

RAC rolling choices are DISABLED/AUTO/REQUIRED/FORCE. REQUIRED/FORCE are rejected for Windows by the inspected patch validator. AUTO may fall back. Drain timeout accepts seconds or WAIT; verify service placement and client reconnect behavior. Physical-standby database patch work is restricted to analyze/deploy in this validator. Standby restore/apply and redo transport must be coordinated with the primary. [RAC rolling example](https://www.dbarj.com.br/en/2026/02/rac-rolling-mode-in-autoupgrade/).

For MOS, run the generated `-load_password` command and enter passwords at its prompts. The runbook lists `add -user`, optional `add -csi`, `list`, `save` and `exit`, plus the selected auto-login choice. TDE/OKV and Windows execution credentials have separate preparation instructions; a MOS credential does not satisfy them. [MOS credential walkthrough](https://mikedietrichde.com/2026/07/07/autoupgrade-patching-from-zero-to-hero-part-2-mos-credentials/).

Restore points, retained source homes, copied PDBs and backups provide different recovery options. COMPATIBLE changes and GRP deletion alter them. Resume, restore, datapatch rollback and clearing saved recovery data are separate toolbox operations, never automatic steps in the normal sequence.

## Dispatcher and CLI coverage

The inspected upgrade dispatcher exposes nine `WorkOption` identities: `normal`, `proactiveFixups`, `pdbUpgrade`, `noncdb2pdb`, `noncdb20`, `sameverpdb`, `unplugPlug`, `unplugRelocate` and `standbyDeploy`. The public cards combine these internal paths with operation, mode and environment rather than asking users to select an internal enum. Mode and runtime database facts determine the actual branch; a card cannot certify it.

The Field guide categorizes every public CLI family observed in the supplied help:

- Read/inspect: version, help, listchecks, error_code.
- Input/discovery: config, config_values, auto_config, create_sample_file.
- Execution: patch selector, mode, settings, noconsole, silent, debug.
- Credentials: load_password, load_win_credential.
- Diagnostics: zip, sid, d, zip_exclusion_list.
- Recovery: restore/jobs, rollback/jobs, restore_on_fail, clear_recovery_data.
- Expert/compatibility: regen_hash and preupgrade. `follower` is internal coordination.

The wizard generates the ordinary workflow, credential, diagnostic and recovery commands. Discovery, inline config, legacy preupgrade, internal settings and internal follower orchestration remain documented server/expert operations. [Oracle CLI reference](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-command-line-parameters.html).

For all parameter declarations, scopes, defaults and support status, use **Field guide → All parameters**. This includes the four patch declarations rejected by `NotYetSupported` and the two upgrade LDAP declarations absent from the active registry. See [the evidence boundaries](PROFILE.md) and [test results](VALIDATION.md).
