#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# Keep Godot's runtime files in writable directories in the cloud sandbox.
export XDG_CACHE_HOME=/workspace/.cache/mellstroy-stars
export XDG_DATA_HOME=/workspace/.local/share/mellstroy-stars
export XDG_CONFIG_HOME=/workspace/.config/mellstroy-stars
mkdir -p "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME"

exec godot --path "$project_root" "$@"
