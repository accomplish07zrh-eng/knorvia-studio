"""Knorvia Studio PDF metadata preflight; requires an existing local pdfinfo."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

MAX_FILE = 100 * 1024 * 1024

def inspect(path):
    if path.suffix.lower() != ".pdf":
        raise ValueError("Expected a PDF file")
    if path.stat().st_size > MAX_FILE:
        raise ValueError("Input exceeds the 100 MiB preflight limit")
    with path.open("rb") as source:
        if not source.read(1024).startswith(b"%PDF-"):
            raise ValueError("Missing PDF header")
    executable = shutil.which("pdfinfo")
    if executable is None:
        raise ValueError("pdfinfo is unavailable; install or select a local PDF inspection tool explicitly")
    completed = subprocess.run(
        [executable, str(path.resolve())], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=60, check=False,
    )
    if completed.returncode != 0:
        raise ValueError("pdfinfo could not inspect the file; it may be encrypted or damaged")
    fields = {}
    for line in completed.stdout.splitlines():
        key, separator, value = line.partition(":")
        if separator:
            fields[key.strip()] = value.strip()
    if not fields.get("Pages", "").isdigit() or int(fields["Pages"]) < 1:
        raise ValueError("PDF inspection did not report a valid page count")
    return {"ok": True, "format": "pdf", "metadata": fields, "visualVerification": "not-performed"}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(inspect(args.file), ensure_ascii=True, indent=2))
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=True), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
