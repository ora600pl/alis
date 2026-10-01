# AutoUpgrade 26.6.260925 in ALIS

Inspected 2026-10-01. Oracle release metadata identifies version 26.6, release date 2026-09-29, size 7,421,000 bytes and SHA-256 `fd509ade67e1b54dc0ec44c8a39bf09caf268a049d5e95db1068216703202c8e`. The downloaded JAR matches that checksum. Its manifest and `-version` identify build 26.6.260925, built 2026-09-25.

Public source: [Oracle AutoUpgrade metadata](https://download.oracle.com/otn-pub/otn_software/autoupgrade.json). The JAR comes from its `downloadUrl`. Oracle binaries, decompiled source and private correspondence are not included in this repository.

## Version selection

Choose the exact AutoUpgrade build in Plan or the sidebar. The newest inspected build is the default for new projects. Existing JSON projects retain their saved profile. Switching profiles preserves settings, revalidates them, refreshes the catalog and rebuilds the runbook. Unsupported settings block config export. Configurations carrying ALIS's generated profile comment select that profile on import; an unknown build is rejected. Config files without that comment use the currently selected profile, which must be verified by the operator.

The earlier 26.5 profile retains its declarations and original behavior. Profile `behavior` metadata controls version-specific grammar, validation, topology choices and runbook sections; the version selector is also present in the portable offline HTML.

## Verified differences

| JAR behavior | ALIS behavior / evidence |
|---|---|
| New download aliases `CPAT`, `DBSAT`, `EXAPATCHMGR`, `EXAQFSDP:19/21/23/26`, `OEM:13.5/24.1`, `GI[:version]` | Version-specific controls, grammar and product instructions; `PatchApply`, concrete `Apply*` consumers |
| OEM is exclusive; GI combines only with MRP, OPATCH or numeric IDs | Combination checks; `PatchApply.canBeCombinedWith`, `ValidateConfigParameters.validatePatchTypeCombinations` |
| GI, SQLCL, AHF, CPAT, CVU, DBSAT, EXAPATCHMGR, EXAQFSDP and OEM are download-only | These selections block installation/deploy; `PatchApply.isDownloadOnlyTool`, `validateToolLocatorDownloadMode` |
| TOOLS still expands to AU, OPATCH, SQLCL, CVU and AHF | CPAT/DBSAT must be added explicitly; `PatchApply.resolveAliases` |
| Tool-only downloads can omit target_version; GI's consumer still needs a target release | ALIS permits omission for independent tool products; requires target_version or a pinned GI version for GI |
| GI image downloads, with GI RU media when gold_image=NO | Runbook explains image selection; `ApplyGI.getFilesToDownload`, `ValidateGoldImage` |
| CSPU available for 21c on Linux; Linux 19/23 use MRP | Version/platform checks; `validateExplicitMonthlySecurityPatchTypes`, `getMonthlySecurityPatch` |
| Explicit OJVM can predate the requested RU | Removes the 26.5 lower-RU rejection, retains major-release consistency; `ValidateConfigParameters` comparison |
| Dotted patch target_version values use the major component | Preserves the entered value and warns that an RU pin belongs in patch=; `TargetVersionValidation` |
| Upgrade removes target_edition and adds rac_start_time_sleep_in_seconds | New inherited parameter with default 60; removed setting blocks export; registries and `UpgradeConfigParameters` |
| Invalid startup waits normalize to 60 (valid: Java int >=60) | Warning explains fallback; `UpgradeConfigValidator`, `FullUpgCreator.normalizeRacStartTimeSleepInSeconds` |
| SEHA / RAC One Node support | Planning choices and current-node/maintenance instructions; `DBType`, `ClusterDetails`, `RACWork` |
| Clone creation reads source PATH_PREFIX through the database link | Target-directory guidance; no invented config key; `CreatePluggableDatabase.getPathPrefix`, `Database.getPathPrefix` |
| `-resume [-job <positive job ID>]` requires -mode | Separate recovery toolbox, preserving JAR/config/mode; `StrictParser`, `CLIOptionsParser`, `ResumeOptions` |
| create_home runs prechecks; patch deploy may reuse the same RU | Runbook tells operators to review prechecks, actual inventory and maintenance impact |
| SQLcl checksum failure produces a warning | Dedicated verification instruction; `ApplySQLcl` consumer |
| Device flow exists, but production add -no_password is rejected | Production runbook retains add -user; `AruGroupProcessor.process`, `AruProductionServer.isProduction` |
| add -csi is ignored in 26.6 | Omitted from new loader commands and explained; `AruGroupProcessor.process` |

Declaration comparison: one addition, one removal, no changed declaration arguments. The distinct name count remains 132, with 83 upgrade and 89 patch entries including inherited common declarations. Registries were compared; the existing unsupported patch and unregistered LDAP statuses remain explicit.

## Reproduce the checks

Obtain the Oracle JAR separately and use an existing JDK, Node and Python 3 (no npm/pip packages):

```sh
python3 -S tools/inspect_jar.py /path/to/autoupgrade-26.6.jar --output /tmp/review-candidate-26.6.json
java -Duser.language=en -jar /path/to/autoupgrade-26.6.jar -version
java -Duser.language=en -jar /path/to/autoupgrade-26.6.jar -help
java -Duser.language=en -jar /path/to/autoupgrade-26.6.jar -patch -help
java -jar /path/to/cfr-0.152.jar /path/to/autoupgrade-26.6.jar --outputdir /tmp/au-26.6-decompiled --silent true
python3 -S tools/verify_patch_contract.py /path/to/autoupgrade-26.6.jar
python3 -S tools/verify_parser.py /path/to/autoupgrade-26.6.jar
python3 -S tools/verify_parser.py /path/to/autoupgrade-26.5.jar
python3 -S tools/build.py
node --test tests/*.test.cjs
python3 -S -m unittest discover -s tests -p '*_test.py'
```

The JAR comparison tools require an exact reviewed build and matching SHA-256. The contract probe invokes only isolated Java declarations and pure helpers, including 120 positive/negative patch expressions, download classification, product combinations, target normalization and startup-delay bounds. It never starts the launcher or an Oracle/ARU workflow.

Validation: 176 Node tests, 7 Python/build tests, 200 real-JAR contract comparisons, 14 parser read-backs for 26.5 and 22 for 26.6. Browser verification covered version switching, profile-specific media controls, configuration preservation, incompatible-export blocking and runbook sections. Both web and offline editions were checked. No Oracle analyze/fixup/deployment, installer, MOS download, credential exchange, SEHA/RAC or clone execution was performed. The profile describes inspected code and static checks, not a claim of successful execution in those environments.
