---
name: create-cli
description: >
  Design command-line interface parameters and UX: arguments, flags, subcommands,
  help text, output formats, error messages, exit codes, prompts, config/env
  precedence, and safe/dry-run behavior.
---

# Create CLI

Design CLI surface area (syntax + behavior), human-first, script-friendly.

## Clarify First

Ask, then proceed with best-guess defaults:

- Command name + one-sentence purpose.
- Primary user: humans, scripts, or both.
- Input sources: args vs stdin; files vs URLs; secrets (never via flags).
- Output contract: human text, `--json`, `--plain`, exit codes.
- Interactivity: prompts allowed? need `--no-input`? confirmations for destructive ops?
- Config model: flags/env/config-file; precedence.
- Platform: Linux/Windows/cross-platform; single binary vs runtime.

## Deliverables

Produce a compact spec:

1. Command tree + USAGE synopsis
2. Args/flags table (types, defaults, required/optional, examples)
3. Subcommand semantics (what each does; idempotence; state changes)
4. Output rules: stdout vs stderr; TTY detection; `--json`/`--plain`; `--quiet`/`--verbose`
5. Error + exit code map (top failure modes)
6. Safety rules: `--dry-run`, confirmations, `--force`, `--no-input`
7. Config/env rules + precedence (flags > env > project config > user config)
8. 5–10 example invocations

## Default Conventions

- `-h/--help` always shows help and ignores other args.
- `--version` prints version to stdout.
- Primary data to stdout; diagnostics/errors to stderr.
- Add `--json` for machine output; consider `--plain` for stable line-based text.
- Prompts only when stdin is a TTY; `--no-input` disables prompts.
- Destructive operations: interactive confirmation + `--force` for non-interactive.
- Respect `NO_COLOR`, `TERM=dumb`; provide `--no-color`.
- Handle Ctrl-C: exit fast; bounded cleanup.

## CLI Spec Template

```markdown
# mycmd

One-liner description.

## USAGE

mycmd [global flags] <subcommand> [args]

## Subcommands

- `mycmd init` — Initialize configuration
- `mycmd run <target>` — Execute target

## Global Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `-h, --help` | bool | false | Show help |
| `--version` | bool | false | Show version |
| `-q, --quiet` | bool | false | Suppress output |
| `-v, --verbose` | bool | false | Verbose output |
| `--json` | bool | false | JSON output |

## Exit Codes

- `0` — Success
- `1` — Generic failure
- `2` — Invalid usage/arguments

## Environment Variables

- `MYCMD_CONFIG` — Config file path
- `MYCMD_LOG_LEVEL` — Log verbosity

## Config Precedence

flags > env > project `.mycmdrc` > user `~/.mycmdrc`

## Examples

# Basic usage
mycmd run build

# With options
mycmd run --verbose --json build

# Dry run
mycmd deploy --dry-run production
```

## Reference

Full guidelines: https://clig.dev/
