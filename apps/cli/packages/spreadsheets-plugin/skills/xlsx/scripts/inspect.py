"""Knorvia Studio local OOXML preflight. Reads only; standard library only."""
import argparse
import json
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET

MAX_ARCHIVE = 64 * 1024 * 1024
MAX_PART = 8 * 1024 * 1024
MAX_ENTRIES = 10000
MAX_TEXT = 20000
NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}

def read_package(path, extension, required):
    if path.suffix.lower() != extension:
        raise ValueError("Unsupported file extension; preserve and convert a copy explicitly")
    if path.stat().st_size > MAX_ARCHIVE:
        raise ValueError("Input exceeds the 64 MiB preflight limit")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) > MAX_ENTRIES or len(set(names)) != len(names):
            raise ValueError("Too many or duplicate package entries")
        if sum(entry.file_size for entry in entries) > MAX_ARCHIVE:
            raise ValueError("Expanded package exceeds the 64 MiB preflight limit")
        for entry in entries:
            name = entry.filename
            if "\\" in name or ":" in name or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                raise ValueError("Unsafe package entry path")
            if entry.file_size > MAX_PART:
                raise ValueError("A package part exceeds the 8 MiB preflight limit")
            if entry.flag_bits & 1:
                raise ValueError("Encrypted ZIP entries are unsupported")
        if not set(required).issubset(names):
            raise ValueError("Required document parts are missing")
        if archive.testzip() is not None:
            raise ValueError("Package CRC check failed")
        roots = {}
        for name in names:
            if not name.endswith((".xml", ".rels")):
                continue
            content = archive.read(name)
            # Reject declarations even in UTF-16/32 before invoking the XML parser.
            declaration_bytes = content.upper().replace(b"\x00", b"")
            if b"<!DOCTYPE" in declaration_bytes or b"<!ENTITY" in declaration_bytes:
                raise ValueError("XML document type or entity declarations are not allowed")
            roots[name] = ET.fromstring(content)
    external = sum(
        1 for name, root in roots.items() if name.endswith(".rels")
        for node in root.iter() if node.get("TargetMode") == "External"
    )
    return names, roots, external

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    try:
        result = inspect(args.file)
        print(json.dumps(result, ensure_ascii=True, indent=2))
    except (OSError, ValueError, RuntimeError, NotImplementedError, zipfile.BadZipFile, ET.ParseError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=True), file=sys.stderr)
        return 1
    return 0

def inspect(path):
    names, roots, external = read_package(path, ".xlsx", ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"])
    root = roots["xl/workbook.xml"]
    if root.tag != "{" + NS["s"] + "}workbook":
        raise ValueError("The main part is not a spreadsheet")
    sheets = []
    for name, sheet in sorted(roots.items()):
        if not name.startswith("xl/worksheets/sheet") or not name.endswith(".xml"):
            continue
        cells = sheet.findall(".//s:c", NS)
        errors = [cell.get("r") for cell in cells if cell.get("t") == "e"]
        formulas = [cell for cell in cells if cell.find("s:f", NS) is not None]
        sheets.append({
            "part": name, "cells": len(cells), "formulas": len(formulas),
            "storedErrorCells": errors[:100], "storedErrorCount": len(errors),
            "formulaCachesMissing": sum(cell.find("s:v", NS) is None or not cell.find("s:v", NS).text for cell in formulas),
        })
    return {
        "ok": True, "format": "xlsx",
        "sheetNames": [node.get("name") for node in root.findall(".//s:sheet", NS)],
        "sheetsByPart": sheets, "externalRelationships": external,
        "macroParts": sum("vbaProject" in name for name in names),
        "formulaEvaluation": "not-performed", "visualVerification": "not-performed",
    }

if __name__ == "__main__":
    sys.exit(main())
