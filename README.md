# pi-toolbox

Monorepo for reusable pi packages.

## Packages

- `packages/web-search` — `web-search` skill (DuckDuckGo search + optional page content extraction)
- `packages/web-fetch` — `web-fetch` skill (fetch URL content as markdown with search fallback)
- `packages/clipboard-image` — cross-platform clipboard image paste extension (`Alt+V`, `paste-image`)
- `packages/prompt-timer` — persistent prompt timing extension (non-capturing overlay UI, no context message injection)
- `packages/openai-image` — OpenAI image-generation extension (`/image`, `openai_image` tool)
- `packages/vibe-skills` — personal workflow skills extracted from `vibe-setup`
- `packages/frontend-design` — OpenAI-based frontend design skill (`frontend-design-openai`)

## Install published plugins

Install any package directly from npm:

```bash
pi install npm:@guwidoe/pi-web-search
pi install npm:@guwidoe/pi-web-fetch
pi install npm:@guwidoe/pi-clipboard-image
pi install npm:@guwidoe/pi-prompt-timer
pi install npm:@guwidoe/pi-openai-image
pi install npm:@guwidoe/pi-vibe-skills
pi install npm:@guwidoe/pi-frontend-design
```

## Local development

```bash
npm install
```

Each package is a standalone pi package and can be published independently.
