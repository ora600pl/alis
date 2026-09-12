# AutoUpgrade profile methodology

Initial profile: **26.5.260807**, build 2026-08-07, inspected 2026-09-12.

JAR SHA-256: `b02dfaa76767abcacd4fb61ea807129811c4a86070453bd7f390c8f0386ef512`.

## Evidence

The supplied JAR was examined using its manifest, `-version`, upgrade/patch help, six sample configuration types, and selected classes decompiled using CFR 0.152. Eighteen isolated file-parser probes were run on macOS ARM64 with OpenJDK 17.0.20.1. No database connection, analyze, fixup, deployment, patch download or home creation was performed in that analysis.

Declarations: 37 common, 46 upgrade-specific and 52 patch-specific, representing 132 distinct names. Three names have separate declarations in the upgrade and patch classes. The web profiles contain inherited common parameters: 83 for upgrade and 89 for patch. The upgrade registry contains 81 of those 83; both LDAP directory parameters are marked unverified. Four patch declarations are routed to `NotYetSupported` and cannot be configured through the guided catalog.

| Mechanism | Inspected source symbol |
|---|---|
| Scope, inheritance and mode-dependent required values | `ConfigParameter`, `getOptionalPredicate`, `isRequired`, `getValue` |
| Lexical filtering, duplicates, exclusions | `FileFilter`, `FileParser`, `SmartProperties` |
| Active registries | `UpgradeSettingsGear.getAllParams`, `PatchSettingsGear.getAllParams` |
| Unsupported options / fixed enums | `PatchConfigParameters.validationMap`, `NotYetSupported`, `FixedEnumValidation` |
| COMPATIBLE version and restore-point relationship | `UpgradeConfigValidator.validateRaiseCompatibleVersion`, `FullUpgCreator` |
| Runtime-derived restoration and timezone behavior | `FullUpgCreator` |
| Per-PDB settings and migration collisions | `UpgradeSemanticParser`, `UserConfigRuleValidator`, `UnplugPlugger` |
| Patch media folder | `ValidateConfigParameters.resolvePatchDownloadFolder` |

The profile's `default` is a declaration default, not necessarily the effective value of a running job. A null value means there is no literal default represented in the profile. Restoration, timezone and other values can be modified or derived later. `status=available` means registered, not that every combination is supported. The UI's general advanced descriptions deliberately do not invent semantics for less-studied options.

## Known limits

- The generator emits a conservative syntax subset. It is not a complete implementation of Oracle's `FileFilter` plus Java Properties behavior.
- Quoted paths, empty values, non-ASCII values and selected special characters are blocked because they may be ignored, changed or rejected by the JAR.
- Unknown parameters are preserved, with warnings. Recognized parameters belonging to the other operation are flagged as errors even though a particular JAR path might ignore some of them.
- Remote relocation, RAC, Data Guard, TDE and complete upgrade-path feasibility require additional environmental validation. The advanced catalog does not replace it.
- PDB preservation checks cover the inspected unplug/plug COPY relationship; recovery requires its own plan.
- Generated command examples use POSIX quoting, not Windows CMD/PowerShell quoting.
- Sample-template defects must not become generator rules: the inspected full template includes a copy-clause example under the wrong key and a `drop_after_upgrade_pfile` spelling absent from the inspected registry. The canonical catalog uses `del_after_upgrade_pfile`.

## Updating a profile

1. Obtain the new AutoUpgrade JAR from Oracle through your normal process. Do not commit the binary or private environment data.
2. Read its identity without executing it:

   ```sh
   python3 -S tools/inspect_jar.py /path/to/autoupgrade.jar --output review-candidate.json
   ```

3. Inspect help and generate samples in an isolated workspace. If needed, decompile the parameter classes and relevant validators with CFR.
4. Produce a declaration comparison using CFR output:

   ```sh
   python3 -S tools/inspect_jar.py /path/to/autoupgrade.jar \
     --decompiled /path/to/cfr-output \
     --compare /path/to/previous-candidate.json \
     --output review-candidate-new.json
   ```

5. Review additions, removed options, scope/default changes, active registries and actual validators. A generated candidate is explicitly **unreviewed**, and is never loaded by the website.
6. Add `profiles/<build>.json`. Keep earlier reviewed profiles for saved projects. Update the rule engine where behavior differs; do not silently apply an older rule to a changed build. Add regression cases.
7. Rebuild with `python3 -S tools/build.py`, run tests and browser flows, then validate supported scenarios with AutoUpgrade analyze in an Oracle lab. Record which evidence was and was not collected.
8. Publish through a reviewed Git change. Deployment CI verifies deterministic generated files before publishing.

Reference: [Oracle configuration model](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/understanding-autoupgrade-utility-configuration-files.html), [upgrade parameters](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/upgrade-parameters-autoupgrade-config-file.html), [command-line options](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/autoupgrade-command-line-parameters.html).
