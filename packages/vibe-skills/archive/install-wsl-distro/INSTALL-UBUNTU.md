# Install vibe-setup in Ubuntu WSL Distro

## Task

Install the vibe-setup repository into the Ubuntu WSL distribution.

## Target Details

- **WSL Distribution**: `Ubuntu`
- **Target User**: `gwd`
- **Target Path**: `/home/gwd/repositories/vibe-setup`
- **Repository URL**: `https://github.com/guwidoe/vibe-setup.git`

## Steps

### 1. Verify the Ubuntu distro exists

```powershell
wsl -l -v
```

Confirm `Ubuntu` appears in the list.

### 2. Check if git is installed

```powershell
wsl -d Ubuntu -- git --version
```

If git is not installed, install it:
```powershell
wsl -d Ubuntu -- sudo apt update
wsl -d Ubuntu -- sudo apt install -y git
```

### 3. Create the repositories directory

```powershell
wsl -d Ubuntu -- mkdir -p /home/gwd/repositories
```

### 4. Clone vibe-setup

```powershell
wsl -d Ubuntu -- git clone https://github.com/guwidoe/vibe-setup.git /home/gwd/repositories/vibe-setup
```

### 5. Verify the installation

```powershell
wsl -d Ubuntu -- ls -la /home/gwd/repositories/vibe-setup
```

Expected output should show the vibe-setup files including `AGENTS.md`, `docs/`, `skills/`, etc.

### 6. (Optional) Run environment setup

Install common tools used by vibe-setup workflows:
```powershell
wsl -d Ubuntu -- bash /home/gwd/repositories/vibe-setup/scripts/setup-env.sh
```

### 7. (Optional) Add shell aliases

Append helpful aliases to bashrc:
```powershell
wsl -d Ubuntu -- bash -c "cat /home/gwd/repositories/vibe-setup/config-templates/bashrc-additions.sh >> ~/.bashrc"
```

## Quick One-Liner

If you want to do it all in one command:

```powershell
wsl -d Ubuntu -- bash -c "sudo apt update && sudo apt install -y git && mkdir -p ~/repositories && git clone https://github.com/guwidoe/vibe-setup.git ~/repositories/vibe-setup && ls -la ~/repositories/vibe-setup"
```

## Verification Checklist

After installation, confirm:
- [ ] `/home/gwd/repositories/vibe-setup` exists
- [ ] `AGENTS.md` is present
- [ ] `skills/` directory contains skill definitions
- [ ] `docs/` directory contains workflow documentation

## Next Steps

Once installed, any agent running in the Ubuntu distro can:
1. Reference `~/repositories/vibe-setup/AGENTS.md` for global conventions
2. Use skills from `~/repositories/vibe-setup/skills/`
3. Create project CLAUDE.md files that `@`-include the AGENTS.md
