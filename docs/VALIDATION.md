# Workbench validation

Dates: 2026-09-12–13. Profile: AutoUpgrade **26.5.260807**.

## Automated checks

**127 Node.js built-in tests passed.** These include the original 55 regression tests plus workflow examples, mode/stage gating, empty-server installation, offline media, Gold Image conflicts/placeholders, patch expression grammar, pinned version boundaries, MRP/OL9 restrictions, major-release patch rejection, source-side artifacts, one-time versus periodic clone ordering, staged remote upgrade, topology guidance, project round trips and POSIX/PowerShell quoting.

The user's ten-assignment fresh-home example is an explicit regression case: no SID or source home is introduced; import preserves the exact values; the runbook contains wallet, download and create_home steps, without database analyze/deploy/fixups.

**7 Python standard-library tests passed:** deterministic build, all four embedded offline scripts, CSP hashes, script order, asset resolution, profile hygiene and absence of application network APIs/browser persistence. All three application JavaScript source files passed `node --check`; `git diff --check` passed.

Local tools: Node.js 24.18.0, Python 3.12.5 and OpenJDK 17.0.20.1 on macOS ARM64. CI reruns the Node/Python checks on Linux and verifies the generated assets before Pages deployment.

## Supplied-JAR comparison

**14 generated configurations** were passed to the supplied JAR's isolated file parser: the 12 workflow examples and two additional source analyze/fixups configurations. Every assignment was read back with the same key and value. Reproduce with:

```sh
python3 -S tools/verify_parser.py /path/to/autoupgrade.jar
```

The script compiles an original Java harness in a temporary directory, calls `FileParser.newByteInstance`, and compares its output with generated expectations. It never invokes the AutoUpgrade launcher. The Oracle JAR is not distributed or fetched by CI. The earlier investigation also included 18 lexical parser probes and five initial-release generated-file comparisons; those are separate evidence, not additional v2 workflow tests. See [profile methodology](PROFILE.md).

This verifies file parsing, not the complete semantic pipeline, Oracle service availability or database execution.

## Browser checks

The workbench was exercised in the Codex in-app browser against the local HTTP site:

- Recreated the requested fresh-home configuration through the form, without SID/source_home; inspected the generated MOS/download/create_home sequence.
- Loaded the Gold Image example, verified its multi-placeholder filename and generated capture step.
- Inspected the Markdown copy fallback, copied its selected text using the keyboard, and confirmed that all 6,854 characters matched the browser clipboard. It included the configuration, loader dialogue and home commands. The automatic Clipboard API attempt fell back to the selectable-text dialog in this browser.
- Searched the field guide for the inventory parameter and verified its scope, help and precedence explanation.
- Selected a remote clone source: export was blocked until the actual source Oracle home was provided, then enabled. Verified both configuration artifacts and the source analyze → target deploy → source fixups → proceed sequence.
- Selected PowerShell and inspected generated quoting/command prefixes. The final engine test separately verifies that Windows credential preparation follows OS context rather than merely the shell preference.
- Desktop layout at 1280 × 800 and mobile layout at 390 × 844. Inspected form/guide screenshots; document width remained 390 pixels at the mobile size. Navigation and desktop configuration preview remain available while scrolling.

The initial release also exercised import/comment preservation, line diff, COMPATIBLE/GRP error gating, PDB mappings, clipboard configuration export and the optional read-only WebMCP surface. These older checks are not presented as a complete v2 browser regression run.

### Browser limitations

The initial in-app Blob-download attempt did not report completion, so browser-written `.cfg`/Markdown downloads were not independently verified on disk. Generated content and clipboard output were checked. Direct `file://` execution of the offline edition was blocked by the browser URL policy; its four embedded scripts and CSP hashes were checked statically, without bypassing that policy. Print styles exist, but PDF output was not rendered and inspected.

## Environmental boundary

No database connection, AutoUpgrade analyze/fixups/deploy, patch download or Oracle home installation was performed. Topology, upgrade feasibility, privileges, filesystem state, patch conflict resolution, TDE, RAC, Data Guard and recovery remain server-side checks. An ALIS static pass is not evidence of successful execution on an Oracle host.

## AutoUpgrade 26.6 (2026-10-01)

See [release evidence](AUTOUPGRADE-26.6.md) for 176 Node tests, 7 Python/build tests, 200 real-JAR contract comparisons and 36 parser read-backs across 26.5 and 26.6. Browser flows verify version switching, new media controls and incompatible export blocking. Oracle execution and ARU/MOS authentication/downloads remain untested.

## Dependency controls — 2026-10-01

200 Node tests (24 new dependency/runbook regressions), 9 Python build tests, 200 isolated 26.6 JAR comparisons and 36 parser readbacks across both builds passed. Browser checks covered disabled local-image patch/image controls, dynamic NO/AUTO security-level gating, download-only capture gating, invalid/valid advanced settings and importing/removing a conflicting capture request. The online and standalone offline builds produced no console warnings/errors in these checks.

The supplied input-image + output-image configuration remains accepted: static CFR and independent javap inspection show CREATE_GOLD_IMAGE after installation. PATCH101 needs the captured installer output to diagnose its server-side cause. See [dependency audit](DEPENDENCIES.md). No Oracle installation or MOS/ARU request was performed.

## Ansible export and upgrade target-home media — 2026-10-04

**242 Node tests and 31 Python tests passed** (22 runner tests and 9 build tests). The export tests cover both reviewed profiles, unchanged configuration text, pinned JAR/configuration hashes, scope blocking, literal YAML values, project round trips and ZIP interoperability/CRC/UTF-8. Runner tests cover interruption and explicit resume for both builds, mutual exclusion, immutable cycle files, stale/mismatched/incomplete reports, a native zero exit code with failed stages or checks, failed/missing SQL patches, runtime RAC/Data Guard rejection, wallet prerequisites and repeated deployment. A closed-PDB failure can be repaired and verified without deploying again. The Gold Image upgrade regression tests cover integrated target-home installation with both profiles.

Actual **ansible-core 2.21.4** and **2.19.13** executed the exported `test-local.yml` on macOS with Python 3.12. Five playbooks passed `--syntax-check`. Each Ansible version completed the local prepare → analyze → deploy → verify → repeated deploy cycle with `unreachable=0`, `failed=0`; the last deploy was skipped. Separate native-stage and SQL-patch faults produced the expected Ansible failure and fetched this run's error JSON/logs. These runs use fake Java, SQLPlus and OPatch in a fresh local temporary directory, never SSH or a database. Reproduce the same integration checks with:

```sh
python3 -m pip install 'ansible-core>=2.21,<2.22'
python3 tools/test_ansible.py
```

CI runs this Ansible integration in addition to Node/Python checks and verifies the regenerated online/offline assets. The offline edition now contains six scripts, with deterministic CSP hashes and no application network calls.

The runner's `status.json`/`progress.json` contract was inspected in the supplied 26.5 and 26.6 JARs: job identity, mode, homes, stage result/error lists, percentage completion and per-container check results. The relevant reporting classes match across those two builds. This is static evidence for those exact builds, not a captured live patch. The integrated upgrade Gold Image configuration passed isolated JAR parser readback: **23 cases for 26.6 and 15 for 26.5**, plus **200 26.6 contract comparisons**.

Browser checks exercised the patch export panel, environment/host blockers, enabling export and generation of the ZIP, plus integrated Upgrade Gold Image input on the online/offline editions. No console warnings/errors were reported. ZIP bytes were independently opened and checked with Python `zipfile`; the in-app browser did not provide a completed Blob download on disk. See the [step-by-step Ansible guide](../templates/ansible/README.md).

**No real Oracle patch, database connection, MOS request, root script or Oracle-home installation was executed.** The first export supports one Linux single-instance OUTOFPLACE cycle. Successful simulation and static validation do not establish production patch compatibility or application availability.

## Analyze before database changes — 2026-10-04

**248 Node tests and 32 Python tests passed**. Runbook regressions cover both reviewed profiles: the supplied integrated-home configuration starts with analyze, review, source fixups, review and explicit upgrade; ordinary deploy starts with separate analysis; patch analysis precedes media/home preparation; remote transport follows separate analysis and fixups gates. Configuration text remains unchanged. Every fresh database mode starts with analyze, while software-only and postfixups continuation paths retain their distinct semantics. Clone cutover timing remains covered.

The processing-mode corrections were checked against [Mike Dietrich's analyze/deploy recommendation](https://mikedietrichde.com/2019/07/12/autoupgrade-analyze-fixups-upgrade-and-deploy-modes/) and [current Oracle processing-mode documentation](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/about-autoupgrade-processing-modes.html). Static inspection of the supplied 26.6 JAR's `SourceTargetEvaluation`, `DispatcherChooser`, `NormalDeploy`, `Upgrade`, `PatchAnalyze` and `PatchDeploy` confirmed the distinction between source-home/full deployment and target-side upgrade, and the native stage definitions. This is build-specific static evidence, not a database execution.

Actual **ansible-core 2.21.4** passed five syntax checks and four simulator runs: success, failed analyze checks, failed native stage and failed SQL-patch verification. The analysis-failure run returned Ansible rc=2 with failed=1, fetched fresh analysis error/status evidence and logged only one native database command: analyze. Deploy was never invoked. Runner regressions also verify that missing or failed analysis cannot be bypassed by deploy/resume for either reviewed profile. The runtime gate already existed; the bundled runbook and English instructions now describe it explicitly.

Browser verification on the local online edition selected explicit upgrade and confirmed that the preview still shows FIRST DATABASE CHECK / analyze, followed in the runbook by analysis review, source fixups review and upgrade. No live Oracle analyze, fixups, upgrade or patch operation was performed.

## Import context and Ansible discoverability — 2026-10-04

**254 Node tests and 32 Python tests passed.** New regressions cover database `.cfg` imports starting in analyze under both operation choices, preserving explicit upgrade-only settings as visible patch conflicts, and saved JSON retaining postfixups continuation. The explicitly reviewed conversion to patch preserves source/target homes, Gold Image and timezone settings. A versioned `RECOMMENDED:19.32` now populates the Ansible plan's pinned RU, as a versioned `RU` already did, so final target-inventory verification checks the requested level for both profiles. Unversioned RECOMMENDED remains unpinned.

Browser verification imported the supplied `.cfg` through the actual file-input flow in the in-app browser. Runbook displayed `upgrade / analyze` and the Ansible section explained its disabled export. Selecting postfixups displayed the continuation explanation and omitted fresh database analysis. Importing a corrected saved patch project retained `patch / deploy`, showed separate analyze/review before download/create_home/deploy, and displayed the full Ansible fields with environment/host blockers. Selecting Linux and Single instance and entering a test-only host enabled download; clearing the host disabled it again. The prepared project does not invent the user's OS, topology or host.

Read-only inspection of the user's existing Safari draft confirmed that the published page already contained the analyze/review steps after selecting upgrade. The original screenshot selected postfixups, which intentionally continues an earlier upgrade. The original Safari draft was preserved. Automated native Safari file selection did not complete; `.cfg` and JSON import results above were verified in the in-app browser. No native file-picker change is included in this patch.

Actual **ansible-core 2.21.4** again passed five playbook syntax checks and four simulator scenarios: success, analysis-check failure, native-stage failure and SQL-patch failure. The failure runs produced the expected error evidence and the successful run ended with `unreachable=0`, `failed=0`. These checks used localhost and fake tools; no Oracle, MOS, SSH or root operations were executed. [Oracle's patching documentation](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-patching.html) and the inspected 26.6 `PatchDeploy` installation stages confirm that native out-of-place patch deploy creates the target home; the upgrade-only `create_oracle_home` switch is not needed for that workflow.

## Controller locale troubleshooting — 2026-10-04

The user's installed **ansible-core 2.21.4** on macOS passed `test-local.yml --syntax-check` against their extracted bundle with command-local `LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8`. An intentionally unavailable LC_ALL value reproduced the reported initialization error before playbook processing. Inspection of the installed Ansible CLI confirms that `locale.setlocale(LC_ALL, '')` runs at startup and requires UTF-8. The English bundled guide now documents the command-local override, the current-session equivalent and diagnostics for available locale names. No shell startup file, Terminal preference or Oracle-server setting was changed; this verification checked syntax without executing playbook tasks.

## Explicit patch phases and complete Ansible cycle — 2026-10-04

**255 Node tests and 44 Python tests passed.** The export now includes `download.yml`, `create_home.yml` and `patch.yml`. The complete playbook imports prepare, analyze, download, create_home, deploy and verify in that order. The bundle's runbook describes the full deploy sequence even when the wizard's selected initial mode is analyze. Configuration bytes remain unchanged; requested output Gold Image packaging uses a separate hash-pinned home-preparation configuration with packaging disabled, as the manual runbook already does.

Runner regressions cover missing/failed prerequisites, attempts to bypass gates with resume, online media checksums, offline staged ZIPs, changed media, unfinished/missing ROOTSH stages, missing target binaries, incorrect RU inventory, and a database unexpectedly switching homes during software preparation. Global resume skips successful phases, retries/resumes the failed phase and starts remaining phases normally. A completed cycle verifies the database without requiring media inputs again. The RU comparison accepts a full inventory version including its patch date while retaining the requested RU boundary. SHA-256 reads files in bounded chunks, including on Python 3.9.

The supplied **26.5.260807 and 26.6.260925** JARs were inspected with CFR/javap for `DownloadAndLocate`, `DownloadFiles`, `PatchUtilities.appendPatchInfoJson`, `PatchCreateNewHome`, and installation stage definitions. Native download exits during configuration processing, before normal job status/progress reporting; its gate therefore verifies fresh `patches_info.json`, file sizes when reported, and published SHA-256/SHA-1 checksums. It does not reuse an earlier analyze job's success. Create-home verification requires INSTALL, OH_PATCHING, OPTIONS and ROOTSH, plus PRECHECKS for 26.6, complete native reports, target binaries/inventory and the source database still active in its original home. With download=YES, native configuration validation can fetch/check media in analyze and deploy as well; the runbook explicitly states this. These are build-specific static contracts, not live Oracle execution evidence.

The separate preparation/deployment modes were checked against [Oracle's patching documentation](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-patching.html) and [Mike Dietrich's download examples](https://mikedietrichde.com/2026/07/09/autoupgrade-patching-from-zero-to-hero-part-4-download-examples/). Unattended root execution still needs AutoUpgrade's supported existing execution mechanism; Ansible does not create a privileged script runner.

Browser verification on the local online edition selected a synthetic patch example, Linux and Single instance, confirmed the complete-cycle instructions, entered a test-only host and generated the ZIP without console warnings/errors. The user's existing Safari draft and extracted Downloads bundle were preserved. A separate updated ZIP retained the original configuration, inventory and host variables; all eight of its playbooks passed syntax checks. The English bundled README was shortened from 125 to 65 lines and centers on installation, local simulation, server prerequisites, the one-command cycle, results and resume.

Actual **ansible-core 2.21.4** passed eight playbook syntax checks and eight independent simulator scenarios: success, failed analysis checks, missing downloads, checksum mismatch, unfinished root scripts, failed native stage, failed SQL patches and interruption. The successful global run logged exactly analyze → download → create_home → deploy. Every fault stopped subsequent phases and fetched current error evidence. Two further actual `patch.yml` invocations resumed the interrupted deploy, then repeated the completed cycle; neither repeated successful preparation phases, and the latter issued no native operation. The local test imports the same global playbook with an explicit localhost selector and local connection, even though the fixture inventory contains an unrelated host. All successful simulation/resume recaps had unreachable=0 and failed=0; expected faults had failed=1. No real Oracle connection, MOS download, home installation or root script was performed.

## Ordered stage selection and imported Ansible settings — 2026-10-05

The patch selector shows numbered analyze → download → create_home → deploy stages, with optional source fixups separate from the main path. Upgrade selectors distinguish analyze/deploy from optional source fixups and the split upgrade/postfixups path. Resident-PDB choices start with analyze. Browser checks confirmed stage selection and wrapping at the in-app browser's narrow viewport.

Ansible exports adapt the two recognized upgrade settings in a copy of the project: create_oracle_home is replaced by the explicit native patch create_home stage; drop_grp_after_upgrade maps to the local drop_grp_after_patching policy. The browser draft remains unchanged. Converted bundles include original-autoupgrade.cfg and config-adjustments.md, which are not staged on the server. The panel displays the adjustments and enables the ZIP when other requirements are met. Both YES and NO values, inline comments, global inheritance/local overrides, equivalent duplicate spellings, conflicting policies, invalid booleans and duplicate imported assignments are covered for both reviewed profiles. Unknown operation conflicts continue to block export.

**263 Node tests and 44 Python tests passed.** Both supplied JAR parsers read back the adapted patch configuration correctly: **16 comparisons for 26.5 and 24 for 26.6**, 40 total. All eight converted-bundle playbooks passed Ansible syntax checks. Browser verification imported a synthetic .cfg containing both legacy parameters, selected Linux and Single instance, entered a test-only host, confirmed an enabled download and successful generation with no console warnings/errors. The exported native patch configuration, home configuration, hashes and bundled runbook agree; the original input is retained byte-for-byte. This validates static export and parsing, not a live Oracle patch cycle.

## Native patch reports and analyze verification repair — 2026-10-05

A completed native **26.6.260925** analyze exposed two incorrect runner assumptions. AutoUpgrade writes status/progress to `global_log_dir/cfgtoollogs/patch/auto/status/`, as specified in [Oracle's patching documentation](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-patching.html); the runner and simulator had both used `global_log_dir/status/`. In addition, progress `checksFailed` includes INFO, RECOMMEND and WARNING findings, not just ERROR findings. The inspected native `StatusManager` reads each job's `prechecks`/`postchecks` `<dbname>_checklist.json` to distinguish severity. The report paths and checklist fields were checked in both supplied JARs with CFR/javap.

The corrected runner reads fresh native status, progress and per-job checklists. It matches SID, job number, mode, homes, report directory, required stages, container names and check names before accepting completion. Every ERROR finding still blocks, including those with automatic fixups available; execution errors, incomplete checks, unknown severity, missing checklists and stale evidence also block. Non-error findings remain in fetched evidence for review. The simulator now reproduces the native paths and severity reports rather than repeating the runner's incorrect assumptions.

The diagnostic `recheck-analyze` action verifies an existing failed analysis without launching another analyze. It requires evidence that the original command completed, accepts the known legacy report-path failure, rejects later cycle phases and restricts report modification times to the recorded execution interval with one-second filesystem tolerance. It retains the original plan/configuration/JAR identity and uses the existing cycle locks. After validation, it records the repaired analysis state and evidence; it does not start download, home creation or deployment.

The matching repair was applied with SHA-256 guards and backups to the user's extracted controller files and remote runner. Native reports for the existing job were then verified successfully: one completed analyze job, three containers, all **133 checks completed**, **14 INFO, 10 RECOMMEND, 11 WARNING, zero ERROR**. The active state now contains only a verified analyze phase. Analysis was not rerun, and the plan, configurations, JAR and native recovery data were preserved. This is live report-validation evidence; no new home installation, root execution or database patch deployment was performed during this repair.

**263 Node tests and 52 Python tests passed.** Added regressions cover both reviewed profiles, non-error findings, fixable ERROR findings, check execution errors, absent/stale checklists, unexplained findings, unknown severity and recovery from the known report-path failure without another native command. Rechecks reject reports from before or after the failed execution, changed cycle identity, unsuccessful commands and later phases.

Actual **ansible-core 2.21.4** passed eight syntax checks, nine localhost simulator scenarios, global resume and a repeated completed cycle. Both a clean run and a run with INFO/RECOMMEND/WARNING findings completed all phases with `unreachable=0`, `failed=0`. Every injected failure stopped subsequent phases and fetched its evidence. These full-cycle tests use fake tools; they do not establish successful native download, home creation or database deployment.
