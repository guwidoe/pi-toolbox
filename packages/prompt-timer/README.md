# @guwidoe/pi-prompt-timer

Prompt timer extension for pi.

## Features

- Persists per-run timing as custom session entries (`custom`, not `custom_message`)
- Does not inject context/chat messages into the model conversation
- Default UI is a **non-capturing overlay** (top-right, offset downward to avoid pinned prompt UI) while the agent is running, then falls back to a minimal footer status when idle
- Optional footer-status mode if you prefer a text-only indicator
- `/prompt-timer-stats` command for quick branch-level totals

## Install

```bash
pi install npm:@guwidoe/pi-prompt-timer
```

## Usage

```bash
# default: persistence on + non-capturing overlay UI on
pi

# disable timer UI entirely
pi --no-prompt-timer-ui

# use footer status mode instead of overlay
pi --prompt-timer-ui --prompt-timer-ui-mode status

# disable persistence
pi --no-prompt-timer-persist
```

Notes:
- Timing data is saved as `custom` entries (not sent to the LLM).
- `/tree` hides custom entries by default; they appear only in “show all” mode (`Ctrl+O`).
- Toggle timer UI visibility at any time with `Alt+Shift+T`.

## Included extension

- `prompt-timer`
- command: `/prompt-timer-stats`
- command: `/prompt-timer-toggle`
- shortcut: `Alt+Shift+T`
