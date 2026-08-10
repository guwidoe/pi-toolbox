#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh --windows-user USERNAME [--bin-dir DIR]

Copies the Windows broker into the selected Windows profile and installs the
pi-browser WSL command. The Windows scheduled task is installed separately by
running Install.cmd from Windows.
EOF
}

windows_user="${PI_WINDOWS_USER:-}"
bin_dir="${HOME}/.local/bin"

while (($#)); do
  case "$1" in
    --windows-user)
      windows_user="${2:-}"
      shift 2
      ;;
    --bin-dir)
      bin_dir="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$windows_user" ]]; then
  printf 'Specify --windows-user or set PI_WINDOWS_USER.\n' >&2
  exit 2
fi

windows_profile="/mnt/c/Users/${windows_user}"
if [[ ! -d "$windows_profile" ]]; then
  printf 'Windows profile not found: %s\n' "$windows_profile" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(cd -- "$script_dir/.." && pwd)"
asset_dir="$skill_dir/assets/windows"
bridge_dir="$windows_profile/.pi-agent-browser"

required=(BrowserBridge.ps1 Install.ps1 Uninstall.ps1 Install.cmd Uninstall.cmd README.md)
for file in "${required[@]}"; do
  if [[ ! -f "$asset_dir/$file" ]]; then
    printf 'Missing package asset: %s\n' "$asset_dir/$file" >&2
    exit 1
  fi
done

mkdir -p "$bridge_dir" "$bin_dir"
for file in "${required[@]}"; do
  install -m 0644 "$asset_dir/$file" "$bridge_dir/$file"
done
install -m 0755 "$script_dir/pi-browser" "$bin_dir/pi-browser"

printf 'Installed Windows browser bridge files in:\n  C:\\Users\\%s\\.pi-agent-browser\n' "$windows_user"
printf 'Installed WSL command:\n  %s/pi-browser\n\n' "$bin_dir"
printf 'Next, double-click Install.cmd in the Windows bridge directory.\n'
printf 'After it succeeds, run "wsl --shutdown" from Windows PowerShell once.\n'
