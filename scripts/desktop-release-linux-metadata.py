"""Adapted from the frozen native Linux metadata probe; parameterized for fresh release CI.

Checks package metadata and extracted payloads, without system package installation.
The original failures/results remain in docs/evidence/native-linux-maintainer-20261003.
"""
import hashlib
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path

repo, release, destination = [Path(p).resolve() for p in sys.argv[1:4]]
delivered_sha = sys.argv[4]
version = json.loads((repo / "package.json").read_text())["version"]
contact = "Knorvia Studio <accomplish07zrh@gmail.com>"
report = {"status": "running", "deliveredSha": delivered_sha, "version": version,
          "targets": {}, "commands": [], "checks": [],
          "limits": ["No distro package installation", "No GUI or model-task acceptance"]}
env = {"PATH": os.environ["PATH"], "LANG": "C.UTF-8"}


def run(args, cwd=None):
    result = subprocess.run([str(a) for a in args], cwd=cwd, env=env,
                            text=True, capture_output=True, timeout=180)
    report["commands"].append({"args": [str(a) for a in args], "cwd": str(cwd) if cwd else None,
                               "exitCode": result.returncode, "stderr": result.stderr})
    if result.returncode != 0:
        raise RuntimeError(str(args) + "\n" + result.stderr)
    return result.stdout


def binding(path):
    with path.open("rb") as stream:
        sha = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": sha}


def fields(text):
    result = {}
    key = None
    for line in text.splitlines():
        if line.startswith(" ") and key:
            result[key] += "\n" + line
        elif ": " in line:
            key, value = line.split(": ", 1)
            result[key] = value
    return result


try:
    assert run(["git", "rev-parse", "HEAD"], cwd=repo).strip() == delivered_sha
    payload_names = ["knorvia-studio", "resources/app.asar", "resources/knorvia/knorvia.cjs",
                     "resources/app.asar.unpacked/node_modules/node-pty/prebuilds/linux-x64/pty.node",
                     "resources/LICENSE.knorvia.txt", "resources/NOTICE.md", "resources/THIRD-PARTY-NOTICES.md",
                     "resources/licensing/MIT.txt", "resources/licenses/lobe-icons-LICENSE.txt"]
    fresh = {name: binding(release / "linux-unpacked" / name) for name in payload_names}
    for kind, pattern in [("AppImage", "*.AppImage"), ("deb", "*.deb"), ("rpm", "*.rpm"), ("pacman", "*.pkg.tar.zst")]:
        items = sorted(release.glob(pattern))
        assert len(items) == 1, items
        artifact = items[0]
        extracted = destination / kind
        extracted.mkdir(parents=True, exist_ok=False)
        result = {"artifact": binding(artifact)}
        report["targets"][kind] = result
        if kind == "AppImage":
            report["commands"].append({"appImageExtraction": run([artifact, "--appimage-extract"], cwd=extracted)})
            candidates = [extracted / "squashfs-root"]
        elif kind == "deb":
            meta = fields(run(["dpkg-deb", "--field", artifact]))
            assert meta["Package"] == "knorvia-studio" and meta["Maintainer"] == contact, meta
            assert meta["Version"] == version.replace("-", "~") and meta["Architecture"] == "amd64", meta
            assert meta["License"] == "Apache-2.0" and meta["Vendor"] == contact and meta["Homepage"] == "https://knorvia.xyz", meta
            expected = {"libgtk-3-0", "libnotify4", "libnss3", "libxss1", "libxtst6", "xdg-utils", "libatspi2.0-0", "libuuid1", "libsecret-1-0"}
            actual = {part.strip().split(" ", 1)[0] for part in meta["Depends"].split(",")}
            assert expected.issubset(actual), actual
            result["metadata"] = meta
            run(["dpkg-deb", "--extract", artifact, extracted])
            candidates = [p for p in extracted.glob("opt/*") if (p / "resources/app.asar").is_file()]
        elif kind == "rpm":
            query = "%{NAME}\n%{VERSION}\n%{RELEASE}\n%{ARCH}\n%{PACKAGER}\n%{VENDOR}\n%{LICENSE}\n%{URL}\n"
            values = run(["rpm", "--query", "--package", "--queryformat", query, artifact]).splitlines()
            assert len(values) == 8, values
            meta = dict(zip(["name", "version", "release", "arch", "packager", "vendor", "license", "url"], values))
            assert meta["name"] == "knorvia-studio" and meta["version"] == version.replace("-", "~") and meta["arch"] == "x86_64", meta
            assert meta["packager"] == contact and meta["vendor"] == contact and meta["license"] == "Apache-2.0" and meta["url"] == "https://knorvia.xyz", meta
            deps = run(["rpm", "--query", "--package", "--requires", artifact]).splitlines()
            expected = {"gtk3", "libnotify", "nss", "libXScrnSaver", "xdg-utils", "at-spi2-core", "mesa-libgbm", "alsa-lib", "(libXtst or libXtst6)", "(libuuid or libuuid1)"}
            assert expected.issubset(set(deps)), deps
            result["metadata"] = meta
            result["dependencies"] = deps
            run(["bsdtar", "--extract", "--file", artifact, "--directory", extracted, "--no-same-owner"])
            candidates = [p for p in extracted.glob("opt/*") if (p / "resources/app.asar").is_file()]
        else:
            with artifact.open("rb") as stream:
                assert stream.read(4) == bytes.fromhex("28b52ffd"), "pacman file must contain real zstd bytes"
            raw = run(["tar", "--zstd", "--extract", "--to-stdout", "--file", artifact, ".PKGINFO"])
            meta = {}
            for line in raw.splitlines():
                if " = " in line and not line.startswith("#"):
                    key, value = line.split(" = ", 1)
                    meta.setdefault(key, []).append(value)
            assert meta["pkgname"] == ["knorvia-studio"] and meta["packager"] == [contact] and meta["license"] == ["Apache-2.0"], meta
            assert meta["pkgver"] == [version.replace("-", "_") + "-1"] and meta["arch"] == ["x86_64"], meta
            assert {"gtk3", "nss", "libxss", "libxtst", "libnotify", "alsa-lib", "mesa", "xdg-utils"} == set(meta["depend"]), meta
            run(["tar", "--zstd", "--extract", "--file", artifact, "--directory", extracted, "--no-same-owner"])
            assert (extracted / ".INSTALL").is_file() and (extracted / ".MTREE").is_file()
            result["metadata"] = meta
            result["compressionMagicHex"] = "28b52ffd"
            candidates = [p for p in extracted.glob("opt/*") if (p / "resources/app.asar").is_file()]
        assert len(candidates) == 1, candidates
        app = candidates[0]
        assert not (app / "resources/knorvia-portable.json").exists(), "Installed product must not carry a portable marker"
        result["applicationRoot"] = str(app)
        result["payload"] = {}
        for name in payload_names:
            actual = binding(app / name)
            assert actual["sha256"] == fresh[name]["sha256"] and actual["bytes"] == fresh[name]["bytes"], name
            result["payload"][name] = actual
        result["status"] = "passed"
    report["checks"] = ["All four actual package formats extracted", "Maintainer, license, architecture, version and dependencies retained", "Nine actual payload files match freshly built linux-unpacked across all targets", "Pacman has actual zstd format, install hook and mtree"]
    report["status"] = "passed"
except BaseException:
    report["status"] = "failed"
    report["error"] = traceback.format_exc()
finally:
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "linux-metadata.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "checks": report["checks"], "error": report.get("error")}))
sys.exit(0 if report["status"] == "passed" else 1)
