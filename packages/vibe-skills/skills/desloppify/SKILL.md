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

## Workflow Extension Integration

If the `desloppify_workflow` tool is available, use it as the authoritative workflow state tracker.

Important:

- The **tool** is agent-callable.
- The `/desloppify-workflow ...` **command** is user-facing.
- If you can do the work through the tool yourself, do **not** tell the user to type workflow commands manually.

- After collecting the user's initial answers, call it to **start** the run with the chosen mode, target path, reviewer settings, and cost policy.
- Default to a cost-conscious execution posture unless the user says otherwise:
  - `executionPolicy=cheap`
  - `rescanPolicy=batch-boundary` (or stricter)
  - `retriagePolicy=if-invalidated`
  - `expensivePlanningAllowed=false`
- Update the stored **phase** whenever you move into a new major phase.
- Record the approved execution cluster/batch plan as the workflow's **approved plan baseline** before execution.
- Treat that baseline as authoritative during execution unless it is explicitly invalidated.
- Do **not** run expensive runner-backed planning (`desloppify ... --run-stages`, `--runner ...`) unless the user explicitly approved it and the workflow state was updated accordingly.
- Keep reviewer model/thinking settings current there rather than relying on memory.
- When the run is genuinely finished, call it to **complete** the run so per-turn workflow injections stop.

### Resume/bootstrap rule

If the user asks to **continue / resume** an existing desloppify run, and the `desloppify_workflow` tool is available but no workflow state is active yet:

1. **Bootstrap the workflow state yourself via the tool. Do not ask the user to run `/desloppify-workflow ...` commands.**
2. Infer the most likely current phase from the session and `.desloppify/` evidence.
3. If scan/review/batching are already complete and the user wants to keep fixing, resume at **`execution`**.
4. Recreate the stored policy in a cost-conscious way unless the user says otherwise:
   - `executionPolicy=cheap`
   - `rescanPolicy=batch-boundary` or stricter if the user clearly wants fewer rescans
   - `retriagePolicy=if-invalidated` or stricter if the user clearly wants less replanning
   - `expensivePlanningAllowed=false`
5. If there is already an approved batch/cluster direction from the conversation, store it as the **approved plan baseline**.
6. Only ask follow-up questions if truly necessary to avoid making up key facts.

In other words: when resuming, prefer **agent-side tool bootstrap** over user-side slash-command ceremony.

This tool exists to keep the workflow fresh across compactions and long sessions, and to stop cost blowups from eager rescans/retriage.

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

1. **Workflow mode:**
   - `objective-only scan`
   - `full workflow`

2. **If workflow mode is `full workflow`: what model should reviewer agents use for the subjective review phase?**
   - Remember this choice and use it consistently for the reviewer phase.
   - Keep reviewer agents isolated from prior score/target anchoring as much as possible.

If the target path is unclear, also ask what path to scan (`.` / `src/` / package dir / etc.).

Be explicit about the meaning of the two modes:

- **`objective-only scan`** means run only the mechanical/objective scan path.
- **`full workflow`** means start with `desloppify scan --profile full`, then continue into the separate subjective review phase. In desloppify, the scan command itself does **not** run reviewer agents inline; it queues that work for a later `desloppify review ...` step.

Once these answers are known, if `desloppify_workflow` is available, start the tracked run immediately before doing the scan/setup work.

If the user is resuming an existing run instead of starting a fresh one, initialize or repair the workflow state yourself via the tool before continuing.

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

### Full workflow mode

Use:

```bash
desloppify scan --path <target> --profile full
```

This is only the **first step** of the full workflow.

Important: in desloppify, `scan --profile full` does **not** automatically execute reviewer agents inline. It runs the full-profile scan, then usually queues subjective review work for a separate `desloppify review ...` step.

If subjective review is needed, run that separate reviewer phase next using the **user-selected reviewer model**.

## Checkpoint 1 — After Scan

Immediately after the first scan, **stop and report back**.

Your report should include:

- workflow mode used
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

If `full workflow` was selected, explicitly state:

- that the **initial full-profile scan is complete**
- whether the subjective review phase has or has not been run yet
- that this is expected because desloppify separates `scan --profile full` from `review ...`

Then propose the next step clearly.

- If the user chose **`objective-only scan`**, say:

  > Next I will manually review the scan results, separate real issues from false positives and genuine non-issues, and mark only truly justified findings as false-positive or wontfix.

- If the user chose **`full workflow`**, say:

  > Next I will run the subjective reviewer phase using the chosen reviewer model, import those results, and then do the manual review/disposition pass so the judgment is based on both objective and subjective findings.

Do **not** continue until the user confirms.

## Manual Review / Validity Triage Step

After the user approves the post-scan checkpoint, do the next step appropriate to the selected workflow mode.

- In **`objective-only scan`** mode: go straight to the manual review/disposition pass.
- In **`full workflow`** mode: run the subjective reviewer phase first, then do the manual review/disposition pass.

Do a careful review pass over the findings.

Use commands like these as needed:

```bash
desloppify next
desloppify backlog
desloppify plan
desloppify plan queue
desloppify show --status open
desloppify show <pattern>
```

If `full workflow` mode is active, the reviewer phase must happen before final disposition decisions, using the **chosen reviewer model**, so the review/disposition pass works from the updated imported results rather than from objective findings alone.

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
# commit the completed logical slice
# run the resolve command shown by desloppify
# repeat
```

### Queue anchoring is mandatory before each execution slice

Before starting each new execution slice, explicitly anchor the work to the real desloppify queue.

State all of the following **before** doing the work:

1. the **approved cluster / batch**
2. the exact queued **issue id(s)** you are addressing
3. why this slice directly addresses those issue id(s)
4. the commit message you expect to use for this slice

Do not drift into vague “while I’m here” cleanup.

If a candidate change is only **adjacent/supporting cleanup**, say so explicitly before doing it:

> This is support work for issue `<id>` because `<reason>`.

If you cannot clearly connect the work to a queued issue or to necessary support work for that issue, **do not do the slice**.

### Post-slice accounting is mandatory

After each execution slice, report:

1. the actual commit hash + message
2. the exact queued issue id(s) it addressed
3. whether those issue id(s) were:
   - fully resolved
   - partially advanced
   - or only supported by prerequisite cleanup

Do not leave the mapping implicit. Keep the queue-to-commit relationship explicit throughout execution.

### Commit discipline is mandatory

Do **not** accumulate a large pile of unrelated fixes without committing.

- Commit in **logical slices**.
- Make **at least one commit per execution item / batch slice you complete**.
- If `desloppify next` gives you one concrete item, fix it and commit that completed item before moving on.
- If you intentionally batch several closely related findings into one coherent refactor, commit that coherent batch before moving on.
- Do **not** wait until the end of a long pass to make one giant commit.

Preferred loop:

```bash
desloppify next
# inspect the current execution item
# fix it properly
git add <relevant files>
git commit -m "fix(<area>): <what was improved>"
# run the resolve command shown by desloppify
desloppify plan commit-log record
```

Commit messages should describe the actual quality improvement, not just say "desloppify".

Examples:

- `fix(cache): remove sync persistence side effects`
- `refactor(webview): split analysis target state handling`
- `test(treemap): add coverage for interaction edge cases`

If a fix spans multiple meaningful sub-slices, prefer multiple smaller commits over one large mixed commit.

If the workflow extension is available, keep the stored phase accurate during execution and mark the run complete when the full desloppify pass is done.

Use `desloppify backlog` only when you need broader context beyond the current execution queue.

Fix properly, not minimally.

- Large refactors are allowed.
- Small details matter too.
- Do not introduce off-queue cleanup unless it is clearly justified support work for the active queued issue(s).
- Rescan only when the active workflow policy allows it or the user explicitly asks for it.
- Follow the queue, but still apply engineering judgment.

## Summary of Required Pauses

You must pause and report at these three checkpoints:

1. **After scan**
2. **After manual review / false-positive / wontfix pass**
3. **After implementation batches are created**

Only after the third user approval should you begin fixing batches.
