#!/usr/bin/env python3
"""Verify that icons.json covers all enum values from the SpaceTraders API spec.

Compares the keys in icons.json against the enum values defined in
api-docs/models/*.json schema files. Reports any values that are:
  - In the API spec but missing from icons.json (need icon mappings)
  - In icons.json but removed from the API spec (stale mappings)

Exit code 0 = all synced, 1 = drift detected.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS_PATH = ROOT / "icons.json"

# Map icons.json keys -> API spec schema files + the JSON path to the enum
CHECKS = [
    {
        "name": "Ship Frames",
        "icons_key": "shipFrames",
        "schema": ROOT / "api-docs" / "models" / "ShipFrame.json",
        "enum_path": ["properties", "symbol", "enum"],
    },
    {
        "name": "Factions",
        "icons_key": "factions",
        "schema": ROOT / "api-docs" / "models" / "FactionSymbol.json",
        "enum_path": ["enum"],
    },
    {
        "name": "Waypoint Types",
        "icons_key": "waypointTypes",
        "schema": ROOT / "api-docs" / "models" / "WaypointType.json",
        "enum_path": ["enum"],
    },
    {
        "name": "Star Types",
        "icons_key": "starTypes",
        "schema": ROOT / "api-docs" / "models" / "SystemType.json",
        "enum_path": ["enum"],
    },
]


def extract_enum(schema_path: Path, enum_path: list[str]) -> set[str]:
    with open(schema_path) as f:
        data = json.load(f)
    for key in enum_path:
        data = data[key]
    return set(data)


def main() -> int:
    with open(ICONS_PATH) as f:
        icons = json.load(f)

    has_drift = False

    for check in CHECKS:
        name = check["name"]
        mapped = set(icons.get(check["icons_key"], {}).keys()) - {"_default"}

        if not check["schema"].exists():
            print(f"⚠  {name}: schema not found at {check['schema']}")
            has_drift = True
            continue

        spec = extract_enum(check["schema"], check["enum_path"])

        missing = spec - mapped
        stale = mapped - spec

        if missing or stale:
            has_drift = True
            print(f"✗  {name}:")
            for v in sorted(missing):
                print(f"     + {v}  (in API spec, missing from icons.json)")
            for v in sorted(stale):
                print(f"     - {v}  (in icons.json, removed from API spec)")
        else:
            print(f"✓  {name}: {len(spec)} values, all mapped")

    if has_drift:
        print("\nIcon mappings are out of sync with the API spec.")
        return 1

    print("\nAll icon mappings are in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
