---
name: sync-cc-plugins
description: >
  Sync Claude Code plugins across machines. Read this when asked to
  "sync plugins", "install my plugins", "set up claude code plugins",
  or "sync cc plugins".
---

# Sync Claude Code Plugins

Install the curated list of Claude Code plugins from vibe-setup.

## Plugin List Location

The curated plugin list is at:
```
~/repositories/vibe-setup/config-templates/claude-plugins.json
```

## Installation Process

### 1. Add Required Marketplaces

First, add the non-default marketplaces:

```bash
# Cartographer marketplace (for codebase mapping)
claude plugin marketplace add kingbootoshi/cartographer

# Planning with files marketplace
claude plugin marketplace add OthmanAdi/planning-with-files
```

The official Anthropic marketplace (`claude-plugins-official`) is included by default.

### 2. Install Plugins

Install each plugin from the curated list:

```bash
# Core utilities
claude plugin install superpowers@claude-plugins-official

# LSP integrations
claude plugin install typescript-lsp@claude-plugins-official
claude plugin install rust-analyzer-lsp@claude-plugins-official

# Automation
claude plugin install playwright@claude-plugins-official
claude plugin install ralph-loop@claude-plugins-official

# Codebase tools
claude plugin install cartographer@cartographer-marketplace

# Planning
claude plugin install planning-with-files@planning-with-files
```

### 3. Enable All Plugins

Plugins should be enabled by default after install. Verify with:

```bash
claude plugin list
```

If any are disabled, enable them:

```bash
claude plugin enable <plugin-name>
```

## One-Liner Installation

Run all installations at once:

```bash
claude plugin marketplace add kingbootoshi/cartographer && \
claude plugin install superpowers@claude-plugins-official && \
claude plugin install typescript-lsp@claude-plugins-official && \
claude plugin install rust-analyzer-lsp@claude-plugins-official && \
claude plugin install playwright@claude-plugins-official && \
claude plugin install ralph-loop@claude-plugins-official && \
claude plugin install cartographer@cartographer-marketplace && \
claude plugin marketplace add OthmanAdi/planning-with-files && \
claude plugin install planning-with-files@planning-with-files
```

## Plugin Descriptions

| Plugin | Purpose |
|--------|---------|
| **superpowers** | Extended capabilities and utilities |
| **typescript-lsp** | TypeScript/JavaScript code intelligence via LSP |
| **rust-analyzer-lsp** | Rust code intelligence via rust-analyzer |
| **playwright** | Browser automation for testing and scraping |
| **ralph-loop** | Autonomous agent workflow loop |
| **cartographer** | Codebase mapping and documentation generator |
| **planning-with-files** | File-based planning workflow for complex tasks |

## Updating Plugins

To update all plugins to latest versions:

```bash
claude plugin update superpowers@claude-plugins-official
claude plugin update typescript-lsp@claude-plugins-official
claude plugin update rust-analyzer-lsp@claude-plugins-official
claude plugin update playwright@claude-plugins-official
claude plugin update ralph-loop@claude-plugins-official
claude plugin update cartographer@cartographer-marketplace
claude plugin update planning-with-files@planning-with-files
```

## Adding New Plugins to the Curated List

When you find a useful plugin:

1. Edit `~/repositories/vibe-setup/config-templates/claude-plugins.json`
2. Add the marketplace if it's not already listed
3. Add the plugin with its ID and description
4. Commit and push to sync across machines

## Cross-WSL Installation

To install plugins in another WSL distro:

```bash
wsl.exe -d <distro> -- claude plugin marketplace add kingbootoshi/cartographer
wsl.exe -d <distro> -- claude plugin install superpowers@claude-plugins-official
# ... etc
```

Or use the `install-wsl-distro` skill first to set up vibe-setup, then run this skill there.
