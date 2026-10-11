#!/usr/bin/env bash
set -euo pipefail
widgets_project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
flatpak info com.obsproject.Studio >/dev/null
flatpak run --devel --socket=x11 --env=DISPLAY="${DISPLAY:-:0}" \
  --env=LD_LIBRARY_PATH=/app/lib --env=QT_PLUGIN_PATH=/app/lib/qt/plugins \
  --filesystem="$widgets_project_dir" \
  --filesystem="$HOME/.cargo" \
  --command=sh com.obsproject.Studio -c '
    set -eu
    export PATH=/usr/lib/sdk/rust-stable/bin:$PATH
    export CARGO_HOME="$2/.cargo"
    cd "$1"
    command -v cargo >/dev/null
    cmake -S . -B build_flatpak -G Ninja -DCMAKE_PREFIX_PATH=/app -DCMAKE_BUILD_TYPE=RelWithDebInfo -DENABLE_CCACHE=OFF
    cmake --build build_flatpak -j4
    ctest --test-dir build_flatpak --output-on-failure
    cmake --install build_flatpak --prefix "$1/build_flatpak/stage"
  ' sh "$widgets_project_dir" "$HOME"
widgets_libdir="$(sed -n 's/^CMAKE_INSTALL_LIBDIR:PATH=//p' "$widgets_project_dir/build_flatpak/CMakeCache.txt")"
widgets_install_dir="$HOME/.var/app/com.obsproject.Studio/config/obs-studio/plugins/obs-tiktok-widgets"
mkdir -p "$widgets_install_dir/bin/64bit" "$widgets_install_dir/data"
python3 "$widgets_project_dir/tools/install-staged.py" "$widgets_project_dir/build_flatpak/stage" "$widgets_libdir" "$widgets_install_dir"
flatpak run --command=python3 com.obsproject.Studio -c '
import ctypes, os
path = os.path.join(os.environ["XDG_CONFIG_HOME"], "obs-studio/plugins/obs-tiktok-widgets/bin/64bit/obs-tiktok-widgets.so")
ctypes.CDLL(path, mode=os.RTLD_NOW)
print("Installed plugin loads successfully in the OBS Flatpak runtime:", path)
'
printf 'Restart OBS, then open Docks → TikTok LIVE Widgets.\n'
