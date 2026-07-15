# pi-toolbox

Monorepo for reusable pi packages.

## Packages

- `packages/web-search` — `web-search` skill (DuckDuckGo search + optional page content extraction)
- `packages/web-fetch` — `web-fetch` skill (fetch URL content as markdown with search fallback)
- `packages/clipboard-image` — cross-platform clipboard image paste extension (`Alt+V`, `paste-image`)
- `packages/prompt-timer` — persistent prompt timing extension (default status UI, optional overlay, no context message injection)
- `packages/openai-image` — OpenAI image-generation extension (`/image`, `openai_image` tool)
- `packages/desloppify-workflow` — persistent workflow + cost-control extension for supervised desloppify runs
- `packages/vibe-skills` — personal workflow skills extracted from `vibe-setup`
- `packages/frontend-design` — OpenAI-based frontend design skill (`frontend-design`, override-ready)

## Install published plugins

Install any package directly from npm:

```bash
pi install npm:@guwidoe/pi-web-search
pi install npm:@guwidoe/pi-web-fetch
pi install npm:@guwidoe/pi-clipboard-image
pi install npm:@guwidoe/pi-prompt-timer
pi install npm:@guwidoe/pi-openai-image
pi install npm:@guwidoe/pi-desloppify-workflow
pi install npm:@guwidoe/pi-vibe-skills
pi install npm:@guwidoe/pi-frontend-design
```

## Shared external packages

The tracked shared pi configuration in `vibe-setup` installs `offline-ant/pi-ant` with its root resources filtered out, then loads the checkout's `tmux-tools` subpackage through a relative local package entry. Keep the git checkout entry before the local subpackage entry so first-run package resolution installs the checkout before loading `tmux-tools`.

Do not restore the archived `offline-ant/pi-tmux` or `offline-ant/pi-semaphore` packages. Their legacy `minitask` renderer ignored the TUI width contract; the maintained successor wraps rendered arguments to the available width.

## Local development

```bash
npm install
```

Each package is a standalone pi package and can be published independently.
