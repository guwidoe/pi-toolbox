---
name: web-search
description: "Web search and optional result-page content extraction. Use for finding docs, articles, references, and factual information from the web."
---

# Web Search

Web search via DuckDuckGo and page content extraction via Readability.

## Setup

Install dependencies (run once):
```bash
cd {baseDir} && npm install
```

## Search the Web

```bash
node {baseDir}/search.js "query"                          # Basic search (5 results)
node {baseDir}/search.js "query" -n 10                    # More results
node {baseDir}/search.js "query" --content                # Include page content as markdown
node {baseDir}/search.js "query" --freshness w            # Results from past week
node {baseDir}/search.js "query" --region de-de           # Results from Germany
node {baseDir}/search.js "query" -n 3 --content           # Combined options
```

### Options

- `-n <num>` — Number of results (default: 5)
- `--content` — Fetch each result page and include readable content as markdown
- `--region <code>` — DuckDuckGo region code (e.g. `us-en`, `de-de`, `uk-en`, `fr-fr`)
- `--freshness <period>` — Filter by time:
  - `d` — Past day
  - `w` — Past week
  - `m` — Past month
  - `y` — Past year
