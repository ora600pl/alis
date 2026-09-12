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

No database connection, AutoUpgrade analyze/fixups/deploy, patch download or Oracle home installation was performed. Topology, upgrade feasibility, privileges, filesystem state, patch conflict resolution, TDE, RAC, Data Guard and recovery remain server-side checks. An AUGUR static pass is not evidence of successful execution on an Oracle host.
