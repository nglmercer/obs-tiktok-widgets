#!/usr/bin/env bash
# Enter the running OBS sandbox so its private local socket is reachable.
set -euo pipefail
instance=""
while read -r candidate app; do
  if [[ "$app" == com.obsproject.Studio ]]; then
    if [[ -n "$instance" ]]; then
      printf '%s\n' 'Multiple OBS sandboxes are running; use flatpak enter INSTANCE widgetctl explicitly.' >&2
      exit 2
    fi
    instance="$candidate"
  fi
done < <(flatpak ps --columns=instance,application)
binary="${WIDGETCTL_FLATPAK_BINARY:-$HOME/.var/app/com.obsproject.Studio/config/obs-studio/plugins/obs-tiktok-widgets/bin/64bit/widgetctl}"
if [[ -n "$instance" ]]; then
  exec flatpak enter "$instance" env LD_LIBRARY_PATH=/app/lib LANG=C.UTF-8 XDG_CONFIG_HOME="$HOME/.var/app/com.obsproject.Studio/config" "$binary" "$@"
fi
exec flatpak run --command="$binary" --env=LD_LIBRARY_PATH=/app/lib com.obsproject.Studio "$@"
