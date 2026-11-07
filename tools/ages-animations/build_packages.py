#!/usr/bin/env python3
"""Import generated sheets through AGES and export preview runtime packages.

Usage:
  python tools/ages-animations/build_packages.py \
      --ages /path/to/ages --source /tmp/ages-animations \
      --out tests/fixtures/ages-animations
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

MEMBERS = ("atlas.png", "integrity.json", "provenance.json", "sprite.runtime.json")


def run_ages(ages: Path, *args: str) -> dict:
    result = subprocess.run(
        [sys.executable, str(ages / "gamedev.py"), *args],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def build_one(ages: Path, source: Path, out: Path, name: str) -> dict:
    work = out / ".work" / name
    (work / "project").mkdir(parents=True, exist_ok=True)
    imported = run_ages(
        ages,
        "sprite-import-external",
        "--project",
        str(work / "project"),
        "--source-root",
        str(source),
        "--declaration",
        "import.json",
    )
    export_dir = out / name
    if export_dir.exists():
        shutil.rmtree(export_dir)
    exported = run_ages(
        ages,
        "sprite-export-runtime",
        "--candidate",
        imported["candidate_manifest"],
        "--out",
        str(export_dir),
        "--json",
    )
    if imported["package_digest"] != exported["package_digest"]:
        raise SystemExit(f"{name}: validated import digest differs from export digest")
    missing = [member for member in MEMBERS if not (export_dir / member).is_file()]
    if missing:
        raise SystemExit(f"{name}: export is missing {missing}")
    provenance_dir = export_dir / "source"
    provenance_dir.mkdir(exist_ok=True)
    shutil.copy(source / "sheet.png", provenance_dir / "sheet.png")
    shutil.copy(source / "import.json", provenance_dir / "import.json")
    for stray in out.glob(f".{name}.ages-*"):
        if stray.is_dir():
            shutil.rmtree(stray)
        else:
            stray.unlink()
    return {"source": str(source), "import": imported, "export": exported}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ages", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.absolute()
    out = args.out.absolute()
    out.mkdir(parents=True, exist_ok=True)
    evidence: dict[str, object] = {}
    for name in ("emberkit", "mirewhelp", "briarling", "reliquary-effects"):
        record = build_one(args.ages.absolute(), source / name, out, name)
        evidence[name] = record
        print(f"{name}: {record['export']['package_digest']}", flush=True)
    (out / "ages-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    work = out / ".work"
    if work.exists():
        shutil.rmtree(work)


if __name__ == "__main__":
    main()
