#!/usr/bin/env python3
"""Sanitize Salesforce package.xml using Metadata Coverage Report."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import requests
import xml.etree.ElementTree as ET

COVERAGE_URL = "https://mdcoverage.secure.force.com/services/apexrest/report?version={version}"
CHANNELS = {"metadataApi", "sourceTracking", "unlockedPackage", "managedPackage"}
SF_NS = "http://soap.sforce.com/2006/04/metadata"
NS = {"sf": SF_NS}
ET.register_namespace("", SF_NS)


def fetch_coverage(version: str) -> dict:
    response = requests.get(COVERAGE_URL.format(version=version), timeout=30)
    response.raise_for_status()
    return response.json()


def normalize_lookup(raw: dict) -> Dict[str, dict]:
    lookup: Dict[str, dict] = {}
    types = raw.get("types")

    if isinstance(types, list):
        for item in types:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                lookup[item["name"]] = item
    elif isinstance(types, dict):
        for key, value in types.items():
            if isinstance(value, dict):
                value.setdefault("name", key)
                lookup[key] = value

    if lookup:
        return lookup

    for key, value in raw.items():
        if not isinstance(value, dict):
            continue
        if any(channel in value for channel in CHANNELS):
            value.setdefault("name", key)
            lookup[key] = value
    return lookup


def sanitize_package(
    package_path: Path,
    channel: str,
    lookup: Dict[str, dict],
) -> Tuple[ET.ElementTree, List[Tuple[str, str]], int]:
    tree = ET.parse(package_path)
    root = tree.getroot()
    type_blocks = root.findall("sf:types", NS)
    removed: List[Tuple[str, str]] = []
    kept = 0

    for block in list(type_blocks):
        name_el = block.find("sf:name", NS)
        type_name = name_el.text.strip() if name_el is not None and name_el.text else ""
        if not type_name:
            root.remove(block)
            removed.append(("<missing>", "Missing <name> in <types> block"))
            continue

        entry = lookup.get(type_name)
        if not entry:
            root.remove(block)
            removed.append((type_name, "Type not found in Metadata Coverage Report"))
            continue

        if entry.get(channel) is True:
            kept += 1
            continue

        root.remove(block)
        removed.append((type_name, f"Type '{type_name}' is not supported in '{channel}'"))

    return tree, removed, len(type_blocks)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sanitize package.xml against Salesforce Metadata Coverage.")
    parser.add_argument("package_xml", help="Path to package.xml")
    parser.add_argument("channel", choices=sorted(CHANNELS), help="metadataApi|sourceTracking|unlockedPackage|managedPackage")
    parser.add_argument("version", help="API version, e.g. 60.0")
    parser.add_argument("--output", default="package_sanitized.xml", help="Output file path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    package_path = Path(args.package_xml).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not package_path.exists():
        print(f"ERROR: Input file does not exist: {package_path}", file=sys.stderr)
        return 1

    try:
        coverage = fetch_coverage(args.version)
        lookup = normalize_lookup(coverage)
        if not lookup:
            print("ERROR: Failed to parse Metadata Coverage payload.", file=sys.stderr)
            return 2

        tree, removed, total_before = sanitize_package(package_path, args.channel, lookup)
        tree.write(output_path, encoding="UTF-8", xml_declaration=True)

        kept = total_before - len(removed)
        print("=== Sanitization Summary ===")
        print(f"Channel: {args.channel}")
        print(f"API Version: {args.version}")
        print(f"Total <types> before: {total_before}")
        print(f"Kept: {kept}")
        print(f"Removed: {len(removed)}")
        print(f"Output: {output_path}")
        if removed:
            print("\nRemoved types:")
            for type_name, reason in removed:
                print(f"  - {type_name}: {reason}")
        return 0
    except requests.RequestException as err:
        print(f"ERROR: Failed to fetch metadata coverage: {err}", file=sys.stderr)
        return 3
    except ET.ParseError as err:
        print(f"ERROR: Invalid XML: {err}", file=sys.stderr)
        return 4
    except Exception as err:  # pragma: no cover
        print(f"ERROR: {err}", file=sys.stderr)
        return 99


if __name__ == "__main__":
    raise SystemExit(main())
