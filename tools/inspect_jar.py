#!/usr/bin/env python3
"""Inspect a local AutoUpgrade JAR and compare optional CFR declarations. Stdlib only.

This tool writes a review candidate, never an automatically trusted web profile.
It does not run the JAR. No network, database or credentials are needed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


def inspect(jar, decompiled=None):
    with zipfile.ZipFile(jar) as archive:
        manifest = archive.read("META-INF/MANIFEST.MF").decode("utf-8")
        # Manifest continuation lines begin with a single space.
        manifest = re.sub(r"\r?\n ", "", manifest)
        attrs = dict(line.split(": ", 1) for line in manifest.splitlines() if ": " in line)
        templates = sorted(name for name in archive.namelist() if "templates/" in name and name.endswith(".properties"))
    result = {"version": attrs.get("Implementation-Version"), "sha256": hashlib.sha256(jar.read_bytes()).hexdigest(), "templates": templates, "declarations": [], "reviewStatus": "unreviewed"}
    if decompiled:
        for relative in ("oracle/commons/config/CommonConfigParameters.java", "oracle/upgrade/autoupgrade/config/UpgradeConfigParameters.java", "oracle/patch/config/PatchConfigParameters.java"):
            source = decompiled / relative
            for line_number, line in enumerate(source.read_text().splitlines(), 1):
                match = re.search(r'public static final ConfigParameter (\w+) = ConfigParameter\.(\w+)\("([^"]+)"(.*?)\);', line)
                if match:
                    symbol, factory, name, args = match.groups()
                    result["declarations"].append({"name": name, "symbol": symbol, "factory": factory, "arguments": args.lstrip(", "), "source": relative, "line": line_number})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jar", type=Path)
    parser.add_argument("--decompiled", type=Path, help="CFR output directory, if available")
    parser.add_argument("--compare", type=Path, help="An earlier inspect_jar.py JSON candidate")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = inspect(args.jar, args.decompiled)
    if args.compare:
        before = json.loads(args.compare.read_text())
        identify = lambda row: row["source"] + ":" + row["name"]
        old = {identify(row): row for row in before["declarations"]}
        new = {identify(row): row for row in result["declarations"]}
        result["changes"] = {
            "added": sorted(new.keys() - old.keys()),
            "removed": sorted(old.keys() - new.keys()),
            "modified": sorted(key for key in new.keys() & old.keys() if (new[key]["factory"], new[key]["arguments"]) != (old[key]["factory"], old[key]["arguments"])),
        }
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print("Wrote unreviewed candidate for", result["version"], "to", args.output)


if __name__ == "__main__":
    main()
