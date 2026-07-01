#!/usr/bin/env python3
"""Move RTU pictures without GPS EXIF into a NoGPS Pictures subfolder."""
from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

_SCRIPT = Path(__file__).with_name("export-rtu-picture-duplicates.py")
_spec = importlib.util.spec_from_file_location("export_rtu_picture_duplicates", _SCRIPT)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)

PICTURES_DIR = _mod.PICTURES_DIR
read_image_metadata = _mod.read_image_metadata

NOGPS_DIR = PICTURES_DIR / "NoGPS Pictures"


def unique_dest(dest: Path) -> Path:
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    n = 2
    while True:
        candidate = dest.with_name(f"{stem} ({n}){suffix}")
        if not candidate.exists():
            return candidate
        n += 1


def main() -> None:
    NOGPS_DIR.mkdir(exist_ok=True)
    moved: list[tuple[str, str]] = []
    errors: list[tuple[str, str]] = []

    for path in sorted(PICTURES_DIR.rglob("*.jpg")):
        if NOGPS_DIR in path.parents:
            continue
        meta = read_image_metadata(path)
        if meta["has_gps"]:
            continue
        dest = unique_dest(NOGPS_DIR / path.name)
        try:
            shutil.move(str(path), str(dest))
            moved.append((path.name, dest.name))
        except OSError as exc:
            errors.append((path.name, str(exc)))

    main_count = len(list(PICTURES_DIR.glob("*.jpg")))
    nogps_count = len(list(NOGPS_DIR.glob("*.jpg")))

    print(f"Folder: {NOGPS_DIR}")
    print(f"Moved: {len(moved)}")
    print(f"Errors: {len(errors)}")
    print(f"Remaining in main folder: {main_count}")
    print(f"In NoGPS Pictures: {nogps_count}")
    if errors:
        for name, err in errors:
            print(f"  ERROR {name}: {err}")


if __name__ == "__main__":
    main()
