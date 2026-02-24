# @guwidoe/pi-clipboard-image

Cross-platform clipboard image extension for pi.

## Features

- `Alt+V` shortcut to paste clipboard image into the prompt as `@<temp-file>.png`
- `paste-image` command for manual triggering
- Saves clipboard images as PNG and caps max dimension to 2000px
- Multiple backends:
  - Windows: PowerShell clipboard API
  - Linux: Wayland (`wl-paste`) or X11 (`xclip`) + ImageMagick (`convert`)
  - macOS: `pngpaste` (optionally `sips` for resizing)

## Install

```bash
pi install npm:@guwidoe/pi-clipboard-image
```

## Platform notes

- **Windows**: works in native Windows pi sessions.
- **Linux/WSL**: requires clipboard tooling (`wl-paste` or `xclip`) and ImageMagick.
- **macOS**: requires `pngpaste` (`brew install pngpaste`).
