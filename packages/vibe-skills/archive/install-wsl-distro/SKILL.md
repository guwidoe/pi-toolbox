---
name: install-wsl-distro
description: >
  Install vibe-setup into another WSL distribution. Read this when asked to
  "install vibe-setup in another distro", "set up vibe-setup on [distro name]",
  or "replicate vibe-setup to another WSL".
---

# Install vibe-setup in Another WSL Distribution

Set up vibe-setup in a different WSL distribution so agents running there have access to the same workflows.

## Prerequisites

- vibe-setup exists at `~/ralph-repos/vibe-setup` in current distro
- Target WSL distribution is installed
- Git is available in the target distro

## Process

### 1. List Available WSL Distributions

```bash
wsl.exe -l -v
```

Identify the target distribution name (e.g., `Ubuntu-22.04`, `Debian`, etc.).

### 2. Verify Target Distro Has Git

```bash
wsl.exe -d <distro-name> -- git --version
```

If git is not installed:
```bash
wsl.exe -d <distro-name> -- sudo apt update
wsl.exe -d <distro-name> -- sudo apt install -y git
```

### 3. Create Directory Structure

```bash
wsl.exe -d <distro-name> -- mkdir -p ~/ralph-repos
```

### 4. Clone vibe-setup

Clone from the remote repository:
```bash
wsl.exe -d <distro-name> -- git clone https://github.com/guwidoe/vibe-setup.git ~/ralph-repos/vibe-setup
```

### 5. Run Environment Setup (Optional)

If you want the same tools available:
```bash
wsl.exe -d <distro-name> -- bash ~/ralph-repos/vibe-setup/scripts/setup-env.sh
```

### 6. Set Up Shell Configuration (Optional)

Apply bashrc additions for helpful aliases:
```bash
wsl.exe -d <distro-name> -- bash -c 'cat ~/ralph-repos/vibe-setup/config-templates/bashrc-additions.sh >> ~/.bashrc'
```

### 7. Verify Installation

```bash
wsl.exe -d <distro-name> -- ls -la ~/ralph-repos/vibe-setup
wsl.exe -d <distro-name> -- cat ~/ralph-repos/vibe-setup/AGENTS.md | head -20
```

## Alternative: Symlink (Shared Copy)

If you want both distros to share the same files (edits visible in both):

```bash
# Create symlink to access via Windows interop path
wsl.exe -d <distro-name> -- mkdir -p ~/ralph-repos
wsl.exe -d <distro-name> -- ln -s "//wsl.localhost/$(wsl.exe -l -q | head -1 | tr -d '\r\n')/home/ralph/ralph-repos/vibe-setup" ~/ralph-repos/vibe-setup
```

Note: Cross-distro symlinks have performance overhead. Cloning is preferred.

## Keeping in Sync

With the clone approach, pull updates periodically:
```bash
wsl.exe -d <distro-name> -- git -C ~/ralph-repos/vibe-setup pull
```

Or set up a cron job in the target distro:
```bash
wsl.exe -d <distro-name> -- bash -c '(crontab -l 2>/dev/null; echo "0 9 * * * cd ~/ralph-repos/vibe-setup && git pull") | crontab -'
```

## Quick One-Liner

For a quick setup with defaults:

```bash
DISTRO="<distro-name>" && wsl.exe -d $DISTRO -- bash -c 'sudo apt update && sudo apt install -y git && mkdir -p ~/ralph-repos && git clone https://github.com/guwidoe/vibe-setup.git ~/ralph-repos/vibe-setup'
```

## Troubleshooting

### "Command not found: wsl.exe"
You're not in WSL. Run these commands from within a WSL terminal.

### Permission denied
The target distro may need the user created first. Launch it manually once:
```bash
wsl.exe -d <distro-name>
```

### Slow cross-distro file access
This is expected with Windows interop paths. Use the clone approach instead of symlinks.
