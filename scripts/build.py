#!/usr/bin/env python3
"""Build or verify deterministic release archives without bundling dependencies."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXTENSION_FILES = (
    "background.js", "core.js", "exporter.js", "icon.svg", "manifest.json", "messages.js",
    "popup.css", "popup.html", "popup.js", "privacy.html",
)
SOURCE_FILES = (
    ".gitignore", "LICENSE", "PRIVACY.md", "README.md", "SECURITY.md", "package.json", "package-lock.json",
    "docs/COOKIE-FILE.md", "docs/RELEASE.md", "docs/VALIDATION.md", "scripts/android-contract.py", "scripts/browser-test.js", "scripts/build.py",
    "test/boundary.test.js", "test/browser-harness.js", "test/core.test.js", "test/exporter.test.js", "test/fixtures.js",
    "test/popup-harness.js",
)
SIGNATURE_FILES = {
    "META-INF/", "META-INF/manifest.mf", "META-INF/mozilla.sf", "META-INF/mozilla.rsa",
    "META-INF/cose.manifest", "META-INF/cose.sig",
}


def archive_bytes(entries):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, contents in sorted(entries.items()):
            item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.create_system = 3
            item.external_attr = 0o100644 << 16
            archive.writestr(item, contents, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return buffer.getvalue()


def check_or_write(target, expected, verify):
    if verify:
        if not target.is_file() or target.read_bytes() != expected:
            raise SystemExit(f"Missing or different from the current source: {target}")
    else:
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(expected)


def verify_signed(path, expected):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or set(names) - SIGNATURE_FILES != expected.keys():
            raise SystemExit("Signed XPI has missing, duplicate, or unexpected files")
        if not {"META-INF/mozilla.sf", "META-INF/mozilla.rsa"} <= set(names):
            raise SystemExit("Expected Mozilla signature files are missing")
        for name, data in expected.items():
            if archive.read(name) != data:
                raise SystemExit(f"Signed XPI differs from the source: {name}")
    print(f"XPI payload matches the source: {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--verify", action="store_true", help="compare archive bytes and SHA-256 files against a fresh build")
    mode.add_argument("--verify-signed", type=Path, metavar="XPI", help="compare the signed XPI payload against the source")
    args = parser.parse_args()
    extension = {name: (ROOT / "extension" / name).read_bytes() for name in EXTENSION_FILES}
    version = json.loads(extension["manifest.json"])["version"]
    for name in ("package.json", "package-lock.json"):
        if json.loads((ROOT / name).read_bytes())["version"] != version:
            raise SystemExit(f"The version in {name} does not match the extension manifest")

    source = {name: (ROOT / name).read_bytes() for name in SOURCE_FILES}
    source.update({f"extension/{name}": data for name, data in extension.items()})
    extension["LICENSE"] = source["LICENSE"]
    if args.verify_signed:
        verify_signed(args.verify_signed, extension)
        return
    for suffix, entries in (("unsigned", extension), ("source", source)):
        target = ROOT / "dist" / f"private-cookie-export-{version}-{suffix}.zip"
        contents = archive_bytes(entries)
        digest = hashlib.sha256(contents).hexdigest()
        check_or_write(target, contents, args.verify)
        check_or_write(target.with_suffix(".zip.sha256"), f"{digest}  {target.name}\n".encode("ascii"), args.verify)
        print(f"{target}\nSHA-256: {digest}")


if __name__ == "__main__":
    main()
