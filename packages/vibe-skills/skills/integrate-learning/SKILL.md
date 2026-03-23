---
name: integrate-learning
description: >
  Apply a proposed learning to vibe-setup. Use when ready to update AGENTS.md,
  docs, or skills based on a learning file.
---

# Integrate Learning

Apply a learning from `learnings/` into the appropriate vibe-setup files.

## Process

### 1. Read the Learning

Read the learning file from `~/ralph-repos/vibe-setup/learnings/`.

Understand:
- What's the improvement?
- Where does it belong?
- Is it still relevant?

### 2. Validate

Before integrating, check:
- Does this duplicate existing content?
- Is it general enough for all projects? (If not, it belongs in a project's CLAUDE.md)
- Is the proposed change accurate?

### 3. Apply the Change

Based on category:

**AGENTS.md changes:**
- Keep it terse (telegraph style)
- Add to appropriate section
- Maintain existing formatting

**docs/ changes:**
- Update existing doc if topic covered
- Create new doc if new topic
- Include YAML front matter with `summary` and `read_when`

**pi-toolbox skill changes:**
- Create new directory under `~/ralph-repos/pi-toolbox/packages/vibe-skills/skills/`
- Add `SKILL.md` with standard front matter
- Keep focused on one task

**tools.md changes:**
- Add to existing tool section or create new one
- Include install command and usage examples

### 4. Move Learning to Integrated

After applying:

```bash
mv ~/ralph-repos/vibe-setup/learnings/file.md ~/ralph-repos/vibe-setup/learnings/integrated/
```

### 5. Summarize

Tell the user:
- What was changed
- Which file(s) were updated
- Any follow-up needed

## Example Integration

**Learning file says:**
> Update docs/tools.md tmux section to include -S flag

**Action:**
1. Read `docs/tools.md`
2. Find tmux section
3. Add -S flag example to capture-pane commands
4. Move learning to `learnings/integrated/`

## Don't

- Integrate without reading the full learning
- Make changes beyond what the learning proposes
- Delete learning files (move to `integrated/` instead)
- Integrate project-specific things into global files
