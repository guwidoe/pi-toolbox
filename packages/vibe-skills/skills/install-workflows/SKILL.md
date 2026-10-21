---
name: install-workflows
description: >
  Install vibe-setup workflows into a project. Read this when asked to
  "install vibe-setup", "set up workflows", or "integrate vibe-setup" into a repo.
---

# Install Workflows

Integrate vibe-setup into a project. A project has exactly one instruction file,
`AGENTS.md`, with project-specific content only. No `CLAUDE.md` and no include
line: the shared conventions (`~/repos/personal/vibe-setup/AGENTS.md`) load
globally for every agent on the machine (Claude Code, Codex, pi), wired by
`~/repos/personal/vibe-setup/scripts/install-global-agents.sh`. Claude Code reads
a project `AGENTS.md` natively as long as the repo has no `CLAUDE.md`.

## Prerequisites

- vibe-setup repo exists at `~/repos/personal/vibe-setup`
- The machine is wired: `~/.codex/AGENTS.md` is a link to vibe-setup's
  `AGENTS.md`. If not, run `~/repos/personal/vibe-setup/scripts/install-global-agents.sh`.
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

### 2. Create AGENTS.md (project info only)

Create an `AGENTS.md` file in the project root. The area and its knowledge repo
follow from the path (`~/repos/<area>/<repo>`); mention knowledge pages only when
they matter specifically to this project.

```markdown
# AGENTS.md

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

### 3. Adapt Based on Project Type

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

### 4. What NOT to Include

- Don't duplicate content from vibe-setup AGENTS.md (it loads globally)
- No `CLAUDE.md`, no `@~/repos/personal/vibe-setup/AGENTS.md` line
- Don't add generic advice covered in vibe-setup docs
- Don't include sensitive info (API keys, credentials)
- Don't over-document — keep it scannable

### 5. Verify

After creating the file:

1. Read them back — does AGENTS.md give enough context to start working?
2. Try the build/test commands — do they work?
3. Are the key files accurate?

## Example

**AGENTS.md:**
```markdown
# AGENTS.md

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

If the project still has the old two-file pattern:

1. Move any project-specific content from `CLAUDE.md` into `AGENTS.md`, then
   delete `CLAUDE.md` (a stub that only says `@AGENTS.md` can just go).
2. Remove the `@~/repos/personal/vibe-setup/AGENTS.md` line from `AGENTS.md`.
3. Remove any content that duplicates vibe-setup AGENTS.md.
4. Commit only those files.

## After Installation

The project is now integrated. When working on it:

- Every agent loads vibe-setup AGENTS.md globally (shared conventions and
  Guido's system) and the project's AGENTS.md (project context)
- Learnings can be proposed back to vibe-setup with `propose-learning` skill
