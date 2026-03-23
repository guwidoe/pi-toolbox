---
name: install-workflows
description: >
  Install vibe-setup workflows into a project. Read this when asked to
  "install vibe-setup", "set up workflows", or "integrate vibe-setup" into a repo.
---

# Install Workflows

Integrate vibe-setup into a project by creating two files:
- `CLAUDE.md` — references only (to global + local AGENTS.md)
- `AGENTS.md` — project-specific instructions

## Prerequisites

- vibe-setup repo exists at `~/ralph-repos/vibe-setup`
- Target project exists and you can explore it

## Installation Process

### 1. Explore the Project

Before writing anything, understand:

- **Stack**: What languages, frameworks, runtimes? (check package.json, Cargo.toml, go.mod, etc.)
- **Structure**: Where is source code? Tests? Config? Docs?
- **Build/Test**: What commands build, test, lint the project?
- **Conventions**: Any existing style guides, CONTRIBUTING.md, or patterns?
- **CI/CD**: GitHub Actions, other pipelines?

```bash
# Useful exploration
ls -la
cat package.json 2>/dev/null || cat Cargo.toml 2>/dev/null || cat go.mod 2>/dev/null
ls -la src/ 2>/dev/null
ls -la .github/workflows/ 2>/dev/null
```

### 2. Create CLAUDE.md (reference only)

Create a `CLAUDE.md` file in the project root with **only** local AGENTS.md reference:

```markdown
# CLAUDE.md

@AGENTS.md
```

That's it. No project info in CLAUDE.md.

### 3. Create AGENTS.md (refs vibe-setup + project info)

Create an `AGENTS.md` file in the project root. Start with vibe-setup reference, then project details:

```markdown
# AGENTS.md

@~/ralph-repos/vibe-setup/AGENTS.md

## Project: [name]

[One-line description]

## Stack

- [Language/runtime]
- [Framework]
- [Key dependencies]

## Structure

- `src/` — [what's here]
- `tests/` — [test location and framework]
- `[other key dirs]` — [purpose]

## Commands

```bash
# Install dependencies
[command]

# Build
[command]

# Test
[command]

# Lint
[command]

# Run dev server (if applicable)
[command]
```

## Key Files

- `[important-file]` — [why it matters]
- `[config-file]` — [what it configures]

## Notes

- [Gotchas, quirks, things to watch out for]
```

### 4. Adapt Based on Project Type

#### For TypeScript/Node projects
- Note package manager (npm/pnpm/yarn/bun)
- Check for tsconfig.json strictness settings
- Note test framework (jest/vitest/etc.)

#### For Rust projects
- Note workspace structure if applicable
- Check for clippy/rustfmt configs

#### For Python projects
- Note venv/poetry/pip setup
- Check for pytest/mypy configs

#### For monorepos
- Document workspace/package structure
- Note shared dependencies
- Explain how to work on specific packages

### 5. What NOT to Include

- Don't duplicate content from vibe-setup AGENTS.md (it's @-included)
- Don't add generic advice covered in vibe-setup docs
- Don't include sensitive info (API keys, credentials)
- Don't over-document — keep it scannable

### 6. Verify

After creating both files:

1. Read them back — does AGENTS.md give enough context to start working?
2. Try the build/test commands — do they work?
3. Are the key files accurate?

## Example

**CLAUDE.md:**
```markdown
# CLAUDE.md

@AGENTS.md
```

**AGENTS.md:**
```markdown
# AGENTS.md

@~/ralph-repos/vibe-setup/AGENTS.md

## Project: api-gateway

Express-based API gateway with JWT auth.

## Stack

- TypeScript + Node.js 20
- Express
- PostgreSQL + Prisma
- Jest for testing

## Structure

- `src/routes/` — API endpoints
- `src/middleware/` — Auth, logging, error handling
- `src/services/` — Business logic
- `prisma/` — Database schema

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm dev        # runs on :3000
```

## Notes

- Run `pnpm db:migrate` after schema changes
- JWT secret in .env.local (not committed)
```

## Updating Existing Projects

If the project already has a CLAUDE.md with content:

1. Move project-specific content to AGENTS.md
2. Replace CLAUDE.md with just the two @-references
3. Remove any content that duplicates vibe-setup AGENTS.md

## After Installation

The project is now integrated. When working on it:

- CLAUDE.md loads local AGENTS.md
- Local AGENTS.md loads vibe-setup AGENTS.md (nested @-include)
- vibe-setup AGENTS.md provides global workflows
- Local AGENTS.md provides project context
- Learnings can be proposed back to vibe-setup with `propose-learning` skill
