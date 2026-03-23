---
name: agentic-architecture-review
description: >
  Review the current repo or workspace architecture against the consolidated
  Agentic Engineering Principles, present a concise human review, then create
  pi todos for approved alignment work.
---

# Agentic Architecture Review

Use this when asked to review the current repo/workspace against the consolidated principles and turn the result into actionable architecture work.

## Canonical Principles

Read this file first, completely:

- `/home/ralph/ralph-repos/vibe-setup/docs/reference/principles/AGENTIC_ENGINEERING_PRINCIPLES.md`

Treat it as the review rubric.

## Goal

Do a high-signal architecture review of whatever repo/workspace you are currently working in, then:

1. produce a concise human-review summary,
2. wait for approval,
3. create pi todos for the approved architecture-alignment work.

Use the strongest available model / highest-effort reasoning available for the audit.

## Scope

Default scope: the current working repo/workspace.

- If the user names a specific project/package/path, use that.
- If working inside a monorepo, review the most relevant package/app plus the cross-cutting architecture around it.
- If scope is genuinely unclear, ask one short clarification question.

## What to Review

Focus on architecture, not superficial cleanup.

Look for things like:

- system boundaries
- control surfaces vs UI-only flows
- explicit contracts and schemas
- config vs hidden behavior
- observability and inspectability
- docs/reality alignment
- extensibility shape
- testability of architectural invariants
- single sources of truth vs drift
- permissions / safety boundaries
- truthfulness of errors, states, and outputs

Ignore style nits, minor cleanup, and low-level refactors unless they materially block architectural alignment.

## Process

### 1. Understand the current system

Inspect enough of the current repo/workspace to understand the architectural shape.

Read the most relevant artifacts first, for example:

- `AGENTS.md`, `CLAUDE.md`, `README.md`
- package manifests / workspace manifests
- top-level app/service directories
- API, CLI, worker, schema, config, and test entrypoints
- architecture docs if present

Do not try to read everything. Sample strategically until the major structure is clear.

### 2. Compare against the principles

Find the strongest architectural mismatches.

Prefer:

- concrete evidence from the repo
- high-confidence findings
- issues with real architectural impact

Avoid speculative criticism.

### 3. Produce a concise human summary

Write a concise summary for review.

Target length:

- small repo: ~0.5-1 page
- medium/large repo: ~1-2 pages max

The summary should be decision-oriented, not an essay.

Include only:

- current architectural shape
- top findings (usually 3-7)
- why they matter
- recommended direction
- proposed todo themes / priorities
- key assumptions or open questions

Do not dump excessive technical detail unless needed to justify a recommendation.

### 4. Ask for approval before creating todos

After the summary, ask the human which items to turn into todos.

Default behavior: do **not** create todos until the user approves.

If the user explicitly asks to skip approval and create them directly, you may proceed.

### 5. Create pi todos for approved work

Use the pi todo system to create the approved architecture tasks.

Guidelines:

- usually create 3-10 todos, not a giant backlog
- one todo per concrete architecture work item
- keep titles short and action-oriented
- avoid duplicates with existing open todos
- keep bodies concise but useful

Each todo should capture:

- the architectural issue
- why it matters relative to the principles
- concrete evidence from the repo/workspace
- the desired architectural outcome
- a practical first step

Prefer architecture outcomes over implementation micromanagement.

## Output Style

- concise
- evidence-based
- architecture-focused
- high signal
- no proposal bloat

## Default Summary Shape

Use this lightweight structure unless a better format is clearly better:

### Architecture review
- Current shape: ...
- Main gaps: ...
- Recommended direction: ...
- Proposed todo themes: ...
- Open questions: ...

Then ask:

- Approve all?
- Approve only specific items?
- Revise the plan first?

## Success Condition

Success means:

1. the current repo/workspace was reviewed against the canonical principles,
2. the human received a concise architecture summary,
3. approved items were converted into pi todos.
