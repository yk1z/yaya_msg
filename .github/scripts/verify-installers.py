"""Check native release artifacts before uploading them; never install or launch the app."""

import argparse
import configparser
import json
import os
import plistlib
import shlex
import subprocess
import tempfile
from pathlib import Path


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def only(paths, description):
    paths = list(paths)
    require(len(paths) == 1, f"Expected one {description}, found: {paths}")
    return paths[0]


def executable(path):
    require(path.is_file() and path.stat().st_size > 0, f"Missing binary: {path}")
    require(path.stat().st_mode & 0o111, f"Binary is not executable: {path}")


def check_worker(application, resources):
    environment = dict(os.environ, ELECTRON_RUN_AS_NODE="1")
    completed = subprocess.run([
        str(application.resolve()), str(Path(__file__).with_name("verify-message-worker.cjs").resolve()),
        str((resources / "app.asar").resolve())
    ], env=environment, capture_output=True, text=True, encoding="utf-8", timeout=45)
    require(completed.returncode == 0, f"Packaged worker failed: {completed.stderr or completed.stdout}")
    require("Verified packaged background worker:" in completed.stdout, "Packaged worker did not complete its checks")
    print(completed.stdout.strip())


def check_windows(dist, package):
    installer = only(dist.glob("*-win.exe"), "Windows installer")
    for binary in (installer, dist / "win-unpacked/resources/ffmpeg.exe"):
        with binary.open("rb") as handle:
            require(handle.read(2) == b"MZ", f"Not a Windows executable: {binary}")
    print(f"Verified Windows installer and bundled FFmpeg: {installer.name}")
    check_worker(dist / "win-unpacked" / (package["build"]["executableName"] + ".exe"), dist / "win-unpacked/resources")


def check_macos(dist, arch):
    installer = only(dist.glob("*-mac.dmg"), "macOS installer")
    with tempfile.TemporaryDirectory(prefix="yaya-dmg-") as temporary:
        mount = Path(temporary) / "mounted"
        mount.mkdir()
        subprocess.run([
            "hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(installer.resolve())
        ], check=True)
        try:
            app = only(mount.glob("*.app"), "application in DMG")
            with (app / "Contents/Info.plist").open("rb") as handle:
                info = plistlib.load(handle)
            schemes = {
                scheme for item in info.get("CFBundleURLTypes", [])
                for scheme in item.get("CFBundleURLSchemes", [])
            }
            require("yayamsg" in schemes, "Missing macOS yayamsg protocol declaration")
            ffmpeg = app / "Contents/Resources/ffmpeg"
            executable(ffmpeg)
            executable_file = app / "Contents/MacOS" / info["CFBundleExecutable"]
            for binary in (ffmpeg, executable_file):
                subprocess.run([
                    "lipo", "-verify_arch", "x86_64" if arch == "x64" else "arm64", str(binary)
                ], check=True)
            print(f"Verified DMG, application/FFmpeg architecture and yayamsg protocol: {installer.name}")
            check_worker(executable_file, app / "Contents/Resources")
        finally:
            subprocess.run(["hdiutil", "detach", str(mount)], check=True)


def check_linux(dist, arch, package):
    installer = only(dist.glob("*.deb"), "Linux DEB installer")
    actual_arch = subprocess.check_output([
        "dpkg-deb", "--field", str(installer), "Architecture"
    ], text=True).strip()
    require(actual_arch == {"x64": "amd64", "arm64": "arm64"}[arch], "Incorrect DEB architecture")
    with tempfile.TemporaryDirectory(prefix="yaya-deb-") as temporary:
        root = Path(temporary)
        subprocess.run(["dpkg-deb", "--extract", str(installer), str(root)], check=True)
        ffmpeg = only(root.glob("opt/*/resources/ffmpeg"), "bundled FFmpeg")
        executable(ffmpeg)
        with ffmpeg.open("rb") as handle:
            header = handle.read(20)
        require(header[:4] == b"\x7fELF", "Bundled FFmpeg is not an ELF binary")
        byteorder = "little" if header[5] == 1 else "big"
        machine = int.from_bytes(header[18:20], byteorder)
        require(machine == {"x64": 62, "arm64": 183}[arch], "Incorrect FFmpeg architecture")
        desktop = root / "usr/share/applications" / package["desktopName"]
        entry = configparser.ConfigParser(interpolation=None)
        require(entry.read(desktop, encoding="utf-8"), "Missing DEB desktop entry")
        entry = entry["Desktop Entry"]
        require("x-scheme-handler/yayamsg" in entry.get("MimeType", "").split(";"), "Missing Linux yayamsg handler")
        require(entry.get("StartupWMClass") == package["desktopName"].removesuffix(".desktop"), "Desktop identity mismatch")
        command = shlex.split(entry["Exec"])
        require("%U" in command, "Desktop launcher does not forward deep links")
        executable(root / command[0].lstrip("/"))
        check_worker(root / command[0].lstrip("/"), ffmpeg.parent)
        icon_name = entry["Icon"]
        require(any(root.glob(f"usr/share/icons/hicolor/*/apps/{icon_name}.png")), "Missing installed Linux icon")
        print(f"Verified DEB, FFmpeg, desktop launcher, icon and yayamsg protocol: {installer.name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("windows", "macos", "linux"))
    parser.add_argument("--arch", choices=("x64", "arm64"), required=True)
    parser.add_argument("--dist", type=Path, default=Path("dist"))
    args = parser.parse_args()
    with (Path(__file__).resolve().parents[2] / "package.json").open(encoding="utf-8") as handle:
        package = json.load(handle)
    if args.platform == "windows":
        check_windows(args.dist, package)
    elif args.platform == "macos":
        check_macos(args.dist, args.arch)
    else:
        check_linux(args.dist, args.arch, package)


if __name__ == "__main__":
    main()
