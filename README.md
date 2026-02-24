# pi-toolbox

Monorepo for reusable pi packages.

## Packages

- `packages/web-search` — `web-search` skill (DuckDuckGo search + optional page content extraction)
- `packages/web-fetch` — `web-fetch` skill (fetch URL content as markdown with search fallback)
- `packages/clipboard-image` — cross-platform clipboard image paste extension (`Alt+V`, `paste-image`)

## Local development

```bash
npm install
```

Each package is a standalone pi package and can be published independently.
