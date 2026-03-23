---
name: oracle
description: >
  Use oracle-style prompting to get a second-model review for debugging,
  refactors, design checks, or cross-validation. Bundle context + prompt
  for one-shot analysis.
---

# Oracle Pattern

Bundle your prompt + relevant files for a second-model review. Useful for debugging, refactors, design checks, or when stuck.

## When to Use

- Stuck on a bug after multiple attempts
- Need architectural review
- Want cross-validation of approach
- Complex refactoring decisions
- Security or performance audit

## Core Principle

The reviewing model starts with **zero** project knowledge. Include everything needed to understand the problem:

1. **Project briefing**: Stack, build/test commands, platform constraints
2. **Where things live**: Key directories, entrypoints, config files
3. **Exact question**: What you tried, the error (verbatim)
4. **Constraints**: "don't change X", "must keep public API", "perf budget"
5. **Desired output**: "return patch plan", "list risky assumptions", "give 3 options with tradeoffs"

## Prompt Template

```markdown
# Context

Project: [name] - [one-liner description]
Stack: [TypeScript/Node.js, React, PostgreSQL, etc.]
Build: `pnpm build`
Test: `pnpm test`

## Directory Structure

src/
├── api/        # Backend endpoints
├── ui/         # React components
├── lib/        # Shared utilities
└── types/      # TypeScript types

## Problem

[Describe the issue clearly]

### What I Tried

1. [First attempt and result]
2. [Second attempt and result]

### Error Message

```
[Exact error, verbatim]
```

## Relevant Files

### src/api/auth.ts
```typescript
[file contents]
```

### src/lib/token.ts
```typescript
[file contents]
```

## Question

[Specific question you want answered]

## Constraints

- Must maintain backwards compatibility
- Cannot change the public API
- Performance budget: <100ms response time

## Desired Output

Please provide:
1. Root cause analysis
2. Recommended fix with code
3. Any risks or edge cases to consider
```

## File Selection Strategy

- Include **fewest files** that contain the truth
- Prioritize: entrypoints, config, the buggy module, related tests
- Exclude: generated files, node_modules, large binaries
- Max ~150k tokens of context for good results

## Using with Claude

### Via Claude Code CLI

```bash
# Prepare context file
cat > /tmp/oracle-prompt.md << 'EOF'
[Your oracle prompt here]
EOF

# Include relevant source files
cat src/api/auth.ts >> /tmp/oracle-prompt.md
cat src/lib/token.ts >> /tmp/oracle-prompt.md

# Send to Claude
cat /tmp/oracle-prompt.md | claude --print
```

### Via separate chat session

1. Open new Claude conversation
2. Paste the oracle prompt
3. Review response
4. Apply suggestions back in your main session

## Safety

- Don't include secrets (`.env`, API keys, tokens)
- Redact sensitive data
- Share only what's required for the review
