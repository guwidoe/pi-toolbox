# @guwidoe/pi-desloppify-workflow

Persistent workflow coordinator extension for supervised `desloppify` runs in pi.

## Features

- Persists active desloppify workflow state in the session without polluting LLM context
- Tracks:
  - mode (`objective-only` or `full`)
  - target path
  - reviewer model
  - reviewer thinking level
  - current workflow phase
  - approved plan baseline
  - plan invalidation reason
  - last plan approval / last rescan timestamps
  - cost-control policy (`cheap` vs `normal`, rescan policy, retriage policy, expensive planning allowed)
- Injects concise phase-aware workflow instructions on every turn while a run is active
- Lets the agent or user:
  - start a run
  - inspect status
  - update reviewer/settings/policies
  - approve or invalidate the current plan baseline
  - record rescans
  - advance phases
  - mark the run complete
  - clear workflow state
- Blocks costly bash patterns like runner-backed `desloppify ... --run-stages` / `--runner ...` unless explicitly allowed
- Stops prompt injection once the run is completed or cleared

## Install

```bash
pi install npm:@guwidoe/pi-desloppify-workflow
```

## Commands

```bash
/desloppify-workflow status
/desloppify-workflow start mode=full target=. reviewerModel=gpt-5.4 reviewerThinking=high executionPolicy=cheap rescanPolicy=batch-boundary retriagePolicy=if-invalidated expensivePlanningAllowed=false
/desloppify-workflow approve-plan baseline="runtime hygiene -> store contracts -> targeted tests"
/desloppify-workflow phase execution
/desloppify-workflow configure rescanPolicy=manual expensivePlanningAllowed=false
/desloppify-workflow invalidate-plan reason="new issue family invalidated the old execution order"
/desloppify-workflow record-rescan note="approved after finishing current batch"
/desloppify-workflow complete note="Run finished"
/desloppify-workflow clear
```

## Tool

The extension also provides an LLM-callable tool:

- `desloppify_workflow`

Use it to keep workflow state fresh across compactions while the `desloppify` skill is active.

## Default posture

The extension defaults to a cost-conscious execution posture:

- `executionPolicy=cheap`
- `rescanPolicy=batch-boundary`
- `retriagePolicy=if-invalidated`
- `expensivePlanningAllowed=false`

That means it prefers continuing with concrete fix slices over repeated rescans, re-triage churn, or expensive runner-backed planning loops.
