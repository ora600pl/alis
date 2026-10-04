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
