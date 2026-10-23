#!/usr/bin/env python3
"""Build an auditable, deterministic unsigned AMO upload ZIP; no dependency code is bundled."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ["background.js", "core.js", "exporter.js", "icon.svg", "manifest.json", "messages.js",
         "popup.css", "popup.html", "popup.js", "privacy.html"]


def build():
    manifest = json.loads((ROOT / "extension/manifest.json").read_text())
    target = ROOT / "dist" / f"rabbyt-login-helper-{manifest['version']}-unsigned.zip"
    target.parent.mkdir(exist_ok=True)
    entries = {name: (ROOT / "extension" / name).read_bytes() for name in FILES}
    entries["LICENSE"] = (ROOT / "LICENSE").read_bytes()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, contents in sorted(entries.items()):
            item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.create_system = 3
            item.external_attr = 0o100644 << 16
            archive.writestr(item, contents, compresslevel=9)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n")
    print(f"{target}\nSHA-256: {digest}")
    return target


if __name__ == "__main__":
    build()
