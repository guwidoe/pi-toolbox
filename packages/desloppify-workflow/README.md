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
- Injects concise phase-aware workflow instructions on every turn while a run is active
- Lets the agent or user:
  - start a run
  - inspect status
  - update reviewer settings
  - advance phases
  - mark the run complete
  - clear workflow state
- Stops prompt injection once the run is completed or cleared

## Install

```bash
pi install npm:@guwidoe/pi-desloppify-workflow
```

## Commands

```bash
/desloppify-workflow status
/desloppify-workflow start mode=full target=. reviewerModel=gpt-5.4 reviewerThinking=high
/desloppify-workflow phase checkpoint-1
/desloppify-workflow configure reviewerThinking=medium
/desloppify-workflow complete note="Run finished"
/desloppify-workflow clear
```

## Tool

The extension also provides an LLM-callable tool:

- `desloppify_workflow`

Use it to keep workflow state fresh across compactions while the `desloppify` skill is active.
