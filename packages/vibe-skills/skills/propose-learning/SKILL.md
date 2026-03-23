---
name: propose-learning
description: >
  Capture a workflow improvement for vibe-setup. Use when you discover a better
  pattern, missing doc, or fix while working on any project.
---

# Propose Learning

Capture a workflow improvement to feed back into vibe-setup.

## When to Use

- Discovered a better way to do something
- Found a missing doc that would help
- Created a reusable pattern worth sharing
- Fixed an incorrect or outdated instruction

## Process

### 1. Identify What Changed

What did you learn? Be specific:
- What was the old way / problem?
- What's the new way / solution?
- Why is it better?

### 2. Determine Where It Belongs

| Learning Type | Destination |
|---------------|-------------|
| Global convention change | `AGENTS.md` |
| New workflow pattern | `docs/` (new or existing file) |
| Reusable task prompt | `~/ralph-repos/pi-toolbox/packages/vibe-skills/skills/` (new skill) |
| Tool usage tip | `docs/tools.md` |
| WSL-specific | `docs/wsl-tips.md` |

### 3. Create the Learning File

Create a file in `~/ralph-repos/vibe-setup/learnings/`:

```markdown
# Learning: [Short description]

**Date**: [today]
**Project**: [where discovered]
**Category**: [agents|docs|skills|tools]

## Problem

[What was wrong or missing]

## Solution

[The improvement]

## Example

```
[Before/after or usage example]
```

## Proposed Change

[Which file(s) to update and how]
```

### 4. Filename Convention

`YYYY-MM-DD-short-description.md`

Example: `2025-01-26-better-tmux-capture.md`

## Example Learning

```markdown
# Learning: Better tmux output capture

**Date**: 2025-01-26
**Project**: api-gateway
**Category**: docs

## Problem

`tmux capture-pane -p` truncates long outputs. Docs didn't mention the -S flag.

## Solution

Use `tmux capture-pane -p -S -500` to capture last 500 lines.

## Example

```bash
# Before (truncated)
tmux capture-pane -p -t session

# After (full history)
tmux capture-pane -p -S -500 -t session
```

## Proposed Change

Update `docs/tools.md` tmux section to include -S flag examples.
```

## Don't

- Create learnings for project-specific things (those go in project's CLAUDE.md)
- Duplicate existing content
- Include sensitive data
