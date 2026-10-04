# ALIS

**AutoUpgrade Looks Insanely Simple · by ORA-600**

[Open ALIS](https://ora600pl.github.io/alis/) · [Offline edition](https://ora600pl.github.io/alis/offline.html) · [Workflow map](docs/WORKFLOWS.md)

Build an Oracle AutoUpgrade configuration **and the instructions for using it**. ALIS is a static browser application: no backend, account, analytics, external fonts, runtime packages or installation. Your configuration remains in browser memory; imports are read locally. Passwords are entered in AutoUpgrade on your server, never in the wizard.

## Choose an outcome

- Install a fresh Oracle home on an empty server, without a source home or SID.
- Prepare a home using an existing installation's settings.
- Download database patches, numbered GI patches and tools, including media for other platforms.
- Build a reusable Gold Image or install your own local image.
- Upgrade a database or selected PDBs already in the target CDB.
- Convert a non-CDB, unplug/plug PDBs, or clone a PDB/non-CDB once or with periodic refresh.
- Patch existing databases, with RAC, Data Guard and operating-system planning guidance.

Each of the **12 workflows** has a complete, editable example. The wizard includes a searchable reference for **132 distinct parameter names** (83 upgrade and 89 patch declarations), patch-expression controls, installation groups/binary options, global/local inheritance, PDB mappings and stage-specific hooks. Unsupported or unverified declarations are identified explicitly.

## Use the wizard

1. In **Plan**, choose the workflow and execution mode. Use **Load example for this workflow** to start from an editable example.
2. Enter the home/database settings, media, migration mappings and execution environment.
3. Review recovery settings and additional options.
4. In **Runbook**, resolve errors and review the operational notes. Download the configuration and Markdown runbook, copy individual commands or use the print/PDF view.
5. For cloning, also download the separate source configuration for analyze/fixups. The actual source Oracle home can differ from the placeholder used on the target host. One-time clones run source fixups before copying; periodic clones have a separate final-refresh and `proceed -job` step.

## What you get

1. An AutoUpgrade `.cfg`, with a live preview and static dependency checks.
2. An ordered runbook: executable checks, directories, MOS keystore dialogue, media download, home creation, requested root scripts and the selected database stages.
3. A separate source-side configuration for clone analyze/fixups, using the real source Oracle home.
4. POSIX or PowerShell commands, with interactive console steps distinguished from shell commands. Recovery commands remain in a separate toolbox.
5. A Markdown runbook containing the instructions and configuration files; a print/PDF layout; an editable ALIS JSON project.
6. An Ansible ZIP for one existing Linux single-instance OUTOFPLACE patch job, with inventory, original configuration, prepare/analyze/deploy/verify playbooks, evidence collection, explicit resume and a local simulator. Select Linux or Oracle Linux 9 and Single instance under Environment. Under Runbook → Automate with Ansible, enter the execution host, SSH user, Oracle software owner and working directory, then select Download Ansible bundle .zip. [Step-by-step guide](templates/ansible/README.md).

All documentation, generated runbooks and Ansible bundle instructions are in English. The selected 26.5 or 26.6 profile pins the JAR build and configuration. The Ansible runner checks fresh stage/check reports, the active Oracle home, binary inventory and SQL patch registry. Recovery state remains on the execution host; a completed patch cycle does not deploy again. Start with `ansible-playbook test-local.yml` to learn the workflow locally before preparing the JAR and auto-login keystore on a database host.

Import an existing `.cfg` to preserve comments, order and unknown settings, and review a line diff. Mode and workflow are inferred because they are not stored in a config file: verify both after import. Use **Save project** to retain planning context and execution preferences as well as configuration values. Closing the page otherwise loses the draft.

## Fresh-home example

Select **Install a fresh Oracle Home** → enter target home, edition, Oracle base and inventory → choose media and download behavior → review **Runbook**. No SID or source home is required.

```properties
global.global_log_dir=/home/oracle/autoupgrade/logs
global.keystore=/home/oracle/autoupgrade/keystore
install1.folder=/home/oracle/autoupgrade/patches
install1.target_home=/u01/app/oracle/product/dbhome_1
install1.home_settings.oracle_base=/u01/app/oracle
install1.home_settings.edition=EE
install1.home_settings.inventory_location=/u01/app/oraInventory
install1.download=YES
install1.target_version=19
install1.patch=RU,OPATCH,OCW
```

The generated plan includes `-patch -load_password`, the MOS console dialogue, `-patch -mode download`, then `-patch -mode create_home`. Root scripts are conditional on the actual AutoUpgrade request. This installs software; it does not create a database. See the [workflow map](docs/WORKFLOWS.md) for offline media, image choices and cutover variants.

## Evidence and boundaries

Choose **AutoUpgrade 26.6.260925** (built 2026-09-25) or **26.5.260807** in Plan or the sidebar. The selection controls parameters, patch syntax, validation and the runbook; saved projects keep their profile. [26.6 changes and evidence](docs/AUTOUPGRADE-26.6.md).

26.6 adds download choices for CPAT, DBSAT, Exadata, Enterprise Manager and GI images, 21c CSPU support, RAC startup timing, SEHA/RAC One Node guidance, clone PATH_PREFIX handling and explicit resume commands. Removed or unavailable parameters block export when changing profiles. The investigation combined manifest/help/templates, parameter registries, selected validators and execution consumers, CFR decompilation, Oracle documentation, and articles by Mike Dietrich, Daniel Overby Hansen and Rodrigo Jorge. [Profile evidence and update procedure](docs/PROFILE.md).

The implementation has **242 Node tests, 31 Python tests, 200 real-JAR contract comparisons and 38 parser read-backs across both builds**, plus actual Ansible playbook runs against a local simulator. [Validation record](docs/VALIDATION.md).

A green status means that ALIS's implemented static checks pass. It does not verify MOS entitlements, patch availability/conflicts, installer prerequisites, actual database compatibility, RAC/Data Guard state, TDE or recovery. No Oracle deployment was performed to validate this release. All declared public parameters are cataloged; not every environment-dependent combination has been executed. Unknown imported options retain a warning; malformed, duplicate and explicitly unsupported settings block `.cfg` export.

The page does not store projects in browser storage. Ordinary page requests still reach the hosting provider; see [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).

## Develop and maintain

Python 3.9+ builds the profiles/offline HTML using only the standard library. Node.js 24 runs built-in tests. Neither is required by visitors. No npm or pip installation is needed.

```sh
python3 -S tools/build.py
python3 -m http.server 8000 --bind 127.0.0.1 --directory site
node --test tests/*.test.cjs
python3 -S -m unittest discover -s tests -p '*_test.py'
node --check site/assets/app.js
node --check site/assets/core.js
node --check site/assets/workflows.js
node --check site/assets/ansible.js
```

Optional actual Ansible integration checks (isolated simulator; no Oracle/SSH/MOS): install `ansible-core>=2.21,<2.22` in a temporary virtual environment and run `python3 tools/test_ansible.py`. CI runs the same five syntax checks and three success/failure scenarios. `templates/ansible/` holds the package source; `tools/build.py` embeds it into `site/assets/ansible-templates.js` and the offline edition.

Optional parser comparison (requires a separately obtained Oracle JAR and a JDK):

```sh
python3 -S tools/verify_parser.py /path/to/autoupgrade.jar
```

`profiles/` holds reviewed metadata; `site/assets/core.js` handles configuration and validation; `workflows.js` builds runbooks; `app.js` renders the UI. `site/assets/profiles.js` and `site/offline.html` are generated and tracked. CI tests and verifies reproducibility before publishing `site/` through GitHub Pages Actions. New JAR builds need a reviewed profile and regression cases, not an automatic replacement of option names.

Independent community tooling, not affiliated with or endorsed by Oracle. Oracle binaries and decompiled Oracle code are not distributed here. MIT covers ALIS's original code and documentation.

## Dependent choices

Controls and patch buttons disable choices incompatible with the selected workflow, profile, release, platform or existing settings, with explanations. Imported settings remain visible and removable; conflicts block configuration export. [Dependency audit and Gold Image diagnostics](docs/DEPENDENCIES.md).
