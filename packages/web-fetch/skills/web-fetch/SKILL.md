---
name: web-fetch
description: "Fetch a URL and extract readable markdown content. Automatically falls back to web search if direct fetch fails."
---

# Web Fetch

Fetches a webpage URL and returns cleaned markdown content.

## Setup

Install dependencies (run once):
```bash
cd {baseDir} && npm install
```

## Fetch a Web Page

```bash
node {baseDir}/content.js <url>
node {baseDir}/content.js <url> --no-fallback
```

Use this when you already have a URL and want to read its contents.

If direct fetch/extraction fails, the tool will perform a web search fallback based on the URL (unless `--no-fallback` is used).
