# AUGUR

**AutoUpgrade Configuration Builder · by ORA-600**

AutoUpgrade config, minus the guesswork.

[Open AUGUR](https://ora600pl.github.io/augur/) · [Offline edition](https://ora600pl.github.io/augur/offline.html) · [Polski](README.pl.md)

AUGUR is a static, browser-based wizard for Oracle AutoUpgrade configuration files. Choose a scenario, enter database settings, review the generated file, and download it. Configuration data stays in browser memory; imports are read locally. There is no backend, analytics, account, external font or runtime dependency.

## What works

- Guided database upgrade, non-CDB to PDB, unplug/plug, refreshable PDB and patching configurations.
- Multiple database entries, global/local settings and per-PDB mappings.
- Live configuration preview, static validation and POSIX command generation.
- Import `.cfg` files while preserving comments, order and unknown settings; inspect a line diff.
- Save and reopen an AUGUR JSON project without browser persistence.
- Advanced parameter catalog, with unsupported and unverified settings identified.
- A self-contained offline HTML edition. Download `offline.html`, then open it in a modern browser.

The initial inspected profile is **AutoUpgrade 26.5.260807**, build 2026-08-07. It includes 83 upgrade declarations and 89 patch declarations, of which 81 and 89 respectively are present in the inspected registries. Four patch parameters are explicitly unsupported. A registry entry is not evidence that every environment-dependent combination has been tested.

## Using the wizard

1. Choose the scenario and AutoUpgrade mode.
2. Enter the source SID, server Oracle homes and/or target version. Give the run an explicit global log directory.
3. For migrations, configure the target CDB and the individual PDB mappings.
4. Review recovery settings and any scripts or advanced parameters.
5. Resolve errors in Review, inspect warnings, and download the configuration.
6. Run the generated `analyze` command on the database server before deployment.

Save a project before closing or replacing the current draft. The site intentionally does not persist database configuration in localStorage. The hosting provider still receives ordinary page requests; see [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).

## Validation boundaries

AUGUR validates a conservative subset of the file syntax and selected semantic rules from the inspected build. It does not connect to Oracle, inspect Oracle homes, check patch availability, test upgrade compatibility between actual databases, verify topology, or guarantee recovery. **A successful static check is not a successful AutoUpgrade analyze.**

New JAR builds need reviewed profiles. The catalog is not generated from sample templates alone: their descriptions and examples can differ from the actual parser and validators. See [profile evidence and maintenance](docs/PROFILE.md) and the [initial validation record](docs/VALIDATION.md).

Unknown imported keys are retained with a warning. Duplicates, malformed lines and unsupported values block configuration export. Fix duplicate/malformed source lines in your editor and import again. Advanced inputs outside the supported syntax may require editing the final file separately and checking it with AutoUpgrade. Do not put passwords in `.cfg` files or project JSON; use AutoUpgrade's keystore on the server.

## Develop locally

No `npm install`, pip packages or build framework are required. Python 3.9+ builds the data/offline artifacts; Node.js 24 runs the tests. Neither is required by site visitors.

```sh
python3 -S tools/build.py
python3 -m http.server 8000 --bind 127.0.0.1 --directory site
```

Open [the local site](http://127.0.0.1:8000).

```sh
node --test tests/core.test.cjs
python3 -S -m unittest discover -s tests -p '*_test.py'
node --check site/assets/app.js
```

`site/assets/profiles.js` and `site/offline.html` are generated, tracked artifacts. Edit the JSON profile and source files, then rebuild. GitHub Actions runs tests and checks reproducibility before deploying `site/` to Pages. Configure the Pages publishing source as **GitHub Actions**.

## Repository layout

```text
profiles/        Reviewed version-specific metadata
site/            Static website and generated offline edition
site/assets/     UI, pure configuration logic, styles and generated data
tools/           Python standard-library build and JAR inspection tools
tests/           Node built-in tests and Python unittest checks
docs/            Evidence, profile maintenance and validation records
```

Independent community tooling. Not affiliated with or endorsed by Oracle. Oracle AutoUpgrade binaries and decompiled Oracle code are not distributed in this repository. The MIT license covers AUGUR's original code and documentation.
