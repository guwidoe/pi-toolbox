---
name: desloppify
description: >
  Run the desloppify code-quality workflow in a supervised way. Use when the
  user explicitly asks to run desloppify, improve the strict score, scan for
  technical debt with desloppify, or batch quality fixes from desloppify findings.
---

# Desloppify (Pi-supervised workflow)

Use this skill only when the user explicitly wants the **desloppify** workflow.

Your job is to improve the codebase honestly and maximize the **strict score** without gaming it.

This skill intentionally adds **user checkpoints** on top of desloppify's normal workflow.
Do **not** jump straight from scan to endless fixing. Pause at the defined checkpoints and get confirmation.

## Core Rules

- Optimize for the **strict** score, not the lenient score.
- Do not suppress, ignore, or mark things `wontfix` just because they are tedious, large, or inconvenient.
- Only mark issues as **false positive** when the tool is genuinely wrong.
- Only mark issues as **wontfix / permanent skip** when they are real findings but genuinely non-issues, intentional tradeoffs, or accepted debt the user agrees should stay.
- If something is a real problem but expensive, risky, or large, it should usually stay **open** and be planned/fixed — not swept away.
- Ask before excluding questionable directories from scanning.
- Report back at the required checkpoints before proceeding.

## What desloppify is doing

Desloppify is not just a scanner. It is a workflow:

**scan → review → triage → batch/plan → execute → rescan**

It combines:
- **objective/mechanical** analysis
- **subjective/reviewer** analysis
- planning/queueing
- iterative fixing via `desloppify next`

State persists in `.desloppify/`.

## Mandatory Questions Before First Scan

Before running the first scan, ask the user:

1. **Scan mode:**
   - `objective-only`
   - `full`

2. **If scan mode is `full`: what model should reviewer agents use?**
   - Remember this choice and use it consistently for the reviewer phase.
   - Keep reviewer agents isolated from prior score/target anchoring as much as possible.

If the target path is unclear, also ask what path to scan (`.` / `src/` / package dir / etc.).

## Setup and Installation

In this environment, prefer **`uv`** over raw `pip` when practical.

Examples:

```bash
# one-shot command style
uvx --from "desloppify[full]" desloppify --help

# if the tool is already installed globally
command -v desloppify
```

If the user explicitly wants the upstream install flow, this is also acceptable:

```bash
pip install --upgrade "desloppify[full]"
```

Because this is a custom Pi skill already, running `desloppify update-skill ...` is **optional**.
Use it only if the user specifically wants the upstream assistant-specific docs installed too.

## Required Setup Steps

Before scanning:

1. Ensure `.desloppify/` is in `.gitignore`.
2. **Proactively figure out which directories should be ignored before the first scan.** Do not wait for scan noise to discover them.
3. Inspect the repo structure and distinguish real source from non-source directories. In particular, look for:
   - vendor dirs
   - generated code
   - build output
   - dist / coverage / caches
   - downloaded test harnesses / editor bundles
   - benchmark snapshots / fixture mirrors / copied repo snapshots
   - worktrees
   - vendored SDKs
   - giant fixture bundles that are not real source
4. Use concrete evidence when deciding:
   - whether the directory is tracked source vs generated/downloaded/runtime state
   - whether it is edited by humans as part of the real codebase
   - whether it duplicates or mirrors other source trees
   - whether scanning it would mostly create noise rather than actionable findings
5. Useful checks include:
   - `git ls-files <dir>` or equivalent tracked-file inspection
   - checking whether the directory is build/download/cache output
   - checking whether it is regenerated from another source location
6. Exclude obvious junk before the first scan with:

```bash
desloppify exclude <path>
```

7. For anything questionable, **show the candidate to the user first** and ask before excluding it.
8. In the first post-scan report, explicitly mention which directories were pre-excluded and why.

## Scan Modes

### Objective-only mode

Use:

```bash
desloppify scan --path <target> --profile objective
```

This is the mechanical/objective path only.
Do **not** run reviewer agents in this mode unless the user later changes their mind.

### Full mode

Use:

```bash
desloppify scan --path <target> --profile full
```

Full mode means the workflow may later include subjective/reviewer scoring.
If reviewer work is needed, use the **user-selected reviewer model**.

## Checkpoint 1 — After Scan

Immediately after the first scan, **stop and report back**.

Your report should include:

- scan mode used
- scanned path
- exclusions applied
- any questionable exclusions that were not applied
- current scores visible from the scan/status output
  - overall
  - objective
  - strict
  - any especially notable dimension scores
- major issue themes
- whether subjective/reviewer work is still pending (if full mode)
- whether the queue looks noisy or clean

Then propose the next step clearly:

> Next I will manually review the scan results, separate real issues from false positives and genuine non-issues, and mark only truly justified findings as false-positive or wontfix.

Do **not** continue until the user confirms.

## Manual Review / Validity Triage Step

After the user approves the post-scan checkpoint, do a careful review pass over the findings.

Use commands like these as needed:

```bash
desloppify next
desloppify backlog
desloppify plan
desloppify plan queue
desloppify show --status open
desloppify show <pattern>
```

If full mode requires subjective review, complete that reviewer phase first or as part of this step, using the **chosen reviewer model**, then work from the updated results.

### Reviewer phase guidance (full mode)

- Keep reviewer work isolated from prior score anchoring.
- Use reviewer agents only for the subjective/review portion.
- Do not let reviewer agents inherit casual prior opinions about what the score "should" be.
- After review import, inspect the updated results before making disposition decisions.

### Disposition rules

Classify findings carefully:

1. **Real issue**
   - keep open
   - plan/fix later

2. **False positive**
   - tool is actually wrong
   - mark as false positive

3. **Genuine non-issue / accepted debt / intentional pattern**
   - real detection, but should not be fixed
   - mark as permanent skip / wontfix only with clear reasoning

Use the appropriate commands, for example:

```bash
# false positive
desloppify plan skip --false-positive "<id>" --attest "This is genuinely a false positive."

# genuine wontfix / accepted debt
desloppify plan skip --permanent "<id>" --note "<why this should remain>" --attest "This is a genuine non-issue or accepted debt, not score gaming."
```

Be conservative.

- Prefer leaving borderline items open.
- Do not bulk-mark things away just to improve the visible queue.
- If a finding is real but you are unsure whether it is worth fixing, surface that uncertainty to the user instead of force-classifying it.

## Checkpoint 2 — After Manual Review / Disposition Pass

When that pass is complete, **stop and report back again**.

Your report should include:

- what changed during the review phase
- whether reviewer agents were used and with which model
- how many findings were kept open
- how many were marked false positive
- how many were marked wontfix / permanent skip
- short justification themes for the dismissed findings
- any areas where you are unsure and want user judgment
- the updated state of the queue / scores if they changed

Then propose the next step clearly:

> Next I will turn the remaining real issues into implementation batches/clusters so they can be fixed coherently instead of one noisy item at a time.

Do **not** continue until the user confirms.

## Batching / Clustering / Planning Step

After approval, organize the remaining real work into implementation batches.

Desloppify supports planning and queue shaping. Use commands like:

```bash
desloppify plan
desloppify plan queue
desloppify plan reorder <pattern> top
desloppify plan cluster create <name>
desloppify plan focus <cluster>
```

If useful, also use triage/planning workflows surfaced by `next`, but keep the output understandable to the user.

A good batch should usually be one of:
- one coherent refactor theme
- one subsystem cleanup
- one detector/problem family across related files
- one dependency or architectural cleanup slice
- one test-health or error-handling sweep

Avoid batches that are:
- too tiny and fragmented
- too broad to execute safely
- mixed across unrelated concerns just because the tool listed them together

## Checkpoint 3 — After Batching / Planning

When batching is ready, **stop and report back again**.

Your report should include:

- the proposed batches/clusters
- what each batch is meant to accomplish
- rough size/risk of each batch
- recommended order
- any dependencies or likely blockers

Then propose the next step clearly:

> Next I will start fixing these batches one by one, following the execution queue and resolving items properly as each batch is completed.

Do **not** start fixing until the user confirms.

## Execution Phase — Only After Approval

Once the user approves execution, enter the normal loop:

```bash
desloppify next
# fix the issue(s)
# run the resolve command shown by desloppify
# repeat
```

Use `desloppify backlog` only when you need broader context beyond the current execution queue.

Fix properly, not minimally.

- Large refactors are allowed.
- Small details matter too.
- Rescan periodically when appropriate.
- Follow the queue, but still apply engineering judgment.

## Summary of Required Pauses

You must pause and report at these three checkpoints:

1. **After scan**
2. **After manual review / false-positive / wontfix pass**
3. **After implementation batches are created**

Only after the third user approval should you begin fixing batches.
