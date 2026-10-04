# Option dependencies and Gold Image diagnostics

Reviewed on 2026-10-01 for profiles 26.5.260807 and 26.6.260925. The form checks proposed choices using the same rules that govern export. Global settings are checked against every entry, including local overrides and declared defaults.

## Gold Image stage order

`gold_image=YES` selects an Oracle-supplied input image. `create_gold_image=YES` packages the target home after installation. These options can be used together; the absence of an existing target home at the start of `create_home` is consistent with this workflow.

In the supplied 26.6 JAR:

- `PatchCreateNewHome.getDefinition()` adds `getInstallStages()`, then `ROOTSH`, and finally the optional `CREATE_GOLD_IMAGE` stage.
- `PatchJobCreator.getStandardInstallStages()` includes `INSTALL`, optional `ROOH`, topology-dependent `OH_PATCHING`, and `OPTIONS`. Windows RAC has a separate installation order, but image packaging still follows this entire group of stages.
- `CreateGoldImage.userCreatedGoldImage()` reads `target_home` and writes the process output to `goldimage/create_user_gold_image.log`.
- `PATCH101` is raised when `runInstaller -createGoldImage -destinationLocation ... -silent` returns an unsuccessful result. The exception's reference to "source ORACLE_HOME" does not change the fact that this action uses the target home.

This was confirmed through CFR and an independent `javap -c -p` bytecode inspection of the JAR whose SHA-256 is recorded in the profile. It establishes the stage order and error meaning; the Oracle installer was not executed.

For the reported job, inspect:

```sh
sed -n '1,240p' /home/oracle/oinstall/autoupgrade/logs/create_home_1/100/goldimage/create_user_gold_image.log
```

A `PATCH101` stack trace alone cannot distinguish permissions, free space, installation state or another OUI error. Identify the cause from the installer output.

Oracle documentation confirms that packaging follows target-home creation: [create_gold_image and gold_image](https://docs.oracle.com/en/database/oracle/oracle-database/26/upgrd/patch-parameters-autoupgrade-config-file.html).

## Rules exposed in the form

| Context | Dependency and behavior |
| --- | --- |
| Local `PATCH=GOLDIMAGE:image.zip` | Additional aliases, patch numbers and Oracle-supplied image controls are disabled. |
| Local ZIP with another image capture | ALIS requires a separate image-building project. This is a wizard policy: the JAR can skip redundant packaging of an unchanged local image. It does not establish that Oracle always rejects this combination. |
| `download`, `analyze`, `fixups` | The capture field is disabled because these runs do not execute the final `CREATE_GOLD_IMAGE` stage. An imported setting can remain in a configuration used later for installation. |
| `gold_image=NO`, local ZIP or tools only | The image security level is disabled. Tools-only selections also disable Oracle image settings. |
| Download-only tools/media | Presets and additions excluded from `create_home` or database operations are disabled according to the selected profile. |
| GI, OEM, duplicates | In 26.6, GI allows MRP, OPATCH and numeric IDs; OEM is an exclusive selection. An alias already present cannot be added again. |
| Release, RU pin and platform | OJVM, MRP, CSPU, DPBP, GI, RECOMMENDED and Oracle-supplied image requirements use the selected profile's reviewed export rules. |
| Release 21 | In 26.6, Linux CSPU is available; DPBP and MRP are rejected. The earlier rule set applies in 26.5. |
| Version pinning | Requires RU, RECOMMENDED or GI to be selected. Patch numbers cannot be added to images or OEM selections that exclude them. |
| RAC / Windows / single instance | REQUIRED/FORCE are unavailable for Windows or a declared single instance. |
| Physical standby | Ineligible database modes are disabled; download and software preparation remain separate workflows. |
| Software only | GRP, rolling patching and drain parameters are unavailable in the advanced settings catalog. |
| `parallel_stats_degree` | Requires `dictionary_stats_before=YES`, including inherited values. |
| Raising COMPATIBLE | `drop_grp_after_upgrade=NO` cannot be selected. Export still checks release and compatibility restrictions. |
| Existing home during upgrade | Installation media require `create_oracle_home=YES`. |
| Standard upgrade / PDB in place | PDB movement settings are disabled until a migration or cloning scenario is selected. |
| Scope / profile | The catalog blocks unavailable parameters and inappropriate global/local scope. |
| `folder` / `download_folder` | Setting either spelling disables the other. Conflicting imported values block export. |
| Multiple entries | Outside download mode, a target home cannot also be another patch entry's source or target. This rule comes from `UniqueOracleHomeValidator`; paths with unresolved placeholders are not treated as proof of a collision. |

Changing values or context recalculates disabled choices without losing focus. The reason is shown beside the disabled field, in option/button titles and under "Why are some choices unavailable?". Changing the scenario or profile preserves data and exposes conflicts for repair.

Imported conflicting configurations retain their values. "Remove explicit setting" remains available even when the field is disabled; export becomes available after the configuration is valid. A manually entered patch expression still undergoes complete export validation. Preset buttons and the advanced settings catalog use those same checks.

## Runbook and validation boundaries

When a deploy project requests an output image, separate home preparation uses a `*.home.cfg` artifact with `create_gold_image=NO`. The original deploy configuration retains the capture request. This prevents the same ZIP from being created twice, especially when it has a fixed filename. Guidance on retaining the image appears after the operation.

At the 2026-10-01 review, 200 Node tests included 24 new dependency regressions covering import/repair, both profiles, the reported valid input/output image configuration and the separate home-preparation artifact. Nine Python tests checked the build, asset versioning and offline CSP. The online and offline forms were also exercised in a browser. See [VALIDATION.md](VALIDATION.md) for subsequent validation.

The rules come from the validator/consumer inspections described in [PROFILE.md](PROFILE.md) and the stage-order, `CreateGoldImage` and `UniqueOracleHomeValidator` investigation. ALIS does not simulate Oracle execution or check server files, OUI, permissions, space, inventory, databases or MOS/ARU services. This boundary also applies to the reported `PATCH101`.
