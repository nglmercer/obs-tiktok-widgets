"""Atomically replace plugin files, preserving libraries mapped by running OBS."""
import os
from pathlib import Path
import shutil
import sys
import tempfile

stage, libdir, destination = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])

def replace(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".widgets-", dir=target.parent)
    os.close(fd)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

for name in ("obs-tiktok-widgets.so", "libttl_live.so"):
    replace(stage / libdir / "obs-plugins" / name, destination / "bin/64bit" / name)
if (stage / "bin/widgetstudio").is_file():
    replace(stage / "bin/widgetstudio", destination / "bin/64bit/widgetstudio")
if (stage / "bin/widgetctl").is_file():
    replace(stage / "bin/widgetctl", destination / "bin/64bit/widgetctl")
if (stage / "bin/widgetctl-flatpak.sh").is_file():
    replace(stage / "bin/widgetctl-flatpak.sh", destination / "bin/64bit/widgetctl-flatpak.sh")
assets = stage / "share/obs/obs-plugins/obs-tiktok-widgets"
for source in assets.rglob("*"):
    if source.is_file():
        replace(source, destination / "data" / source.relative_to(assets))
print("Installed plugin files atomically; restart OBS to load the update.")
